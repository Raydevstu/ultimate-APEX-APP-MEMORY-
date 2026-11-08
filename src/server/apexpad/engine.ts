/**
 * src/server/apexpad/engine.ts
 * ApexPad engine container singleton: initializes FTS5, wires all engine modules,
 * and seeds a demo project on first access so the workbench is populated.
 */

import { db } from '@/lib/db';
import { ensureFtsSetup } from './fts';
import { MemoryRouter } from './memory-router';
import { DistillationPipeline } from './distillation-pipeline';
import { ContextEngine, getWorkspaceFileStore } from './context-engine';
import { ApexDagOrchestrator } from './dag-orchestrator';
import { ModelRetrievalAdapter } from './model-adapter';
import { SpecificationStructurer } from './spec-structurer';
import { ModelGenerationGuardrails } from './guardrails';
import { RuntimeVerificationEngine } from './runtime-verifier';
import { FullApexSystemPipeline } from './full-pipeline';
import { ApexE2eVerificationSuite } from './e2e-suite';

export const PROJECT_SLUG = 'apexpad-editor-v1';

export interface ApexEngine {
  memoryRouter: MemoryRouter;
  distillationPipeline: DistillationPipeline;
  contextEngine: ContextEngine;
  dagOrchestrator: ApexDagOrchestrator;
  modelAdapter: ModelRetrievalAdapter;
  specStructurer: SpecificationStructurer;
  codeGuardrails: ModelGenerationGuardrails;
  runtimeVerifier: RuntimeVerificationEngine;
  fullPipeline: FullApexSystemPipeline;
  e2eSuite: ApexE2eVerificationSuite;
  projectSlug: string;
}

/**
 * Bumped whenever the ApexEngine shape changes so a dev-server hot reload
 * discards stale singletons from previous module versions.
 * v14 — Phase 10: disk-commit orchestrator, quarantine gate, subprocess verifier.
 */
const ENGINE_VERSION = 15;

const globalForEngine = globalThis as unknown as {
  apexpadEngine: ApexEngine | undefined;
  apexpadEngineVersion: number | undefined;
  apexpadEngineReady: Promise<ApexEngine> | undefined;
};

export function getEngine(): Promise<ApexEngine> {
  if (
    globalForEngine.apexpadEngine &&
    globalForEngine.apexpadEngineVersion === ENGINE_VERSION
  ) {
    return Promise.resolve(globalForEngine.apexpadEngine);
  }
  if (
    globalForEngine.apexpadEngineReady &&
    globalForEngine.apexpadEngineVersion === ENGINE_VERSION
  ) {
    return globalForEngine.apexpadEngineReady;
  }

  globalForEngine.apexpadEngineReady = (async () => {
    await ensureFtsSetup();

    const memoryRouter = new MemoryRouter();
    const distillationPipeline = new DistillationPipeline();
    const contextEngine = new ContextEngine(memoryRouter, distillationPipeline);
    const dagOrchestrator = new ApexDagOrchestrator(memoryRouter, contextEngine);
    const modelAdapter = new ModelRetrievalAdapter(
      memoryRouter,
      distillationPipeline,
      contextEngine
    );
    const specStructurer = new SpecificationStructurer(memoryRouter, contextEngine);
    const codeGuardrails = new ModelGenerationGuardrails();
    const runtimeVerifier = new RuntimeVerificationEngine({
      contextEngine,
      distillationPipeline,
    });
    const fullPipeline = new FullApexSystemPipeline({
      memoryRouter,
      distillationPipeline,
      contextEngine,
      dagOrchestrator,
      specStructurer,
      codeGuardrails,
      runtimeVerifier,
    });
    const e2eSuite = new ApexE2eVerificationSuite({
      memoryRouter,
      contextEngine,
      distillationPipeline,
      specStructurer,
      codeGuardrails,
      runtimeVerifier,
      dagOrchestrator,
      fullPipeline,
    });

    const engine: ApexEngine = {
      memoryRouter,
      distillationPipeline,
      contextEngine,
      dagOrchestrator,
      modelAdapter,
      specStructurer,
      codeGuardrails,
      runtimeVerifier,
      fullPipeline,
      e2eSuite,
      projectSlug: PROJECT_SLUG,
    };

    await seedDemoProject(engine);

    globalForEngine.apexpadEngine = engine;
    globalForEngine.apexpadEngineVersion = ENGINE_VERSION;
    return engine;
  })();

  return globalForEngine.apexpadEngineReady;
}

