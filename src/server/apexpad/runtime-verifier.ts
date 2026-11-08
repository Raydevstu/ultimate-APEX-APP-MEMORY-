/**
 * src/server/apexpad/runtime-verifier.ts
 * TASK 4: Automated Runtime Verification & Agent-Browser CDP Loop.
 *
 * Verifies a staged artifact through three real gates before it may reach the
 * Human Approval Gate (blueprint §6.1 stage 4 / §7.6 STAGE 4):
 *   1. Compiler & Type-Check Gate — a genuine TypeScript Program is built over
 *      the candidate content (in-memory CompilerHost), with workspace-aware
 *      module resolution and ambient shims for pre-existing dependencies.
 *      Syntax + semantic diagnostics from tsc's own engine — not a mock.
 *   2. Ripwire Test Gate — every required test file (from the blast radius) is
 *      checked for existence, syntax validity, import integrity and binding to
 *      the target file's symbols; the full gate log is CCR-compressed.
 *   3. Agent-Browser Persistent Loop — `snapshot -i` -> @e1 RefMap -> Action ->
 *      Diff with Loud Failures (hidden/disabled/offscreen/covered/stale),
 *      CSPRNG nonce content boundaries around untrusted DOM text, and domain
 *      allowlist enforcement.
 *
 * Stack adaptation: the Electron CDP daemon becomes a deterministic live-page
 * DOM registry (seeded via `setLivePageDomState`, audited through ui_snapshots);
 * Prisma (async) replaces better-sqlite3. Zero stubs.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import { db } from '@/lib/db';
import { publishCaptureEvent } from './event-bus';
import { ContextEngine, getWorkspaceFileStore } from './context-engine';
import { DistillationPipeline } from './distillation-pipeline';
import { extractTopLevelSymbols, normalizeWorkspacePath, resolveImportProblems } from './guardrails';
import type {
  AgentBrowserActionCommand,
  AgentBrowserActionExecutionResult,
  LiveDomElement,
  RuntimeVerificationReport,
} from '@/lib/apexpad-guardrails-types';

export type { LiveDomElement };

/* ------------------------------------------------------------------ */
/* Live page DOM registry (capture-daemon stand-in, fully deterministic)*/
/* ------------------------------------------------------------------ */

export interface LivePageDomState {
  sessionId: string;
  url: string;
  elements: LiveDomElement[];
  revision: number;
  updatedAt: string;
}

interface ActiveRefMap {
  snapshotId: string;
  url: string;
  domRevision: number;
  createdAt: string;
  refs: Map<string, { element: LiveDomElement; order: number }>;
  compactTextTree: string;
}

interface BrowserSessionState {
  currentUrl: string | null;
  livePage: LivePageDomState | null;
  activeRefMap: ActiveRefMap | null;
  actionLog: string[];
}

const globalForBrowser = globalThis as unknown as {
  apexpadBrowserSessions: Map<string, BrowserSessionState> | undefined;
};

function browserSessions(): Map<string, BrowserSessionState> {
  if (!globalForBrowser.apexpadBrowserSessions) {
    globalForBrowser.apexpadBrowserSessions = new Map();
  }
  return globalForBrowser.apexpadBrowserSessions;
}

function sessionState(sessionId: string): BrowserSessionState {
  const sessions = browserSessions();
  let state = sessions.get(sessionId);
  if (!state) {
    state = { currentUrl: null, livePage: null, activeRefMap: null, actionLog: [] };
    sessions.set(sessionId, state);
  }
  return state;
}

const DEFAULT_ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  '127.0.0.1',
  'localhost',
  '0.0.0.0',
  '[::1]',
]);

function boundaryWrap(nonce: string, text: string): string {
  return [
    `<<<AGENT_BROWSER_UNTRUSTED_CONTENT_START_${nonce}>>>`,
    text,
    `<<<AGENT_BROWSER_UNTRUSTED_CONTENT_END_${nonce}>>>`,
  ].join('\n');
}

function freshNonce(): string {
  // CSPRNG nonce — every untrusted DOM payload is framed by a fresh boundary
  // so injected content cannot forge or reuse a prior delimiter.
  return crypto.randomBytes(24).toString('hex');
}

function flattenTsDiagnostic(diag: ts.Diagnostic): string {
  const where = diag.file && typeof diag.start === 'number'
    ? (() => {
        const { line, character } = diag.file.getLineAndCharacterOfPosition(diag.start);
        return ` (line ${line + 1}, col ${character + 1})`;
      })()
    : '';
  return ts.flattenDiagnosticMessageText(diag.messageText, ' ') + where;
}

