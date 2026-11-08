/**
 * src/server/apexpad/context-engine.ts
 * Ripwire AST Call-Graph Indexer, Personalized PageRank (PPR), Blast Radius & Test Gate,
 * Agent-Browser Snapshot-Ref Indexer, CacheAligner, and U-Curve Attention Context Packer.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { MemoryRouter } from './memory-router';
import { DistillationPipeline } from './distillation-pipeline';
import type {
  AgentBrowserElementRef,
  AgentBrowserSnapshot,
  AstDependencyEdge,
  AstSymbolNode,
  BlastRadiusReport,
  EdgeHonestyLabel,
  PackedContextEnvelope,
} from '@/lib/apexpad-types';

type SymbolRow = {
  symbolId: string;
  projectSlug: string;
  filePath: string;
  symbolName: string;
  kind: string;
  signature: string;
  startLine: number;
  endLine: number;
  cyclomaticComplexity: number;
  gitChurn30d: number;
  hasTestCoverage: boolean;
  pageRankScore: number;
  fileSha256: string;
  updatedAt: string;
};

const globalForWorkspace = globalThis as unknown as {
  apexpadWorkspaceFiles: Map<string, string> | undefined;
};

/** In-memory workspace file contents (single-process dev server). */
export function getWorkspaceFileStore(): Map<string, string> {
  if (!globalForWorkspace.apexpadWorkspaceFiles) {
    globalForWorkspace.apexpadWorkspaceFiles = new Map();
  }
  return globalForWorkspace.apexpadWorkspaceFiles;
}

export class ContextEngine {
  private memoryRouter: MemoryRouter;
  private distillationPipeline: DistillationPipeline;

  constructor(memoryRouter: MemoryRouter, distillationPipeline: DistillationPipeline) {
    this.memoryRouter = memoryRouter;
    this.distillationPipeline = distillationPipeline;
  }