/** Helper for route handlers: resolve engine + safe project slug from body. */
export async function withEngine<T>(
  handler: (engine: ApexEngine, projectSlug: string) => Promise<T>
): Promise<T> {
  const engine = await getEngine();
  return handler(engine, engine.projectSlug);
}

/* ------------------------------------------------------------------ */
/* DEMO SEED                                                           */
/* ------------------------------------------------------------------ */

const DEMO_QUERY_DB = `import { Database } from './connection';

/**
 * Raw SQLite query execution layer for ApexPad brain storage.
 * All persistence flows through executeRawQuery.
 */
export function executeRawQuery(sql: string): { rows: unknown[]; rowsAffected: number } {
  if (!sql || sql.trim().length === 0) {
    throw new Error('Refusing to execute empty SQL statement');
  }
  const db = Database.open('.apexpad/apexpad_brain.sqlite');
  try {
    const stmt = db.prepare(sql);
    const rows = stmt.all();
    return { rows, rowsAffected: stmt.changes };
  } catch (err) {
    console.error('SQL execution failed', err);
    throw err;
  } finally {
    db.close();
  }
}

export function vacuumDatabase(): boolean {
  if (!executeRawQuery('VACUUM')) {
    return false;
  }
  return true;
}
`;

const DEMO_SERVICE_USER = `import { executeRawQuery } from '../db/query';

/**
 * Account service layer. Reads flow db -> service -> renderer, never sideways.
 */
export function fetchUserAccount(id: string): { id: string; plan: string; seats: number } {
  const { rows } = executeRawQuery(\`SELECT id, plan, seats FROM accounts WHERE id = '\${id}'\`);
  if (rows.length === 0) {
    throw new Error(\`Account \${id} not found\`);
  }
  return rows[0] as { id: string; plan: string; seats: number };
}

export function listAllAccounts() {
  return executeRawQuery('SELECT id, plan FROM accounts ORDER BY created_at DESC').rows;
}
`;

const DEMO_RENDERER_PROFILE = `import { fetchUserAccount } from '../service/user';

/**
 * Renderer profile view. MUST NOT import the db layer directly (see Project DNA:
 * no_renderer_to_db gate). Data access always goes through the service layer.
 */
export function renderUserProfile(id: string) {
  const account = fetchUserAccount(id);
  if (account.plan === 'trial') {
    return { view: 'upsell', seats: account.seats };
  }
  return { view: 'profile', seats: account.seats };
}
`;

const DEMO_MEMORY_VAULT = `import { compressAndStoreCcr } from './ccr';

/**
 * Project DNA Vault — immutable invariants promoted after 3-session confirmation.
 * Linked Note: [[Context & Memory Mechanics]]
 */
export class ProjectDnaVault {
  private rules: Map<string, string> = new Map();

  public promoteRule(ruleKey: string, statement: string, confirmations: number): boolean {
    if (confirmations < 3) {
      return false;
    }
    this.rules.set(ruleKey, statement);
    return true;
  }

  public getStatement(ruleKey: string): string {
    const found = this.rules.get(ruleKey);
    if (!found) {
      throw new Error(\`Unknown DNA rule: \${ruleKey}\`);
    }
    return found;
  }

  public toJSON(): Record<string, string> {
    const payload: Record<string, string> = {};
    for (const [k, v] of this.rules.entries()) {
      payload[k] = v;
    }
    return compressAndStoreCcr(JSON.stringify(payload)).stub;
  }
}
`;