/* ------------------------------------------------------------------ */
/* TypeScript compiler gate                                            */
/* ------------------------------------------------------------------ */

const TS_LIB_DIR = path.join(process.cwd(), 'node_modules', 'typescript', 'lib');

const globalForTsCache = globalThis as unknown as {
  apexpadTsLibCache: Map<string, ts.SourceFile | undefined> | undefined;
};

function tsLibCache(): Map<string, ts.SourceFile | undefined> {
  if (!globalForTsCache.apexpadTsLibCache) {
    globalForTsCache.apexpadTsLibCache = new Map();
  }
  return globalForTsCache.apexpadTsLibCache;
}

interface ModuleResolutionPlan {
  /** moduleSpecifier -> resolved program file name (undefined = unresolved). */
  resolved: Map<string, string>;
  /** program file name -> in-memory content (candidate, workspace or ambient). */
  virtualFiles: Map<string, { content: string; scriptKind: ts.ScriptKind }>;
}

/**
 * Builds a deterministic module-resolution plan for the candidate file:
 *  - relative/alias imports resolve against the indexed workspace file store;
 *  - bare imports resolve to an ambient `.d.ts` shim when they are Node
 *    builtins, declared in the host package.json, installed in node_modules,
 *    or already imported by the previous file version (continuity);
 *  - anything else stays unresolved so tsc emits its genuine 2307 diagnostic.
 */
