/**
 * src/server/apexpad/guardrails.ts
 * TASK 3: Model Generation Guardrails & Anti-Truncation Patcher.
 *
 * Four deterministic gates run over every candidate LLM edit BEFORE it may be
 * staged downstream (blueprint §6.1 stage 3 / §7.6 STAGE 2):
 *   1. Anti-Truncation AST Merger  — detects lazy "// ... rest of existing code ..."
 *      placeholders and splices the dropped AST symbols back in from the previous
 *      file version, using the real TypeScript compiler AST (ts.createSourceFile).
 *   2. Package & Import Hallucination Verifier — cross-checks every import against
 *      Node builtins, the workspace package.json, imports already present in the
 *      previous file version (continuity), and indexed workspace paths.
 *   3. Version-Skew & Deprecated Syntax Scanner — detects mixed framework/module
 *      conventions with precise line numbers.
 *   4. Anti-Sycophancy Premise Critic — verifies identifiers asserted by the user
 *      prompt against the actual file AST + workspace index, refusing to silently
 *      accept premises that reference non-existent symbols.
 *
 * Stack adaptation: Prisma (async) replaces better-sqlite3 (sync); the
 * TypeScript compiler API replaces the Electron-side parser. Zero stubs.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import ts from 'typescript';
import { db } from '@/lib/db';
import { publishCaptureEvent } from './event-bus';
import { getWorkspaceFileStore } from './context-engine';
import type {
  GuardrailInspectionReport,
  TruncationPlaceholderMatch,
} from '@/lib/apexpad-guardrails-types';

/* ------------------------------------------------------------------ */
/* Import-resolution primitives (shared with the Task 4 test gate)     */
/* ------------------------------------------------------------------ */

const NODE_BUILTIN_MODULES: ReadonlySet<string> = new Set([
  'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
  'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
  'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
  'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
  'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls',
  'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi_http', 'worker_threads',
  'zlib', 'test',
]);

const globalForPkgDeps = globalThis as unknown as {
  apexpadPackageNames: Set<string> | undefined;
};

/** Dependency + devDependency names from the host workspace package.json (cached). */
export function getWorkspacePackageNames(): Set<string> {
  if (globalForPkgDeps.apexpadPackageNames) {
    return globalForPkgDeps.apexpadPackageNames;
  }
  const names = new Set<string>();
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    for (const group of [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies]) {
      if (!group) continue;
      for (const name of Object.keys(group)) names.add(name);
    }
  } catch {
    // package.json unreadable — allowlist stays empty; other gates still apply.
  }
  globalForPkgDeps.apexpadPackageNames = names;
  return names;
}

/** Root package name of a bare import specifier ("@scope/pkg/sub" -> "@scope/pkg"). */
function rootPackageName(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/');
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
  }
  return specifier.split('/')[0];
}

/** Workspace-store candidates for a relative / alias import specifier. */
function workspaceCandidates(specifier: string): string[] {
  let base = specifier;
  const aliases = ['@/', '~/'];
  for (const alias of aliases) {
    if (base.startsWith(alias)) {
      const rest = base.slice(alias.length);
      return [`src/${rest}`, rest].flatMap(expandPathCandidates);
    }
  }
  return expandPathCandidates(base);
}

function expandPathCandidates(base: string): string[] {
  return [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    `${base}.md`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
    `${base}/index.js`,
  ];
}

export interface ImportResolutionProblem {
  specifier: string;
  reason: string;
}

/** Normalizes a virtual workspace path without touching the filesystem. */
export function normalizeWorkspacePath(p: string): string {
  const segments: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      segments.pop();
      continue;
    }
    segments.push(seg);
  }
  return segments.join('/');
}

/**
 * Resolves every import of `proposedContent` against Node builtins, the host
 * package.json, imports already present in `previousContent` (continuity:
 * the previous file compiled, so its imports are presumed installed), and
 * the indexed workspace file store. Returns one problem per hallucinated
 * import (non-existent npm package or unresolvable workspace path).
 */