const DEMO_CCR = `import { smartCrushJson } from './crushers';

/**
 * Compress-Cache-Retrieve (CCR) lossless block store with TOIN reinforcement.
 */
export function compressAndStoreCcr(raw: string): { id: string; stub: string; ratio: number } {
  const original = raw.length;
  if (original <= 512) {
    return { id: 'ccr_inline', stub: raw, ratio: 1.0 };
  }
  const stub = smartCrushJson(raw);
  if (stub.length === 0) {
    throw new Error('CCR compression produced empty stub');
  }
  return {
    id: 'ccr_' + Math.abs(hash(raw)).toString(16),
    stub,
    ratio: Number((stub.length / original).toFixed(3)),
  };
}

function hash(input: string): number {
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = (h * 33) ^ input.charCodeAt(i);
  }
  return h | 0;
}
`;

const DEMO_TEST_CCR = `import { describe, it, expect } from 'vitest';
import { compressAndStoreCcr } from '../ccr';

describe('compressAndStoreCcr', () => {
  it('keeps small payloads inline without folding', () => {
    const small = '{"a":1}';
    const result = compressAndStoreCcr(small);
    expect(result.ratio).toBe(1.0);
    expect(result.stub).toBe(small);
  });

  it('throws on empty compression output', () => {
    expect(() => compressAndStoreCcr('x'.repeat(600))).toBeTruthy;
  });
});
`;

const DEMO_ARCHITECTURE_NOTE = `# ApexPad Architecture Notes

## Context & Memory Mechanics
- Linked Note: [[Project DNA Vault#Invariants]]
- Every tool output passes through Headroom CCR lossless compression.

## Invariants
- Renderer must never import the db layer directly.
- Frozen prefix must stay byte-identical across prompts (KV-cache).
- Memories bound to file blob hashes go stale when hashes change.
`;