  /** Ripwire AST & Markdown Symbol Extractor with stale-memory invalidation. */
  public async indexFileSymbols(params: {
    projectSlug: string;
    filePath: string;
    content: string;
    gitChurn30d?: number;
  }): Promise<AstSymbolNode[]> {
    const fileSha256 = crypto.createHash('sha256').update(params.content).digest('hex');
    const now = new Date().toISOString();

    // Magic Context Descent: invalidate observations bound to an older blob hash of this file
    await this.memoryRouter.invalidateStaleMemoriesForFile(
      params.projectSlug,
      params.filePath,
      fileSha256
    );

    // Track content in the workspace store for call-graph resolution
    getWorkspaceFileStore().set(params.filePath, params.content);

    // Remove previous symbols for this file before re-indexing
    await db.astSymbol.deleteMany({
      where: { projectSlug: params.projectSlug, filePath: params.filePath },
    });

    const lines = params.content.split('\n');
    const symbols: AstSymbolNode[] = [];
    const isMarkdown = /\.(md|mdx)$/i.test(params.filePath);
    const isTestFile = /\.(test|spec)\.(ts|tsx|js|jsx|py)$/i.test(params.filePath);

    if (isMarkdown) {
      lines.forEach((line, idx) => {
        const headingMatch = /^(#{1,6})\s+(.+)$/.exec(line.trim());
        if (headingMatch) {
          const symbolName = headingMatch[2].trim();
          const symbolId = `sym_${crypto
            .createHash('sha256')
            .update(`${params.projectSlug}:${params.filePath}:${symbolName}:${idx + 1}`)
            .digest('hex')
            .slice(0, 12)}`;

          symbols.push({
            symbolId,
            projectSlug: params.projectSlug,
            filePath: params.filePath,
            symbolName,
            kind: 'heading',
            signature: line.trim(),
            startLine: idx + 1,
            endLine: Math.min(lines.length, idx + 25),
            cyclomaticComplexity: 1,
            gitChurn30d: params.gitChurn30d ?? 0,
            hasTestCoverage: true,
            pageRankScore: 1.0,
            fileSha256,
            updatedAt: now,
          });
        }
      });
    } else {
      const declPatterns: Array<{ kind: AstSymbolNode['kind']; regex: RegExp }> = [
        { kind: 'class', regex: /^(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_]+)/ },
        { kind: 'interface', regex: /^(?:export\s+)?interface\s+([A-Za-z0-9_]+)/ },
        {
          kind: 'function',
          regex: /^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)/,
        },
        {
          kind: 'function',
          regex:
            /^(?:export\s+)?const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*(?::\s*[^=]+)?=>/,
        },
        {
          kind: 'method',
          regex:
            /^(?:public|private|protected|async)\s+(?:async\s+)?([A-Za-z0-9_]+)\s*\([^)]*\)/,
        },
      ];

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        for (const pat of declPatterns) {
          const match = pat.regex.exec(trimmed);
          if (match) {
            const symbolName = match[1];
            const endLine = this.findBlockEndLine(lines, i);
            const blockSlice = lines.slice(i, endLine).join('\n');
            const cyclomaticComplexity = this.computeCyclomaticComplexity(blockSlice);
            const symbolId = `sym_${crypto
              .createHash('sha256')
              .update(`${params.projectSlug}:${params.filePath}:${symbolName}:${i + 1}`)
              .digest('hex')
              .slice(0, 12)}`;

            symbols.push({
              symbolId,
              projectSlug: params.projectSlug,
              filePath: params.filePath,
              symbolName,
              kind: pat.kind,
              signature: trimmed.replace(/\{$/, '').trim(),
              startLine: i + 1,
              endLine,
              cyclomaticComplexity,
              gitChurn30d: params.gitChurn30d ?? 0,
              hasTestCoverage: isTestFile,
              pageRankScore: 1.0,
              fileSha256,
              updatedAt: now,
            });
            break;
          }
        }
      }
    }

    if (symbols.length > 0) {
      await db.astSymbol.createMany({
        data: symbols.map((s) => ({
          symbolId: s.symbolId,
          projectSlug: s.projectSlug,
          filePath: s.filePath,
          symbolName: s.symbolName,
          kind: s.kind,
          signature: s.signature,
          startLine: s.startLine,
          endLine: s.endLine,
          cyclomaticComplexity: s.cyclomaticComplexity,
          gitChurn30d: s.gitChurn30d,
          hasTestCoverage: s.hasTestCoverage,
          pageRankScore: s.pageRankScore,
          fileSha256: s.fileSha256,
          updatedAt: s.updatedAt,
        })),
      });
    }

    return symbols;
  }

  /** Ripwire directed call edges + Markdown [[Backlinks]] with Honesty Contract labels. */
  public async rebuildCallGraphEdges(
    projectSlug: string,
    fileContentsByPath: Record<string, string>
  ): Promise<AstDependencyEdge[]> {
    // Merge newly provided contents into the workspace store
    const store = getWorkspaceFileStore();
    for (const [p, c] of Object.entries(fileContentsByPath)) {
      store.set(p, c);
    }

    const allSymbols = await this.getAllProjectSymbols(projectSlug);
    const symbolsByName = new Map<string, AstSymbolNode[]>();
    for (const sym of allSymbols) {
      const list = symbolsByName.get(sym.symbolName) ?? [];
      list.push(sym);
      symbolsByName.set(sym.symbolName, list);
    }

    await db.astEdge.deleteMany({ where: { projectSlug } });

    const edges: AstDependencyEdge[] = [];
    const callTokenRegex = /\b([A-Za-z_][A-Za-z0-9_]{2,})\s*\(/g;
    const wikiLinkRegex = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g;

    for (const callerSym of allSymbols) {
      const fileContent = store.get(callerSym.filePath);
      if (!fileContent) continue;

      const lines = fileContent.split('\n');
      const bodyText = lines
        .slice(Math.max(0, callerSym.startLine - 1), callerSym.endLine)
        .join('\n');

      if (callerSym.kind === 'heading') {
        let linkMatch: RegExpExecArray | null;
        while ((linkMatch = wikiLinkRegex.exec(bodyText)) !== null) {
          const targetHeadingOrNote = (linkMatch[2] || linkMatch[1]).trim();
          const candidates = symbolsByName.get(targetHeadingOrNote) ?? [];
          for (const callee of candidates) {
            if (callee.symbolId !== callerSym.symbolId) {
              edges.push(this.makeEdge(projectSlug, callerSym, callee, 'markdown_backlink', 1.0));
            }
          }
        }
      } else {
        const seenCallees = new Set<string>();
        let callMatch: RegExpExecArray | null;
        while ((callMatch = callTokenRegex.exec(bodyText)) !== null) {
          const calledName = callMatch[1];
          if (calledName === callerSym.symbolName) continue;
          const candidates = symbolsByName.get(calledName);
          if (!candidates || candidates.length === 0) continue;

          // Ripwire Honesty Contract: ambiguous when multiple same-name defs exist
          const honestyLabel: EdgeHonestyLabel =
            candidates.length === 1 ? 'exact' : 'heuristic_ambiguous';
          const splitWeight = Number((1.0 / candidates.length).toFixed(3));

          for (const callee of candidates) {
            if (callee.symbolId === callerSym.symbolId) continue;
            const dedupeKey = `${callerSym.symbolId}->${callee.symbolId}`;
            if (!seenCallees.has(dedupeKey)) {
              seenCallees.add(dedupeKey);
              edges.push(this.makeEdge(projectSlug, callerSym, callee, honestyLabel, splitWeight));
            }
          }
        }
      }
    }

    if (edges.length > 0) {
      const callerRows = new Map(allSymbols.map((s) => [s.symbolId, s]));
      const calleeRows = new Map(allSymbols.map((s) => [s.symbolId, s]));

      await db.astEdge.createMany({
        data: edges.map((e) => ({
          edgeId: e.edgeId,
          projectSlug: e.projectSlug,
          callerSymbolId: e.callerSymbolId,
          calleeSymbolId: e.calleeSymbolId,
          callerFile: callerRows.get(e.callerSymbolId)?.filePath ?? '',
          calleeFile: calleeRows.get(e.calleeSymbolId)?.filePath ?? '',
          honestyLabel: e.honestyLabel,
          weight: e.weight,
        })),
      });

      // Test-coverage propagation from *.test.*/ *.spec.* callers
      const testCallerEdges = edges.filter((e) => /\.(test|spec)\./i.test(e.callerFile));
      for (const e of testCallerEdges) {
        await db.astSymbol.updateMany({
          where: { symbolId: e.calleeSymbolId, hasTestCoverage: false },
          data: { hasTestCoverage: true },
        });
      }
    }

    return edges;
  }

  /** Ripwire Personalized PageRank Task-Lens Ranking (alpha=0.85, 20 iterations). */
  public async computePersonalizedPageRank(
    projectSlug: string,
    taskQuery: string,
    iterations = 20,
    damping = 0.85
  ): Promise<AstSymbolNode[]> {
    const symbols = await this.getAllProjectSymbols(projectSlug);
    if (symbols.length === 0) return [];

    const edges = await this.getAllProjectEdges(projectSlug);
    const n = symbols.length;
    const idToIndex = new Map<string, number>();
    symbols.forEach((s, idx) => idToIndex.set(s.symbolId, idx));

    const queryTokens = taskQuery
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length >= 2);

    // Seed vector (teleportation distribution)
    const seedVector = new Float64Array(n);
    let seedSum = 0;

    symbols.forEach((s, idx) => {
      const symLower = s.symbolName.toLowerCase();
      const fileLower = s.filePath.toLowerCase();
      let boost = 0.05; // baseline uniform floor
      for (const tok of queryTokens) {
        if (symLower === tok) boost += 5.0;
        else if (symLower.includes(tok)) boost += 2.0;
        if (fileLower.includes(tok)) boost += 1.0;
      }
      seedVector[idx] = boost;
      seedSum += boost;
    });

    if (seedSum > 0) {
      for (let i = 0; i < n; i++) {
        seedVector[i] /= seedSum;
      }
    }

    // Bidirectional adjacency (callers & callees both propagate task relevance)
    const outgoing = Array.from({ length: n }, () => [] as Array<{ to: number; weight: number }>);
    const outWeightSum = new Float64Array(n);

    for (const e of edges) {
      const u = idToIndex.get(e.callerSymbolId);
      const v = idToIndex.get(e.calleeSymbolId);
      if (u !== undefined && v !== undefined) {
        outgoing[u].push({ to: v, weight: e.weight });
        outWeightSum[u] += e.weight;
        outgoing[v].push({ to: u, weight: e.weight * 0.7 });
        outWeightSum[v] += e.weight * 0.7;
      }
    }

    let ranks = new Float64Array(seedVector);
    for (let iter = 0; iter < iterations; iter++) {
      const nextRanks = new Float64Array(n);
      let danglingMass = 0;

      for (let i = 0; i < n; i++) {
        if (outWeightSum[i] === 0) {
          danglingMass += ranks[i];
        } else {
          for (const edge of outgoing[i]) {
            nextRanks[edge.to] += damping * ranks[i] * (edge.weight / outWeightSum[i]);
          }
        }
      }

      for (let i = 0; i < n; i++) {
        nextRanks[i] +=
          damping * danglingMass * seedVector[i] + (1 - damping) * seedVector[i];
      }
      ranks = nextRanks;
    }

    const tx: Array<Promise<unknown>> = [];
    symbols.forEach((s, idx) => {
      s.pageRankScore = Number((ranks[idx] * 100).toFixed(4));
      tx.push(
        db.astSymbol.update({
          where: { symbolId: s.symbolId },
          data: { pageRankScore: s.pageRankScore },
        })
      );
    });
    await Promise.all(tx);

    return [...symbols].sort((a, b) => b.pageRankScore - a.pageRankScore);
  }

  /** Ripwire Blast Radius, Contract Check, Layer Gate & Test Gate. */
  public async analyzeEditBlastRadius(params: {
    projectSlug: string;
    targetFilePath: string;
    proposedContent: string;
    previousContent: string;
  }): Promise<BlastRadiusReport> {
    const allSymbols = await this.getAllProjectSymbols(params.projectSlug);
    const allEdges = await this.getAllProjectEdges(params.projectSlug);
    const symbolMap = new Map<string, AstSymbolNode>(allSymbols.map((s) => [s.symbolId, s]));

    const fileSymbols = allSymbols.filter((s) => s.filePath === params.targetFilePath);
    const targetSymbolIds = new Set(fileSymbols.map((s) => s.symbolId));

    // Direct callers
    const directCallerIds = new Set<string>();
    let honestyFloorDisclosed = false;

    for (const e of allEdges) {
      if (targetSymbolIds.has(e.calleeSymbolId) && !targetSymbolIds.has(e.callerSymbolId)) {
        directCallerIds.add(e.callerSymbolId);
        if (e.honestyLabel === 'heuristic_ambiguous') {
          honestyFloorDisclosed = true;
        }
      }
    }

    // 2-hop transitive callers
    const transitiveCallerIds = new Set<string>(directCallerIds);
    for (const e of allEdges) {
      if (directCallerIds.has(e.calleeSymbolId) && !targetSymbolIds.has(e.callerSymbolId)) {
        transitiveCallerIds.add(e.callerSymbolId);
      }
    }

    const directCallers = Array.from(directCallerIds)
      .map((id) => symbolMap.get(id))
      .filter((s): s is AstSymbolNode => Boolean(s));

    const transitiveCallers = Array.from(transitiveCallerIds)
      .map((id) => symbolMap.get(id))
      .filter((s): s is AstSymbolNode => Boolean(s));

    const affectedFiles = Array.from(new Set(transitiveCallers.map((s) => s.filePath)));
    const requiredTests = affectedFiles.filter((f) => /\.(test|spec)\./i.test(f));

    // Contract change detection (old signatures vs proposed content)
    const contractChangesDetected: string[] = [];
    for (const sym of fileSymbols) {
      if (sym.kind !== 'heading' && !params.proposedContent.includes(sym.signature)) {
        contractChangesDetected.push(
          `Signature altered or removed: ${sym.symbolName} (was: "${sym.signature}")`
        );
      }
    }

    // Architecture layer deny rules from Project DNA (e.g., "deny renderer -> db")
    const dnaRules = await this.memoryRouter.getProjectDnaRules(params.projectSlug);
    const architectureViolations: string[] = [];
    for (const rule of dnaRules) {
      if (rule.layerDenyRule) {
        const match = /^deny\s+([a-zA-Z0-9_-]+)\s*->\s*([a-zA-Z0-9_-]+)$/i.exec(
          rule.layerDenyRule.trim()
        );
        if (match) {
          const fromLayer = match[1].toLowerCase();
          const toLayer = match[2].toLowerCase();
          if (
            params.targetFilePath.toLowerCase().includes(fromLayer) &&
            new RegExp(`from\\s+['"][^'"]*${toLayer}[^'"]*['"]`, 'i').test(params.proposedContent)
          ) {
            architectureViolations.push(
              `Layer Violation [${rule.ruleKey}]: "${params.targetFilePath}" (${fromLayer}) imports forbidden layer "${toLayer}".`
            );
          }
        }
      }
    }

    const oldComplexity = this.computeCyclomaticComplexity(params.previousContent);
    const newComplexity = this.computeCyclomaticComplexity(params.proposedContent);
    const cyclomaticDelta = newComplexity - oldComplexity;
    const propagationCost = Number(
      (transitiveCallers.length / Math.max(1, allSymbols.length)).toFixed(4)
    );

    return {
      targetSymbols: fileSymbols.map((s) => s.symbolName),
      directCallers,
      transitiveCallers,
      affectedFiles,
      requiredTests,
      contractChangesDetected,
      architectureViolations,
      cyclomaticDelta,
      propagationCost,
      honestyFloorDisclosed,
    };
  }

  /** Agent-Browser Snapshot + stable @e1 RefMap generator with unified DOM diff. */
  public async createUiSnapshot(params: {
    sessionId: string;
    url: string;
    elements: Array<{
      role: string;
      name: string;
      tagName: string;
      isInteractive: boolean;
      isDisabled?: boolean;
      isVisibleInViewport?: boolean;
      /** Loud-failure audit flag: overlay selector covering this element, if any. */
      coveredByOverlaySelector?: string | null;
      boundingBox?: { x: number; y: number; width: number; height: number };
      domPathSelector: string;
    }>;
  }): Promise<AgentBrowserSnapshot> {
    const refMap: Record<string, AgentBrowserElementRef> = {};
    const treeLines: string[] = [];

    params.elements.forEach((el, idx) => {
      const refKey = `e${idx + 1}`;
      const refTag = `@${refKey}`;
      const refObj: AgentBrowserElementRef = {
        refId: refTag,
        role: el.role,
        name: el.name,
        tagName: el.tagName,
        isInteractive: el.isInteractive,
        isDisabled: Boolean(el.isDisabled),
        isVisibleInViewport: el.isVisibleInViewport ?? true,
        boundingBox: el.boundingBox ?? { x: 0, y: 0, width: 100, height: 32 },
        domPathSelector: el.domPathSelector,
      };
      refMap[refTag] = refObj;

      const flags = [
        `[ref=${refKey}]`,
        refObj.isDisabled ? '[disabled]' : '',
        !refObj.isVisibleInViewport ? '[offscreen]' : '',
        el.coveredByOverlaySelector ? `[covered by ${el.coveredByOverlaySelector}]` : '',
      ]
        .filter(Boolean)
        .join(' ');
      treeLines.push(`- ${el.role} "${el.name}" ${flags}`);
    });

    const compactTextTree = treeLines.join('\n');
    const domHash = crypto.createHash('sha256').update(compactTextTree).digest('hex').slice(0, 16);

    const prevRow = await db.uiSnapshot.findFirst({
      where: { sessionId: params.sessionId },
      orderBy: { createdAt: 'desc' },
    });

    let diffFromPrevious: string | null = null;
    if (prevRow) {
      const prevSet = new Set(prevRow.compactTextTree.split('\n'));
      const currSet = new Set(treeLines);
      const added = treeLines.filter((l) => !prevSet.has(l)).map((l) => `+ ${l}`);
      const removed = prevRow.compactTextTree
        .split('\n')
        .filter((l) => !currSet.has(l))
        .map((l) => `- ${l}`);
      diffFromPrevious = [...removed, ...added].join('\n') || 'NO_DOM_CHANGES';
    }

    const snapshotId = `snap_${crypto.randomBytes(6).toString('hex')}`;
    const now = new Date().toISOString();

    await db.uiSnapshot.create({
      data: {
        snapshotId,
        sessionId: params.sessionId,
        url: params.url,
        domHash,
        compactTextTree,
        refMapJson: JSON.stringify(refMap),
        diffFromPrevious,
        createdAt: now,
      },
    });

    return {
      snapshotId,
      sessionId: params.sessionId,
      url: params.url,
      domHash,
      compactTextTree,
      refMap,
      diffFromPrevious,
      createdAt: now,
    };
  }

  /** Master Context Packer: CacheAligner Frozen Prefix + Byte Ceiling + U-Curve packing. */
  public async buildContextPack(params: {
    sessionId: string;
    projectSlug: string;
    userTaskPrompt: string;
    tokenBudgetCeiling: number;
    activeCcrBlocks?: Array<{ sourceLabel: string; rawContent: string }>;
  }): Promise<PackedContextEnvelope> {
    // 1. FROZEN PREFIX ZONE (CacheAligner: byte-identical order for 100% KV-cache hits)
    const dnaRules = await this.memoryRouter.getProjectDnaRules(params.projectSlug);
    const sortedDna = [...dnaRules].sort((a, b) => a.ruleKey.localeCompare(b.ruleKey));

    const frozenPrefixLines: string[] = [
      `<apexpad_frozen_prefix project="${params.projectSlug}">`,
      `  <system_contract>`,
      `    You are the ApexPad Tier-1 Engineering Intelligence. Never emit stubs or placeholders.`,
      `    Emit durable architectural learnings inline using <memory category="decision|bugfix|arch_rule|invariant" scope="repo" title="..." subtitle="..." files="..." symbols="...">...</memory>.`,
      `    If a compressed block carries <ccr_ref id="ccr_..." />, call headroom_retrieve(ccrId) when exact implementation lines are required.`,
      `  </system_contract>`,
      `  <project_dna count="${sortedDna.length}">`,
      ...sortedDna.map(
        (r) =>
          `    <dna_rule key="${r.ruleKey}" category="${r.category}" confirmed="${r.confirmationSessions}" deny="${r.layerDenyRule ?? 'none'}">${r.ruleStatement}</dna_rule>`
      ),
      `  </project_dna>`,
      `</apexpad_frozen_prefix>`,
    ];

    const frozenPrefix = frozenPrefixLines.join('\n');
    const frozenPrefixHash = crypto.createHash('sha256').update(frozenPrefix).digest('hex');
    const frozenTokens = MemoryRouter.estimateTokens(frozenPrefix);

    // 2. Ripwire conservative byte ceiling for live zone (2.36 B/tok * 0.90 headroom)
    const remainingTokenBudget = Math.max(250, params.tokenBudgetCeiling - frozenTokens);
    const byteCeiling = Math.floor(remainingTokenBudget * 2.36 * 0.9);

    // 3. Rank AST symbols by Personalized PageRank for this task
    const rankedSymbols = await this.computePersonalizedPageRank(
      params.projectSlug,
      params.userTaskPrompt
    );

    // 4. Progressive disclosure memory retrieval
    const indexHits = await this.memoryRouter.searchIndex({
      projectSlug: params.projectSlug,
      query: params.userTaskPrompt,
      limit: 10,
    });
    const topFullObservations = await this.memoryRouter.getObservationsByIds(
      indexHits.slice(0, 3).map((h) => h.id)
    );
    const middleIndexHits = indexHits.slice(3);

    // 5. Compress tool outputs / active files via Headroom CCR
    const ccrStubs: string[] = [];
    const includedCcrIds: string[] = [];
    for (const block of params.activeCcrBlocks ?? []) {
      const ccr = await this.distillationPipeline.compressAndStoreCCR({
        sessionId: params.sessionId,
        sourceLabel: block.sourceLabel,
        rawContent: block.rawContent,
      });
      ccrStubs.push(ccr.compressedStub);
      includedCcrIds.push(ccr.ccrId);
    }

    // 6. U-Curve attention packing under strict byte ceiling
    const topEdgeItems: string[] = [];
    const middleTroughItems: string[] = [];
    const bottomEdgeItems: string[] = [
      `  <active_task_prompt>${params.userTaskPrompt}</active_task_prompt>`,
    ];

    const includedSymbolIds: string[] = [];
    const includedObservationIds: string[] = [];
    const truncationDisclosures: string[] = [];

    let usedBytes = Buffer.byteLength(bottomEdgeItems.join('\n'), 'utf8') + 160;

    // Fill Top Edge with highest PageRank symbols first
    for (const sym of rankedSymbols) {
      const symXml = `    <sym id="${sym.symbolId}" file="${sym.filePath}:${sym.startLine}-${sym.endLine}" kind="${sym.kind}" ppr="${sym.pageRankScore}" cx="${sym.cyclomaticComplexity}" tested="${sym.hasTestCoverage}">${sym.signature}</sym>`;
      const itemBytes = Buffer.byteLength(symXml, 'utf8') + 1;
      if (usedBytes + itemBytes <= byteCeiling * 0.45 && includedSymbolIds.length < 25) {
        topEdgeItems.push(symXml);
        includedSymbolIds.push(sym.symbolId);
        usedBytes += itemBytes;
      } else {
        break;
      }
    }

    if (rankedSymbols.length > includedSymbolIds.length) {
      truncationDisclosures.push(
        `ast_symbols: shipped ${includedSymbolIds.length} of ${rankedSymbols.length} ranked symbols under byte ceiling (${byteCeiling} B)`
      );
    }

    // Add Top-3 full observations to Top Edge
    for (const obs of topFullObservations) {
      const obsXml = `    <obs_full id="${obs.id}" cat="${obs.category}" confirmed="${obs.confirmationCount}" files="${obs.referencedFiles.join(',')}">${obs.title}: ${obs.narrative}</obs_full>`;
      const itemBytes = Buffer.byteLength(obsXml, 'utf8') + 1;
      if (usedBytes + itemBytes <= byteCeiling * 0.65) {
        topEdgeItems.push(obsXml);
        includedObservationIds.push(obs.id);
        usedBytes += itemBytes;
      }
    }

    // Fill Middle Trough with progressive index hits + CCR stubs
    for (const hit of middleIndexHits) {
      const hitXml = `    <obs_index id="${hit.id}" cat="${hit.category}" est_tok="${hit.tokenEstimate}" hint="Call get_observations(['${hit.id}']) for details">${hit.title} — ${hit.subtitle}</obs_index>`;
      const itemBytes = Buffer.byteLength(hitXml, 'utf8') + 1;
      if (usedBytes + itemBytes <= byteCeiling * 0.85) {
        middleTroughItems.push(hitXml);
        includedObservationIds.push(hit.id);
        usedBytes += itemBytes;
      }
    }

    for (const stub of ccrStubs) {
      const stubXml = `    <ccr_payload>\n${stub}\n    </ccr_payload>`;
      const itemBytes = Buffer.byteLength(stubXml, 'utf8') + 1;
      if (usedBytes + itemBytes <= byteCeiling * 0.98) {
        middleTroughItems.push(stubXml);
        usedBytes += itemBytes;
      } else {
        truncationDisclosures.push(`ccr_payload: omitted 1 payload exceeding live-zone byte ceiling`);
      }
    }

    const liveZoneXml = [
      `<apexpad_live_context byte_ceiling="${byteCeiling}" used_bytes="${usedBytes}">`,
      `  <u_curve_top_high_attention>`,
      ...topEdgeItems,
      `  </u_curve_top_high_attention>`,
      `  <u_curve_middle_progressive_index_and_ccr>`,
      ...middleTroughItems,
      `  </u_curve_middle_progressive_index_and_ccr>`,
      `  <u_curve_bottom_immediate_task>`,
      ...bottomEdgeItems,
      `    <honesty_disclosures count="${truncationDisclosures.length}">`,
      ...truncationDisclosures.map((d) => `      <disclosure>${d}</disclosure>`),
      `    </honesty_disclosures>`,
      `  </u_curve_bottom_immediate_task>`,
      `</apexpad_live_context>`,
    ].join('\n');

    const estimatedTotalTokens = frozenTokens + MemoryRouter.estimateTokens(liveZoneXml);

    return {
      frozenPrefix,
      frozenPrefixHash,
      liveZoneXml,
      estimatedTotalTokens,
      tokenBudgetCeiling: params.tokenBudgetCeiling,
      byteCeiling,
      includedObservationIds,
      includedSymbolIds,
      includedCcrIds,
      truncationDisclosures,
    };
  }

  public async getAllProjectSymbols(projectSlug: string): Promise<AstSymbolNode[]> {
    const rows = await db.astSymbol.findMany({
      where: { projectSlug },
      orderBy: { pageRankScore: 'desc' },
    });
    return rows.map((r: SymbolRow) => ({
      symbolId: r.symbolId,
      projectSlug: r.projectSlug,
      filePath: r.filePath,
      symbolName: r.symbolName,
      kind: r.kind as AstSymbolNode['kind'],
      signature: r.signature,
      startLine: r.startLine,
      endLine: r.endLine,
      cyclomaticComplexity: r.cyclomaticComplexity,
      gitChurn30d: r.gitChurn30d,
      hasTestCoverage: r.hasTestCoverage,
      pageRankScore: r.pageRankScore,
      fileSha256: r.fileSha256,
      updatedAt: r.updatedAt,
    }));
  }

  public async getAllProjectEdges(projectSlug: string): Promise<AstDependencyEdge[]> {
    const rows = await db.astEdge.findMany({ where: { projectSlug } });
    return rows.map((r) => ({
      edgeId: r.edgeId,
      projectSlug: r.projectSlug,
      callerSymbolId: r.callerSymbolId,
      calleeSymbolId: r.calleeSymbolId,
      callerFile: r.callerFile,
      calleeFile: r.calleeFile,
      honestyLabel: r.honestyLabel as EdgeHonestyLabel,
      weight: r.weight,
    }));
  }

  private makeEdge(
    projectSlug: string,
    caller: AstSymbolNode,
    callee: AstSymbolNode,
    honestyLabel: EdgeHonestyLabel,
    weight: number
  ): AstDependencyEdge {
    const edgeId = `edge_${crypto
      .createHash('sha256')
      .update(`${projectSlug}:${caller.symbolId}->${callee.symbolId}`)
      .digest('hex')
      .slice(0, 12)}`;
    return {
      edgeId,
      projectSlug,
      callerSymbolId: caller.symbolId,
      calleeSymbolId: callee.symbolId,
      callerFile: caller.filePath,
      calleeFile: callee.filePath,
      honestyLabel,
      weight,
    };
  }

  private findBlockEndLine(lines: string[], startIndex: number): number {
    let depth = 0;
    let foundOpen = false;
    for (let i = startIndex; i < lines.length; i++) {
      const open = (lines[i].match(/\{/g) || []).length;
      const close = (lines[i].match(/\}/g) || []).length;
      if (open > 0) foundOpen = true;
      depth += open - close;
      if (foundOpen && depth <= 0) {
        return i + 1;
      }
    }
    return Math.min(lines.length, startIndex + 25);
  }

  private computeCyclomaticComplexity(codeBlock: string): number {
    const branches =
      codeBlock.match(/\b(if|else\s+if|for|while|case|catch)\b|\?\s*[^:]+\s*:|&&|\|\|/g) || [];
    return 1 + branches.length;
  }
}