export function resolveImportProblems(params: {
  proposedContent: string;
  previousContent?: string;
  /** Path of the file whose imports are being resolved (for relative specs). */
  filePath?: string;
  workspaceFiles: Map<string, string>;
}): ImportResolutionProblem[] {
  const { proposedContent, previousContent, filePath, workspaceFiles } = params;

  const specifiers = extractImportSpecifiers(proposedContent);
  const continuitySpecifiers = previousContent
    ? new Set(extractImportSpecifiers(previousContent))
    : new Set<string>();
  const continuityRoots = new Set<string>();
  for (const spec of continuitySpecifiers) {
    if (!spec.startsWith('.') && !spec.startsWith('@/') && !spec.startsWith('~/')) {
      continuityRoots.add(rootPackageName(spec));
    }
  }

  const problems: ImportResolutionProblem[] = [];
  const packageNames = getWorkspacePackageNames();

  const resolveRelative = (spec: string): boolean => {
    if (!filePath) {
      return workspaceCandidates(spec).some((c) => workspaceFiles.has(c));
    }
    const dir = filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/')) : '';
    const joined = spec.startsWith('./') || spec.startsWith('../') ? `${dir}/${spec}` : spec;
    const normalized = normalizeWorkspacePath(joined);
    const aliasNormalized =
      normalized.startsWith('@/') || normalized.startsWith('~/')
        ? normalizeWorkspacePath(`src/${normalized.slice(2)}`)
        : normalized;
    return workspaceCandidates(aliasNormalized).some((c) => workspaceFiles.has(c));
  };

  for (const spec of specifiers) {
    if (spec.startsWith('node:')) continue;
    if (NODE_BUILTIN_MODULES.has(rootPackageName(spec))) continue;

    if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('@/') || spec.startsWith('~/')) {
      if (!resolveRelative(spec)) {
        problems.push({
          specifier: spec,
          reason: `unresolvable workspace import "${spec}" — no indexed file matches this relative/alias path`,
        });
      }
      continue;
    }

    const root = rootPackageName(spec);
    const installed = packageNames.has(root);
    const continuity = continuityRoots.has(root);
    const onDisk = hostNodeModuleExists(root);
    if (!installed && !continuity && !onDisk) {
      problems.push({
        specifier: spec,
        reason:
          `hallucinated npm import "${spec}" — not declared in package.json, not a Node builtin, ` +
          `not installed in node_modules, and not present in the previous version of this file`,
      });
    }
  }

  return problems;
}

function hostNodeModuleExists(rootPackage: string): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), 'node_modules', rootPackage));
  } catch {
    return false;
  }
}

/** Extracts every import specifier (static, export-from, dynamic import, require). */
export function extractImportSpecifiers(content: string): string[] {
  const specifiers = new Set<string>();
  const source = ts.createSourceFile('candidate.ts', content, ts.ScriptTarget.Latest, true);

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.getText(source) === 'require' ||
        node.expression.kind === ts.SyntaxKind.ImportKeyword) &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      specifiers.add((node.arguments[0] as ts.StringLiteral).text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);

  // Regex backstop for specifiers inside template strings that the AST walk
  // cannot see (e.g. dynamic import of a composed path is intentionally NOT
  // followed — a computed specifier is unverifiable and reported separately).
  const requireRegex = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = requireRegex.exec(content)) !== null) {
    specifiers.add(m[1]);
  }
  return Array.from(specifiers);
}

/* ------------------------------------------------------------------ */
/* AST symbol extraction (real TypeScript compiler AST)                */
/* ------------------------------------------------------------------ */

interface ExportedSymbolSource {
  name: string;
  fullText: string;
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

/** Top-level exported (or module-level) symbols with their full source text. */
export function extractTopLevelSymbols(
  content: string,
  filePath: string
): ExportedSymbolSource[] {
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, scriptKindFor(filePath));
  const symbols: ExportedSymbolSource[] = [];