async function seedDemoProject(engine: ApexEngine): Promise<void> {
  const existingSymbols = await db.astSymbol.count({
    where: { projectSlug: PROJECT_SLUG },
  });

  const fileContents: Record<string, string> = {
    'src/db/query.ts': DEMO_QUERY_DB,
    'src/service/user.ts': DEMO_SERVICE_USER,
    'src/renderer/ProfileView.tsx': DEMO_RENDERER_PROFILE,
    'src/memory/dnaVault.ts': DEMO_MEMORY_VAULT,
    'src/memory/ccr.ts': DEMO_CCR,
    'src/memory/ccr.test.ts': DEMO_TEST_CCR,
    'notes/architecture.md': DEMO_ARCHITECTURE_NOTE,
  };

  if (existingSymbols > 0) {
    // DB seed already present — but the in-memory workspace store is EPHEMERAL
    // (globalThis, dies with the process). Rehydrate it unconditionally so
    // import resolution, blast radius and the compiler gate see the files.
    for (const [filePath, content] of Object.entries(fileContents)) {
      getWorkspaceFileStore().set(filePath, content);
    }
    return;
  }

  // Seed sessions with summaries so SessionStart hook shows history
  const dayAgo = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();
  await db.sdkSession.createMany({
    data: [
      {
        sessionId: 'sess_seed_alpha',
        projectSlug: PROJECT_SLUG,
        branchName: 'main',
        firstPrompt: 'Design the CCR lossless compression loop',
        promptCount: 4,
        status: 'completed',
        startedAt: dayAgo(72),
        endedAt: dayAgo(71),
      },
      {
        sessionId: 'sess_seed_beta',
        projectSlug: PROJECT_SLUG,
        branchName: 'main',
        firstPrompt: 'Wire Project DNA promotion gate',
        promptCount: 7,
        status: 'completed',
        startedAt: dayAgo(24),
        endedAt: dayAgo(23),
      },
    ],
  });

  await db.sessionSummary.createMany({
    data: [
      {
        sessionId: 'sess_seed_alpha',
        projectSlug: PROJECT_SLUG,
        requested: 'Design the CCR lossless compression loop with TOIN scoring.',
        investigated: 'Compared JSON crusher vs AST compressor output ratios.',
        learned: 'SmartCrusher retains schema + head/tail samples + anomalies at 60-95% savings.',
        completed: 'CCR block store wired with retrieval_count + value_score reinforcement.',
        tokenCount: 168,
        createdAt: dayAgo(71),
      },
      {
        sessionId: 'sess_seed_beta',
        projectSlug: PROJECT_SLUG,
        requested: 'Wire Project DNA promotion gate (3-session rule).',
        investigated: 'Traced observation confirmation flow across sessions.',
        learned: 'Immutability of DNA rules prevents context pollution drift.',
        completed: 'Promotion hook fires when confirmation_count >= 3.',
        tokenCount: 142,
        createdAt: dayAgo(23),
      },
    ],
  });

  // Seed Project DNA (including the layer deny rule used by the blast-radius gate)
  const now = new Date().toISOString();
  await db.projectDna.createMany({
    data: [
      {
        id: 'dna_seed_001',
        projectSlug: PROJECT_SLUG,
        category: 'architecture',
        ruleKey: 'no_renderer_to_db',
        ruleStatement:
          'Renderer UI components must never import the SQLite db layer directly. Data access flows db -> service -> renderer.',
        sourceObservationIds: JSON.stringify(['obs_seed_dna']),
        confirmationSessions: 4,
        enforcedInCi: true,
        layerDenyRule: 'deny renderer -> db',
        createdAt: dayAgo(80),
        updatedAt: now,
      },
      {
        id: 'dna_seed_002',
        projectSlug: PROJECT_SLUG,
        category: 'convention',
        ruleKey: 'frozen_prefix_byte_stability',
        ruleStatement:
          'The frozen prefix (system contract + Project DNA) must remain byte-identical across prompts for 100% KV-cache hits.',
        sourceObservationIds: JSON.stringify(['obs_seed_dna2']),
        confirmationSessions: 3,
        enforcedInCi: true,
        layerDenyRule: null,
        createdAt: dayAgo(60),
        updatedAt: now,
      },
      {
        id: 'dna_seed_003',
        projectSlug: PROJECT_SLUG,
        category: 'forbidden_pattern',
        ruleKey: 'no_stub_placeholders',
        ruleStatement:
          'Never emit stub implementations or TODO placeholders in committed artifacts.',
        sourceObservationIds: JSON.stringify([]),
        confirmationSessions: 5,
        enforcedInCi: true,
        layerDenyRule: null,
        createdAt: dayAgo(90),
        updatedAt: now,
      },
    ],
  });

  // Index all demo files (AST symbols) + rebuild the call graph
  for (const [filePath, content] of Object.entries(fileContents)) {
    await engine.contextEngine.indexFileSymbols({
      projectSlug: PROJECT_SLUG,
      filePath,
      content,
    });
  }
  await engine.contextEngine.rebuildCallGraphEdges(PROJECT_SLUG, fileContents);

  // Seed observations (one repeats to 3 confirmations -> auto-promoted into DNA)
  const obsSeed = await engine.memoryRouter.recordObservation({
    sessionId: 'sess_seed_alpha',
    projectSlug: PROJECT_SLUG,
    scope: 'repo',
    category: 'decision',
    title: 'CCR blocks are the single source of truth for compressed payloads',
    subtitle: 'Compress-Cache-Retrieve architecture decision',
    narrative:
      'Every tool output above 140 tokens is routed through the ContentRouter, crushed by the appropriate compressor, and stored losslessly in ccr_blocks with a reversible <ccr_ref> marker. LLM agents call headroom_retrieve(ccrId) on demand.',
    facts: [
      'SHA-256 hash keys every CCR block deterministically',
      'TOIN value_score rises 25% toward 1.0 per retrieval',
    ],
    referencedFiles: ['src/memory/ccr.ts'],
    referencedSymbols: ['compressAndStoreCcr', 'smartCrushJson'],
    gitBlobHashes: {},
  });

  // Repeat the same observation twice more -> 3 confirmations -> DNA promotion
  await engine.memoryRouter.recordObservation({
    sessionId: 'sess_seed_beta',
    projectSlug: PROJECT_SLUG,
    scope: 'repo',
    category: 'decision',
    title: 'CCR blocks are the single source of truth for compressed payloads',
    subtitle: 'Re-confirmed during DAG staging review',
    narrative:
      'Re-verified during artifact staging: all staged diffs reference CCR stubs rather than raw payloads.',
    facts: ['Confirmed in staging gate'],
    referencedFiles: ['src/memory/ccr.ts'],
    referencedSymbols: ['compressAndStoreCcr'],
    gitBlobHashes: {},
  });
  await engine.memoryRouter.recordObservation({
    sessionId: 'sess_seed_beta',
    projectSlug: PROJECT_SLUG,
    scope: 'repo',
    category: 'decision',
    title: 'CCR blocks are the single source of truth for compressed payloads',
    subtitle: 'Third confirmation from test run',
    narrative:
      'Test suite verified that retrieval counters increment and stubs round-trip losslessly.',
    facts: ['cch test suite green'],
    referencedFiles: ['src/memory/ccr.ts'],
    referencedSymbols: ['compressAndStoreCcr'],
    gitBlobHashes: {},
  });

  await engine.memoryRouter.recordObservation({
    sessionId: 'sess_seed_alpha',
    projectSlug: PROJECT_SLUG,
    scope: 'repo',
    category: 'bugfix',
    title: 'Empty SQL statements now throw before touching the database',
    subtitle: 'Contract hardening in query layer',
    narrative:
      'executeRawQuery previously allowed empty strings through to the SQLite driver, producing cryptic driver errors. A guard clause now throws a descriptive Error immediately.',
    facts: ['Guard clause added at function entry', 'console.error retained for diagnostics'],
    referencedFiles: ['src/db/query.ts'],
    referencedSymbols: ['executeRawQuery'],
    gitBlobHashes: {},
  });

  await engine.memoryRouter.recordObservation({
    sessionId: 'sess_seed_beta',
    projectSlug: PROJECT_SLUG,
    scope: 'repo',
    category: 'arch_rule',
    title: 'Layer flow is strictly db -> service -> renderer',
    subtitle: 'Enforced via Project DNA deny rule',
    narrative:
      'The no_renderer_to_db DNA gate blocks any renderer file whose proposed content imports from the db layer. Ripwire blast radius flags this as an architecture violation and halts the DAG at staging.',
    facts: ['deny renderer -> db', 'Violations halt DAG with status halted_on_violation'],
    referencedFiles: ['src/renderer/ProfileView.tsx', 'src/service/user.ts'],
    referencedSymbols: ['renderUserProfile', 'fetchUserAccount'],
    gitBlobHashes: {},
  });

  await engine.memoryRouter.recordObservation({
    sessionId: 'sess_seed_beta',
    projectSlug: PROJECT_SLUG,
    scope: 'branch',
    category: 'invariant',
    title: 'Frozen prefix must stay byte-identical across prompts',
    subtitle: 'KV-cache alignment invariant',
    narrative:
      'CacheAligner sorts DNA rules by ruleKey and pins the system contract before the live zone. Any byte drift would invalidate provider KV-cache and re-bill the full prompt.',
    facts: ['Prefix hash verified identical across two different live prompts'],
    referencedFiles: ['notes/architecture.md'],
    referencedSymbols: [],
    gitBlobHashes: {},
  });

  await engine.memoryRouter.recordObservation({
    sessionId: 'sess_seed_alpha',
    projectSlug: PROJECT_SLUG,
    scope: 'global',
    category: 'note_synthesis',
    title: 'Progressive disclosure tiers: Index -> Timeline -> Full',
    subtitle: 'Claude-Mem 3-layer memory protocol',
    narrative:
      'Tier-0 index hits cost ~50-80 tokens each, Tier-1 timeline neighborhoods ~150 tokens, and Tier-2 full observations are fetched only for top seeds. This protocol achieves ~10x token savings versus naive RAG dumps.',
    facts: ['bm25 ranking weights title 5.0, subtitle 3.0, files 4.0'],
    referencedFiles: ['src/memory/dnaVault.ts'],
    referencedSymbols: ['ProjectDnaVault'],
    gitBlobHashes: {},
  });

  // Pre-compress one CCR demo block so the DAG tab has a Re-inflate button on first load
  await engine.distillationPipeline.compressAndStoreCCR({
    sessionId: 'sess_seed_beta',
    sourceLabel: 'tool:log_stream',
    rawContent: Array.from(
      { length: 40 },
      (_, i) => `2026-11-08T12:00:00Z INFO Test case #${i} passed`
    ).join('\n'),
  });

  // Prime the workspace store reference (already populated by indexFileSymbols)
  getWorkspaceFileStore();

  void obsSeed;
}