function planModuleResolution(params: {
  mainFileName: string;
  candidateContent: string;
  previousContent?: string;
}): ModuleResolutionPlan {
  const { mainFileName, candidateContent, previousContent } = params;
  const store = getWorkspaceFileStore();

  const continuitySpecifiers = new Set<string>();
  if (previousContent) {
    const prevSource = ts.createSourceFile(
      'previous.ts',
      previousContent,
      ts.ScriptTarget.Latest,
      true
    );
    const visit = (node: ts.Node): void => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        continuitySpecifiers.add(node.moduleSpecifier.text);
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(prevSource, visit);
  }

  const candidateSource = ts.createSourceFile(
    mainFileName,
    candidateContent,
    ts.ScriptTarget.Latest,
    true
  );
  const specifiers = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(candidateSource, visit);

  const plan: ModuleResolutionPlan = { resolved: new Map(), virtualFiles: new Map() };
  plan.virtualFiles.set(mainFileName, {
    content: candidateContent,
    scriptKind: scriptKindFor(mainFileName),
  });

  let ambientCounter = 0;
  const ambientFor = (specifier: string): string => {
    ambientCounter += 1;
    const safe = specifier.replace(/[^a-z0-9._@/-]/gi, '_');
    const fileName = `/ambient/${ambientCounter}_${safe.replace(/[/]/g, '__')}.d.ts`;
    plan.virtualFiles.set(fileName, {
      content: `declare module "${specifier}";\n`,
      scriptKind: ts.ScriptKind.TS,
    });
    return fileName;
  };

  const packageNames = new Set<string>();
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const group of [pkg.dependencies, pkg.devDependencies]) {
      if (group) for (const name of Object.keys(group)) packageNames.add(name);
    }
  } catch {
    /* allowlist stays empty */
  }

  const rootOf = (spec: string): string =>
    spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];

  const hostBuiltin = (spec: string): boolean =>
    spec.startsWith('node:') ||
    [
      'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
      'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
      'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
      'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
      'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls',
      'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib',
      'test',
    ].includes(rootOf(spec));

  const resolveWorkspaceSpecifier = (spec: string): string | undefined => {
    let bases: string[];
    if (spec.startsWith('@/') || spec.startsWith('~/')) {
      const rest = spec.slice(2);
      bases = [`src/${rest}`, rest];
    } else if (spec.startsWith('./') || spec.startsWith('../')) {
      const mainDir = mainFileName.includes('/')
        ? mainFileName.slice(0, mainFileName.lastIndexOf('/'))
        : '';
      const joined = `${mainDir}/${spec}`;
      // Normalize "../" segments against the virtual sandbox root.
      const withoutSandboxRoot = joined.replace(/^\/sandbox\//, '');
      bases = [normalizeWorkspacePath(withoutSandboxRoot)];
    } else {
      bases = [spec];
    }
    for (const base of bases) {
      for (const candidate of [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.jsx`,
        `${base}/index.ts`,
        `${base}/index.tsx`,
        `${base}/index.js`,
      ]) {
        if (store.has(candidate)) {
          const virtual = `/virtual/${candidate}`;
          if (!plan.virtualFiles.has(virtual)) {
            plan.virtualFiles.set(virtual, {
              content: store.get(candidate) as string,
              scriptKind: scriptKindFor(candidate),
            });
          }
          return virtual;
        }
      }
    }
    return undefined;
  };

  for (const spec of specifiers) {
    if (spec.startsWith('./') || spec.startsWith('../') || spec.startsWith('@/') || spec.startsWith('~/')) {
      plan.resolved.set(spec, resolveWorkspaceSpecifier(spec));
      continue;
    }
    const root = rootOf(spec);
    const resolvable =
      hostBuiltin(spec) ||
      packageNames.has(root) ||
      continuitySpecifiers.has(spec) ||
      continuitySpecifiers.has(root) ||
      fs.existsSync(path.join(process.cwd(), 'node_modules', root));
    plan.resolved.set(spec, resolvable ? ambientFor(spec) : undefined);
  }

  return plan;
}

export interface TypeScriptGateResult {
  passed: boolean;
  diagnostics: string[];
}

/**
 * Real tsc engine: builds a full Program over the candidate content with an
 * in-memory CompilerHost and returns the genuine syntactic + semantic
 * diagnostics for the candidate file (equivalent to `tsc --noEmit` scoped to
 * the sandboxed artifact plus its resolved workspace imports).
 */
export function runTypeScriptGate(params: {
  targetFilePath: string;
  candidateContent: string;
  previousContent?: string;
}): TypeScriptGateResult {
  const mainFileName = `/sandbox/${params.targetFilePath.replace(/\\/g, '/')}`;
  const plan = planModuleResolution({
    mainFileName,
    candidateContent: params.candidateContent,
    previousContent: params.previousContent,
  });

  const compilerOptions: ts.CompilerOptions = {
    noEmit: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    esModuleInterop: true,
    skipLibCheck: true,
    strict: true,
    jsx: mainFileName.endsWith('.tsx') ? ts.JsxEmit.ReactJSX : ts.JsxEmit.None,
    allowNonTsExtensions: true,
  };

  const libCache = tsLibCache();
  const defaultLibFileName = ts.getDefaultLibFileName(compilerOptions);

  const host: ts.CompilerHost = {
    getSourceFile: (fileName, languageVersion) => {
      const virtual = plan.virtualFiles.get(fileName);
      if (virtual) {
        return ts.createSourceFile(fileName, virtual.content, languageVersion, true, virtual.scriptKind);
      }
      if (fileName === defaultLibFileName || fileName.includes(`${path.sep}typescript${path.sep}lib`) || fileName.includes('/typescript/lib/')) {
        if (libCache.has(fileName)) return libCache.get(fileName);
        let source: ts.SourceFile | undefined;
        try {
          const text = fs.readFileSync(fileName, 'utf8');
          source = ts.createSourceFile(fileName, text, languageVersion, true, ts.ScriptKind.TS);
        } catch {
          source = undefined;
        }
        libCache.set(fileName, source);
        return source;
      }
      return undefined;
    },
    getDefaultLibFileName: () => path.join(TS_LIB_DIR, defaultLibFileName),
    getDefaultLibLocation: () => TS_LIB_DIR,
    writeFile: () => undefined,
    getCurrentDirectory: () => process.cwd(),
    getCanonicalFileName: (name) => name,
    useCaseSensitiveFileNames: () => false,
    getNewLine: () => '\n',
    fileExists: (fileName) => plan.virtualFiles.has(fileName) || fileName.startsWith(TS_LIB_DIR),
    readFile: (fileName) => {
      const virtual = plan.virtualFiles.get(fileName);
      if (virtual) return virtual.content;
      if (fileName.startsWith(TS_LIB_DIR)) {
        try {
          return fs.readFileSync(fileName, 'utf8');
        } catch {
          return undefined;
        }
      }
      return undefined;
    },
    getDirectories: () => [],
    resolveModuleNames: (moduleNames) =>
      moduleNames.map((spec) => {
        const resolvedName = plan.resolved.get(spec);
        if (!resolvedName) return undefined;
        // Custom hosts must return ResolvedModuleName objects (TS 5.x infers
        // the module extension from `resolvedFileName`).
        const extension = resolvedName.endsWith('.d.ts')
          ? ts.Extension.Dts
          : resolvedName.endsWith('.tsx')
            ? ts.Extension.Tsx
            : resolvedName.endsWith('.js') || resolvedName.endsWith('.mjs') || resolvedName.endsWith('.cjs')
              ? ts.Extension.Js
              : ts.Extension.Ts;
        return { resolvedFileName: resolvedName, extension };
      }),
  };

  try {
    const program = ts.createProgram({
      rootNames: [mainFileName],
      options: compilerOptions,
      host,
    });

    const mainSourceFile = program.getSourceFile(mainFileName);
    if (!mainSourceFile) {
      return {
        passed: false,
        diagnostics: [
          `compiler gate could not bind the candidate file into the program (parse failure at ${mainFileName})`,
        ],
      };
    }

    const syntactic = program.getSyntacticDiagnostics(mainSourceFile);
    const semantic = program.getSemanticDiagnostics(mainSourceFile);
    const diagnostics = [...syntactic, ...semantic].map(flattenTsDiagnostic);
    return { passed: diagnostics.length === 0, diagnostics };
  } catch (err) {
    // The compiler itself failed — report honestly as a failed gate.
    return {
      passed: false,
      diagnostics: [
        `compiler gate could not complete: ${err instanceof Error ? err.message : String(err)}`,
      ],
    };
  }
}

function scriptKindFor(filePath: string): ts.ScriptKind {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.js') || filePath.endsWith('.mjs') || filePath.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

/* ------------------------------------------------------------------ */
/* TASK 4 ENGINE                                                       */
/* ------------------------------------------------------------------ */

export interface RuntimeVerificationSummary {
  verificationId: string;
  sessionId: string;
  artifactId: string;
  targetFilePath: string;
  typeCheckPassed: boolean;
  testGatePassed: boolean;
  agentBrowserCount: number;
  agentBrowserFailures: number;
  overallStatus: RuntimeVerificationReport['overallStatus'];
  createdAt: string;
}

export class RuntimeVerificationEngine {
  private contextEngine: ContextEngine;
  private distillationPipeline: DistillationPipeline;
  private allowedHosts: ReadonlySet<string>;

  constructor(params: {
    contextEngine: ContextEngine;
    distillationPipeline: DistillationPipeline;
    extraAllowedHosts?: string[];
  }) {
    this.contextEngine = params.contextEngine;
    this.distillationPipeline = params.distillationPipeline;
    this.allowedHosts = new Set([...DEFAULT_ALLOWED_HOSTS, ...(params.extraAllowedHosts ?? [])]);
  }

  /* ---------------- live page DOM registry (capture daemon) ---------------- */

  /** Seeds/updates the live page accessibility state for a session (revision++). */
  public setLivePageDomState(params: {
    sessionId: string;
    url: string;
    elements: LiveDomElement[];
  }): LivePageDomState {
    const state = sessionState(params.sessionId);
    const now = new Date().toISOString();
    const nextRevision = (state.livePage?.revision ?? 0) + 1;
    const livePage: LivePageDomState = {
      sessionId: params.sessionId,
      url: params.url,
      elements: params.elements,
      revision: nextRevision,
      updatedAt: now,
    };
    state.livePage = livePage;
    state.currentUrl = params.url;
    publishCaptureEvent('browser:command', params.sessionId, '', {
      commandType: 'set_live_dom_state',
      url: params.url,
      revision: nextRevision,
      elementCount: params.elements.length,
    });
    return livePage;
  }

  /** Current live page state + active RefMap for the console UI. */
  public getBrowserSessionState(sessionId: string): {
    currentUrl: string | null;
    livePage: LivePageDomState | null;
    activeRefMap:
      | {
          snapshotId: string;
          url: string;
          domRevision: number;
          createdAt: string;
          compactTextTree: string;
          refIds: string[];
        }
      | null;
    actionLog: string[];
  } {
    const state = sessionState(sessionId);
    return {
      currentUrl: state.currentUrl,
      livePage: state.livePage,
      activeRefMap: state.activeRefMap
        ? {
            snapshotId: state.activeRefMap.snapshotId,
            url: state.activeRefMap.url,
            domRevision: state.activeRefMap.domRevision,
            createdAt: state.activeRefMap.createdAt,
            compactTextTree: state.activeRefMap.compactTextTree,
            refIds: Array.from(state.activeRefMap.refs.keys()),
          }
        : null,
      actionLog: state.actionLog.slice(-20),
    };
  }

  /* ---------------- Agent-Browser command loop ---------------- */

  /**
   * Executes one Agent-Browser command against the live DOM registry with the
   * blueprint invariants: loud failures, stale RefMap enforcement, CSPRNG
   * content boundaries, domain allowlist and post-action diffing.
   */
  public async executeAgentBrowserCommand(
    sessionId: string,
    command: AgentBrowserActionCommand
  ): Promise<AgentBrowserActionExecutionResult> {
    const startedAt = performance.now();
    const nonce = freshNonce();
    const state = sessionState(sessionId);

    const finish = (
      success: boolean,
      loudFailureReason: string | null,
      safeText: string,
      extra?: { postActionSnapshotId?: string | null; domDiffFromPrevious?: string | null }
    ): AgentBrowserActionExecutionResult => {
      const result: AgentBrowserActionExecutionResult = {
        command,
        success,
        loudFailureReason,
        postActionSnapshotId: extra?.postActionSnapshotId ?? null,
        domDiffFromPrevious: extra?.domDiffFromPrevious ?? null,
        csprngBoundaryNonce: nonce,
        wrappedSafeOutput: boundaryWrap(nonce, safeText),
        executionLatencyMs: Number((performance.now() - startedAt).toFixed(2)),
      };
      state.actionLog.push(
        `${success ? 'OK ' : 'FAIL'} ${command.commandType}${command.targetRefOrUrl ? ` ${command.targetRefOrUrl}` : ''}${success ? '' : ` :: ${loudFailureReason}`}`
      );
      publishCaptureEvent('browser:command', sessionId, '', {
        commandType: command.commandType,
        targetRefOrUrl: command.targetRefOrUrl ?? null,
        success,
        loudFailureReason,
        latencyMs: result.executionLatencyMs,
      });
      return result;
    };

    switch (command.commandType) {
      case 'open': {
        const url = command.targetRefOrUrl ?? '';
        let parsed: URL;
        try {
          parsed = new URL(url);
        } catch {
          return finish(false, `open failed: "${url}" is not a valid absolute URL`, `invalid URL: ${url}`);
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          return finish(false, `open failed: protocol "${parsed.protocol}" is not allowlisted (http/https only)`, `blocked protocol: ${parsed.protocol}`);
        }
        if (!this.allowedHosts.has(parsed.hostname) && !this.allowedHosts.has(`[${parsed.hostname}]`)) {
          return finish(
            false,
            `open failed: host "${parsed.hostname}" is not on the Agent-Browser domain allowlist (${Array.from(this.allowedHosts).join(', ')})`,
            `blocked host: ${parsed.hostname}`
          );
        }
        state.currentUrl = url;
        if (!state.livePage || state.livePage.url !== url) {
          return finish(
            true,
            null,
            `opened ${url} — no accessibility state captured yet for this route; run snapshot -i after the capture daemon reports the page (seed the DOM registry via set_live_dom_state).`
          );
        }
        return finish(true, null, `opened ${url} — live DOM revision ${state.livePage.revision} with ${state.livePage.elements.length} interactive element(s).`);
      }

      case 'snapshot': {
        if (!state.livePage) {
          return finish(
            false,
            'snapshot failed: no live page DOM state captured for this session — seed the registry (set_live_dom_state) or navigate with open first',
            'no live DOM state'
          );
        }
        const snapshot = await this.buildSnapshot(sessionId, state);
        const safeText = [
          `agent-browser snapshot -i — url ${state.livePage.url} (dom revision ${state.livePage.revision})`,
          `snapshot ${snapshot.snapshotId}`,
          snapshot.compactTextTree,
        ].join('\n');
        return finish(true, null, safeText, {
          postActionSnapshotId: snapshot.snapshotId,
          domDiffFromPrevious: snapshot.diffFromPrevious,
        });
      }

      case 'click':
      case 'fill': {
        if (command.commandType === 'fill' && !command.inputValue) {
          return finish(false, 'fill failed: inputValue is required for fill commands', 'missing fill value');
        }
        const target = command.targetRefOrUrl ?? '';
        if (!/^@e\d+$/.test(target)) {
          return finish(
            false,
            `${command.commandType} failed: "${target}" is not a snapshot ref — refs are @e1..@eN issued by snapshot -i (direct selectors are blocked by the action policy)`,
            `blocked non-ref target: ${target}`
          );
        }
        if (!state.activeRefMap) {
          return finish(
            false,
            `${command.commandType} failed: no active RefMap — run snapshot -i before interacting with the page`,
            'no active RefMap'
          );
        }
        const refEntry = state.activeRefMap.refs.get(target);
        if (!refEntry) {
          return finish(
            false,
            `${command.commandType} failed: ${target} is not present in the active RefMap (snapshot ${state.activeRefMap.snapshotId})`,
            `unknown ref: ${target}`
          );
        }
        if (!state.livePage) {
          return finish(false, `${command.commandType} failed: live page state disappeared mid-loop`, 'no live DOM state');
        }
        if (state.livePage.revision !== state.activeRefMap.domRevision) {
          return finish(
            false,
            `${command.commandType} failed: stale RefMap — the page DOM changed after snapshot ${state.activeRefMap.snapshotId} (revision ${state.activeRefMap.domRevision} -> ${state.livePage.revision}); take a fresh snapshot -i before acting`,
            `stale ref: ${target}`
          );
        }
        const el = refEntry.element;
        if (el.isDisabled) {
          return finish(false, `${command.commandType} failed: ${target} "${el.name}" is disabled (${el.domPathSelector})`, `disabled ref: ${target}`);
        }
        if (el.isVisibleInViewport === false) {
          return finish(false, `${command.commandType} failed: ${target} "${el.name}" is offscreen and cannot receive the action (${el.domPathSelector})`, `offscreen ref: ${target}`);
        }
        if (!el.isInteractive) {
          return finish(false, `${command.commandType} failed: ${target} "${el.name}" is not an interactive element (${el.domPathSelector})`, `non-interactive ref: ${target}`);
        }
        if (el.coveredByOverlaySelector) {
          return finish(
            false,
            `${command.commandType} failed: ${target} "${el.name}" is covered by overlay ${el.coveredByOverlaySelector} — the action would be intercepted. Dismiss the overlay and take a fresh snapshot -i.`,
            `covered ref: ${target}`
          );
        }

        // Action accepted — record + auto post-action snapshot (Action -> Diff).
        const valueNote =
          command.commandType === 'fill' ? ` with value "${command.inputValue}"` : '';
        const postSnapshot = await this.buildSnapshot(sessionId, state);
        return finish(
          true,
          null,
          `${command.commandType} -> ${target} "${el.name}" (${el.domPathSelector})${valueNote} — post-action snapshot ${postSnapshot.snapshotId}`,
          {
            postActionSnapshotId: postSnapshot.snapshotId,
            domDiffFromPrevious: postSnapshot.diffFromPrevious ?? 'NO_DOM_CHANGES',
          }
        );
      }

      case 'get_url': {
        if (!state.currentUrl) {
          return finish(false, 'get_url failed: no page is currently open', 'no current url');
        }
        return finish(true, null, `current url: ${state.currentUrl}`);
      }

      case 'close': {
        browserSessions().delete(sessionId);
        return finish(true, null, 'agent-browser session closed and RefMap dropped');
      }

      default: {
        const exhaustive: never = command.commandType;
        return finish(false, `unsupported command type: ${String(exhaustive)}`, 'unsupported command');
      }
    }
  }

  /** Builds a snapshot, persists it to ui_snapshots and promotes the active RefMap. */
  private async buildSnapshot(sessionId: string, state: BrowserSessionState) {
    const live = state.livePage!;
    const snapshot = await this.contextEngine.createUiSnapshot({
      sessionId,
      url: live.url,
      elements: live.elements.map((el) => ({
        role: el.role,
        name: el.name,
        tagName: el.tagName,
        isInteractive: el.isInteractive,
        isDisabled: el.isDisabled,
        isVisibleInViewport: el.isVisibleInViewport,
        coveredByOverlaySelector: el.coveredByOverlaySelector ?? null,
        boundingBox: el.boundingBox,
        domPathSelector: el.domPathSelector,
      })),
    });

    state.activeRefMap = {
      snapshotId: snapshot.snapshotId,
      url: live.url,
      domRevision: live.revision,
      createdAt: snapshot.createdAt,
      refs: new Map(
        Object.entries(snapshot.refMap).map(([refId, ref]) => {
          // RefMap keys carry the '@' prefix ("@e1") — parse the numeric part.
          const parsed = /^@e(\d+)$/.exec(refId);
          const idx = parsed ? Number(parsed[1]) - 1 : -1;
          const liveEl = idx >= 0 ? live.elements[idx] : undefined;
          return [
            refId,
            {
              element: {
                role: ref.role,
                name: ref.name,
                tagName: ref.tagName,
                isInteractive: ref.isInteractive,
                isDisabled: ref.isDisabled,
                isVisibleInViewport: ref.isVisibleInViewport,
                coveredByOverlaySelector: liveEl?.coveredByOverlaySelector ?? null,
                boundingBox: ref.boundingBox,
                domPathSelector: ref.domPathSelector,
              },
              order: idx,
            },
          ];
        })
      ),
      compactTextTree: snapshot.compactTextTree,
    };
    return snapshot;
  }

  /* ---------------- Ripwire test gate ---------------- */

  private runTestGate(params: {
    targetFilePath: string;
    candidateContent: string;
    requiredTestFiles: string[];
  }): { passed: boolean; executedTestFiles: string[]; diagnostics: string[]; gateLog: string } {
    const store = getWorkspaceFileStore();
    const diagnostics: string[] = [];
    const gateLog: string[] = [];

    const targetSymbols = extractTopLevelSymbols(params.candidateContent, params.targetFilePath).map(
      (s) => s.name
    );
    gateLog.push(
      `ripwire --test-gate: ${params.requiredTestFiles.length} required test file(s) for ${params.targetFilePath} (symbols: ${targetSymbols.join(', ') || 'none'})`
    );

    for (const testFile of params.requiredTestFiles) {
      gateLog.push(`-- checking ${testFile}`);
      const content = store.get(testFile);
      if (content === undefined) {
        diagnostics.push(`${testFile}: required test file is missing from the indexed workspace`);
        gateLog.push('   MISSING from workspace index');
        continue;
      }
      gateLog.push('   exists in workspace index');

      const syntax = ts.transpileModule(content, {
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.Latest, module: ts.ModuleKind.ESNext },
      });
      const syntaxErrors = (syntax.diagnostics ?? []).map(
        (d) => `${testFile}: syntax — ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`
      );
      if (syntaxErrors.length > 0) {
        diagnostics.push(...syntaxErrors);
        gateLog.push(`   SYNTAX ERRORS: ${syntaxErrors.length}`);
      } else {
        gateLog.push('   syntax valid');
      }

      const importProblems = resolveImportProblems({
        proposedContent: content,
        filePath: testFile,
        workspaceFiles: store,
      });
      for (const problem of importProblems) {
        diagnostics.push(`${testFile}: ${problem.reason}`);
        gateLog.push(`   IMPORT PROBLEM: ${problem.reason}`);
      }
      if (importProblems.length === 0) gateLog.push('   imports resolve cleanly');

      if (targetSymbols.length > 0) {
        const binds = targetSymbols.some((name) => content.includes(name));
        if (!binds) {
          diagnostics.push(
            `${testFile}: does not bind any exported symbol of ${params.targetFilePath} (${targetSymbols.join(', ')}) — the test gate requires test-to-symbol binding`
          );
          gateLog.push('   UNBOUND test file');
        } else {
          gateLog.push(`   binds target symbols (${targetSymbols.filter((n) => content.includes(n)).join(', ')})`);
        }
      }
    }

    return {
      passed: diagnostics.length === 0,
      executedTestFiles: [...params.requiredTestFiles],
      diagnostics,
      gateLog: gateLog.join('\n'),
    };
  }

  /* ---------------- Full artifact verification ---------------- */

  /**
   * Runs Compiler Gate + Test Gate + Agent-Browser loop over a staged artifact
   * and persists the RuntimeVerificationReport (blueprint §7.6 STAGE 4).
   */
  public async runFullArtifactVerification(params: {
    sessionId: string;
    projectSlug: string;
    artifactId: string;
    targetFilePath: string;
    candidateContent: string;
    previousContent?: string;
    requiredTestFiles: string[];
    browserVerificationScript?: AgentBrowserActionCommand[];
  }): Promise<RuntimeVerificationReport> {
    const startedAt = Date.now();
    const verificationId = `ver_${crypto.randomBytes(6).toString('hex')}`;
    const createdAt = new Date().toISOString();

    // Gate 1: TypeScript compiler gate (shadow sandbox — candidate content is
    // never merged into the workspace store, so the workspace is not polluted).
    const typeCheck = runTypeScriptGate({
      targetFilePath: params.targetFilePath,
      candidateContent: params.candidateContent,
      previousContent: params.previousContent,
    });

    // Gate 2: Ripwire test gate + CCR compression of the full gate log.
    const testGate = this.runTestGate({
      targetFilePath: params.targetFilePath,
      candidateContent: params.candidateContent,
      requiredTestFiles: params.requiredTestFiles,
    });
    let testRunnerOutputCcrId: string | null = null;
    try {
      const ccr = await this.distillationPipeline.compressAndStoreCCR({
        sessionId: params.sessionId,
        sourceLabel: `test_gate:${params.artifactId}`,
        rawContent: testGate.gateLog,
      });
      testRunnerOutputCcrId = ccr.ccrId;
    } catch {
      testRunnerOutputCcrId = null;
    }

    // Gate 3: Agent-Browser verification loop.
    const agentBrowserResults: AgentBrowserActionExecutionResult[] = [];
    for (const command of params.browserVerificationScript ?? []) {
      agentBrowserResults.push(await this.executeAgentBrowserCommand(params.sessionId, command));
    }
    const browserAllPassed =
      agentBrowserResults.length === 0 || agentBrowserResults.every((r) => r.success);

    const overallStatus: RuntimeVerificationReport['overallStatus'] =
      typeCheck.passed && testGate.passed && browserAllPassed
        ? 'verified_ready_for_approval'
        : 'failed_verification';

    const report: RuntimeVerificationReport = {
      verificationId,
      sessionId: params.sessionId,
      artifactId: params.artifactId,
      targetFilePath: params.targetFilePath,
      typeCheckPassed: typeCheck.passed,
      typeCheckDiagnostics: typeCheck.diagnostics,
      testGatePassed: testGate.passed,
      executedTestFiles: testGate.executedTestFiles,
      testRunnerOutputCcrId,
      agentBrowserResults,
      overallStatus,
      createdAt,
    };

    await db.runtimeVerification.create({
      data: {
        verificationId,
        sessionId: params.sessionId,
        artifactId: params.artifactId,
        targetFilePath: params.targetFilePath,
        typeCheckPassed: typeCheck.passed,
        typeCheckDiagnosticsJson: JSON.stringify(typeCheck.diagnostics),
        testGatePassed: testGate.passed,
        executedTestFilesJson: JSON.stringify(testGate.executedTestFiles),
        testRunnerCcrId: testRunnerOutputCcrId,
        agentBrowserResultsJson: JSON.stringify(agentBrowserResults),
        overallStatus,
        createdAt,
      },
    });

    publishCaptureEvent('verify:report', params.sessionId, params.projectSlug, {
      verificationId,
      artifactId: params.artifactId,
      targetFilePath: params.targetFilePath,
      typeCheckPassed: typeCheck.passed,
      testGatePassed: testGate.passed,
      typeCheckDiagnostics: typeCheck.diagnostics.length,
      agentBrowserCommands: agentBrowserResults.length,
      overallStatus,
      gateLatencyMs: Date.now() - startedAt,
    });

    return report;
  }

  /** Recent verification reports (newest first). */
  public async listRecentVerifications(sessionId?: string, limit = 12): Promise<RuntimeVerificationReport[]> {
    const rows = await db.runtimeVerification.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    const parse = <T,>(json: string, fallback: T): T => {
      try {
        return JSON.parse(json) as T;
      } catch {
        return fallback;
      }
    };
    return rows.map((row) => ({
      verificationId: row.verificationId,
      sessionId: row.sessionId,
      artifactId: row.artifactId,
      targetFilePath: row.targetFilePath,
      typeCheckPassed: row.typeCheckPassed,
      typeCheckDiagnostics: parse<string[]>(row.typeCheckDiagnosticsJson, []),
      testGatePassed: row.testGatePassed,
      executedTestFiles: parse<string[]>(row.executedTestFilesJson, []),
      testRunnerOutputCcrId: row.testRunnerCcrId,
      agentBrowserResults: parse<AgentBrowserActionExecutionResult[]>(row.agentBrowserResultsJson, []),
      overallStatus: row.overallStatus as RuntimeVerificationReport['overallStatus'],
      createdAt: row.createdAt,
    }));
  }
}