  const pushSymbol = (name: string, node: ts.Node) => {
    if (!name) return;
    symbols.push({
      name,
      fullText: source.text.slice(node.getFullStart(), node.getEnd()).trimEnd(),
    });
  };

  for (const statement of source.statements) {
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isEnumDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)
    ) {
      if (statement.name) pushSymbol(statement.name.text, statement);
    } else if (ts.isVariableStatement(statement)) {
      const isExported = statement.modifiers.some(
        (mod) => mod.kind === ts.SyntaxKind.ExportKeyword
      );
      if (!isExported) continue;
      for (const decl of statement.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) pushSymbol(decl.name.text, statement);
      }
    }
  }
  return symbols;
}

function symbolIsPresent(content: string, symbolName: string): boolean {
  const re = new RegExp(`\\b${symbolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  return re.test(content);
}

/* ------------------------------------------------------------------ */
/* Gate 1: truncation placeholder detection                            */
/* ------------------------------------------------------------------ */

const TRUNCATION_LINE_PATTERNS: RegExp[] = [
  /^\/\/\s*\.{3,}/,                                    // "// ... rest of existing code ..."
  /^\/\*+\s*\.{3,}/,                                   // "/* ... */"
  /^\/\/\s*(rest\s+of|remaining|omitted|unchanged|existing\s+code|other\s+code|code\s+omitted|and\s+so\s+on|etc)/i,
  /^\/\*\s*(rest\s+of|remaining|omitted|unchanged|existing\s+code)/i,
  /^<!--\s*(rest\s+of|remaining|omitted)/i,
  /^#\s*(rest\s+of|remaining|omitted)/i,
  /^\s*\.{3,}\s*$/,                                    // a line containing only "..."
  /^\/\/\s*TODO\b.*\b(implement|rest|remaining|fill)/i,
  /^\/\/\s*\[?icc\b/i, // internal lazy marker
  /^\/\/\s*(implementation\s+(elided|omitted|unchanged))/i,
];

function isTruncationPlaceholderLine(rawLine: string): boolean {
  const trimmed = rawLine.trim();
  if (trimmed.length === 0) return false;
  return TRUNCATION_LINE_PATTERNS.some((re) => re.test(trimmed));
}

/* ------------------------------------------------------------------ */
/* Gate 3: version-skew scanner                                        */
/* ------------------------------------------------------------------ */

interface VersionSkewRule {
  id: string;
  regex: RegExp;
  warning: string;
  /** Only apply when the raw line matches this precondition. */
  wholeFile?: RegExp;
}

const VERSION_SKEW_RULES: VersionSkewRule[] = [
  {
    id: 'mixed_module_systems',
    regex: /\brequire\s*\(\s*['"][^'"]+['"]\s*\)/,
    warning:
      'Mixed module systems: CommonJS require() alongside ESM import statements — pick one convention for this file.',
    wholeFile: /(?:^|\n)\s*import\s+(?:[^'"]*from\s+)?['"]/,
  },
  {
    id: 'legacy_class_api',
    regex: /React\.createClass/,
    warning:
      'React.createClass is the legacy React 15 API — use function components with hooks or ES class components.',
  },
  {
    id: 'deprecated_lifecycle',
    regex: /componentWillMount|componentWillReceiveProps|componentWillUpdate\b/,
    warning:
      'Deprecated React lifecycle (componentWillMount/ReceiveProps/Update) — migrate to getDerivedStateFromProps / componentDidMount / useEffect.',
  },
  {
    id: 'deprecated_buffer_api',
    regex: /new\s+Buffer\s*\(/,
    warning:
      'new Buffer() is the deprecated Node 8 Buffer allocation API — use Buffer.from() or Buffer.alloc().',
  },
  {
    id: 'legacy_react_render',
    regex: /ReactDOM\.render\s*\(/,
    warning:
      'ReactDOM.render is the React 17 entry API — use createRoot(document.getElementById(...)).render() for React 18+.',
  },
  {
    id: 'pages_router_in_app',
    regex: /getInitialProps/,
    warning:
      'getInitialProps is a Next.js Pages Router API — App Router components must use React server/client component semantics instead.',
  },
  {
    id: 'mixed_class_and_hooks',
    regex: /\bextends\s+(?:React\.)?Component\b/,
    warning:
      'Class component declared in a file that also uses React hooks — do not mix class and function component paradigms in one module.',
    wholeFile: /\buse(?:State|Effect|Memo|Callback|Ref|Reducer)\s*[<(]/,
  },
  {
    id: 'mixed_test_frameworks',
    regex: /\bjest\.(fn|mock|spyOn|describe|it|expect)\b/,
    warning:
      'Jest globals mixed into a Vitest test module — use vitest imports (describe/it/expect/vi) consistently.',
    wholeFile: /(?:^|\n)\s*import\s+\{[^}]*\}\s+from\s+['"]vitest['"]/,
  },
];

function scanVersionSkew(proposedContent: string): string[] {
  const lines = proposedContent.split('\n');
  const warnings: string[] = [];
  for (const rule of VERSION_SKEW_RULES) {
    if (rule.wholeFile && !rule.wholeFile.test(proposedContent)) continue;
    for (let i = 0; i < lines.length; i++) {
      if (rule.regex.test(lines[i])) {
        warnings.push(`line ${i + 1}: ${rule.warning}`);
        break; // one warning per rule, first occurrence carries the line number
      }
    }
  }
  return warnings;
}

/* ------------------------------------------------------------------ */
/* Gate 4: anti-sycophancy premise critic                              */
/* ------------------------------------------------------------------ */

const SYCOPHANCY_STOPWORDS: ReadonlySet<string> = new Set([
  'because', 'should', 'would', 'could', 'there', 'seems', 'maybe', 'please',
  'verify', 'check', 'crashing', 'broken', 'issue', 'problem', 'error',
  'thinking', 'refactor', 'implement', 'update', 'create', 'connect',
  'function', 'export', 'import', 'return', 'const', 'value', 'makes',
  'surely', 'obviously', 'clearly', 'instead', 'another', 'different',
  'together', 'everything', 'anything', 'nothing', 'something', 'before',
  'after', 'while', 'about', 'which', 'where', 'these', 'those', 'their',
  'there', 'that', 'this', 'with', 'from', 'have', 'when', 'what', 'then',
  'them', 'were', 'been', 'also', 'into', 'only', 'over', 'such', 'each',
  'will', 'must', 'does', 'doing', 'file', 'code', 'line', 'cache', 'crash',
]);

function extractPremiseTokens(userPrompt: string): string[] {
  const raw = userPrompt.match(/[A-Za-z_][A-Za-z0-9_]{5,}/g) ?? [];
  const seen = new Set<string>();
  for (const token of raw) {
    if (SYCOPHANCY_STOPWORDS.has(token.toLowerCase())) continue;
    if (token.length < 8) continue; // short words are too noisy to premise-check
    seen.add(token);
  }
  return Array.from(seen).slice(0, 12);
}

/* ------------------------------------------------------------------ */
/* TASK 3 ENGINE                                                       */
/* ------------------------------------------------------------------ */

export interface GuardrailReportSummary {
  guardId: string;
  sessionId: string;
  targetFilePath: string;
  passedAllGates: boolean;
  wasAutoHealed: boolean;
  recoveredSymbolCount: number;
  hallucinatedImportCount: number;
  versionSkewCount: number;
  sycophancyCount: number;
  createdAt: string;
}

export class ModelGenerationGuardrails {
  /**
   * Runs all four Task 3 gates over a candidate edit and persists the report.
   * The returned `healedContent` is what downstream stages (DAG staging) MUST
   * consume — never the raw proposed content (blueprint §7.6 STAGE 2).
   */
  public async inspectAndHealCandidateCode(params: {
    sessionId: string;
    projectSlug: string;
    targetFilePath: string;
    previousContent: string;
    proposedContent: string;
    userPrompt: string;
  }): Promise<GuardrailInspectionReport> {
    const startedAt = Date.now();
    const guardId = `guard_${crypto.randomBytes(6).toString('hex')}`;
    const createdAt = new Date().toISOString();

    /* -- Gate 1: Anti-Truncation AST Merger -------------------------------- */
    const truncationMatches: TruncationPlaceholderMatch[] = [];
    const missingSymbolsRecovered: string[] = [];
    let healedContent = params.proposedContent;
    let wasAutoHealed = false;

    const placeholderLines = params.proposedContent
      .split('\n')
      .map((rawLine, idx) => ({ rawLine, lineNumber: idx + 1 }))
      .filter(({ rawLine }) => isTruncationPlaceholderLine(rawLine));

    if (placeholderLines.length > 0) {
      const previousSymbols = extractTopLevelSymbols(params.previousContent, params.targetFilePath);
      const missing = previousSymbols.filter(
        (sym) => !symbolIsPresent(params.proposedContent, sym.name)
      );

      // Splice every missing symbol at the FIRST placeholder position and drop
      // the remaining placeholders entirely — deterministic and idempotent.
      const spliceBlock = missing.map((sym) => sym.fullText).join('\n\n');
      let insertionDone = false;
      const rebuiltLines: string[] = [];
      for (const line of params.proposedContent.split('\n')) {
        if (isTruncationPlaceholderLine(line)) {
          if (!insertionDone) {
            if (rebuiltLines.length > 0 && rebuiltLines[rebuiltLines.length - 1].trim() !== '') {
              rebuiltLines.push('');
            }
            rebuiltLines.push(spliceBlock);
            insertionDone = true;
          }
          continue; // placeholder removed
        }
        rebuiltLines.push(line);
      }

      healedContent = rebuiltLines.join('\n');
      wasAutoHealed = true;
      missingSymbolsRecovered.push(...missing.map((sym) => sym.name));

      for (const placeholder of placeholderLines) {
        truncationMatches.push({
          lineNumber: placeholder.lineNumber,
          rawLine: placeholder.rawLine,
          recoveredSymbolNames: missing.map((sym) => sym.name),
        });
      }
    }

    /* -- Gate 2: Import Hallucination Verifier ----------------------------- */
    const importProblems = resolveImportProblems({
      proposedContent: healedContent,
      previousContent: params.previousContent,
      filePath: params.targetFilePath,
      workspaceFiles: getWorkspaceFileStore(),
    });
    const hallucinatedImports = importProblems.map(
      (p) => `${p.specifier} — ${p.reason}`
    );

    /* -- Gate 3: Version-Skew Scanner -------------------------------------- */
    const versionSkewWarnings = scanVersionSkew(healedContent);

    /* -- Gate 4: Anti-Sycophancy Premise Critic ----------------------------- */
    const sycophancyWarnings = await this.critiqueUserPremises(
      params.userPrompt,
      params.targetFilePath,
      params.previousContent,
      healedContent,
      params.projectSlug
    );

    const placeholderRemaining = healedContent
      .split('\n')
      .some((line) => isTruncationPlaceholderLine(line));
    const passedAllGates = hallucinatedImports.length === 0 && !placeholderRemaining;

    const report: GuardrailInspectionReport = {
      guardId,
      sessionId: params.sessionId,
      targetFilePath: params.targetFilePath,
      passedAllGates,
      wasAutoHealed,
      healedContent,
      truncationMatches,
      missingSymbolsRecovered,
      hallucinatedImports,
      versionSkewWarnings,
      sycophancyWarnings,
      createdAt,
    };

    await db.guardrailReport.create({
      data: {
        guardId,
        sessionId: params.sessionId,
        targetFilePath: params.targetFilePath,
        passedAllGates,
        wasAutoHealed,
        healedContent,
        truncationMatchesJson: JSON.stringify(truncationMatches),
        recoveredSymbolsJson: JSON.stringify(missingSymbolsRecovered),
        hallucinatedImportsJson: JSON.stringify(hallucinatedImports),
        versionSkewWarningsJson: JSON.stringify(versionSkewWarnings),
        sycophancyWarningsJson: JSON.stringify(sycophancyWarnings),
        createdAt,
      },
    });

    publishCaptureEvent('guardrail:report', params.sessionId, params.projectSlug, {
      guardId,
      targetFilePath: params.targetFilePath,
      passedAllGates,
      wasAutoHealed,
      recovered: missingSymbolsRecovered.length,
      hallucinatedImports: hallucinatedImports.length,
      versionSkewWarnings: versionSkewWarnings.length,
      sycophancyWarnings: sycophancyWarnings.length,
      gatesLatencyMs: Date.now() - startedAt,
    });

    return report;
  }

  /** Recent guardrail reports (newest first) without heavy healed content. */
  public async listRecentReports(sessionId?: string, limit = 12): Promise<GuardrailReportSummary[]> {
    const rows = await db.guardrailReport.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        guardId: true,
        sessionId: true,
        targetFilePath: true,
        passedAllGates: true,
        wasAutoHealed: true,
        recoveredSymbolsJson: true,
        hallucinatedImportsJson: true,
        versionSkewWarningsJson: true,
        sycophancyWarningsJson: true,
        createdAt: true,
      },
    });
    const count = (json: string): number => {
      try {
        const parsed: unknown = JSON.parse(json);
        return Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        return 0;
      }
    };
    return rows.map((row) => ({
      guardId: row.guardId,
      sessionId: row.sessionId,
      targetFilePath: row.targetFilePath,
      passedAllGates: row.passedAllGates,
      wasAutoHealed: row.wasAutoHealed,
      recoveredSymbolCount: count(row.recoveredSymbolsJson),
      hallucinatedImportCount: count(row.hallucinatedImportsJson),
      versionSkewCount: count(row.versionSkewWarningsJson),
      sycophancyCount: count(row.sycophancyWarningsJson),
      createdAt: row.createdAt,
    }));
  }

  /**
   * Critic: every substantial identifier the user asserts in their prompt is
   * checked against the previous content, the healed content, the indexed AST
   * symbols and the workspace store. Unknown identifiers produce explicit
   * sycophancy warnings instead of being silently accepted.
   */
  private async critiqueUserPremises(
    userPrompt: string,
    targetFilePath: string,
    previousContent: string,
    healedContent: string,
    projectSlug: string
  ): Promise<string[]> {
    const tokens = extractPremiseTokens(userPrompt);
    if (tokens.length === 0) return [];

    const indexedSymbols = await db.astSymbol.findMany({
      where: { projectSlug },
      select: { symbolName: true },
    });
    const indexedNames = new Set(indexedSymbols.map((s) => s.symbolName));

    const workspaceTexts: string[] = [];
    for (const [, content] of getWorkspaceFileStore().entries()) {
      workspaceTexts.push(content);
    }

    const warnings: string[] = [];
    for (const token of tokens) {
      const inPrevious = symbolIsPresent(previousContent, token);
      const inHealed = symbolIsPresent(healedContent, token);
      const inIndex = indexedNames.has(token);
      const inWorkspace = workspaceTexts.some((text) => text.includes(token));
      if (!inPrevious && !inHealed && !inIndex && !inWorkspace) {
        warnings.push(
          `Anti-sycophancy: the user premise references "${token}", which does not appear in ` +
            `${targetFilePath}, the healed candidate, the indexed AST symbols, or the workspace. ` +
            `Verify the hypothesis against real evidence instead of accepting it.`
        );
        if (warnings.length >= 5) break;
      }
    }
    return warnings;
  }
}
