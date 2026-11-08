/**
 * src/components/apexpad/constants.ts
 * Static defaults for the ApexPad workbench.
 *
 * DESIGN.md §3 is the design-token source of truth (CSS custom properties
 * in globals.css @theme). This file mirrors ONLY the hex values that
 * <canvas> rendering cannot read from CSS (minimap paint), plus app copy
 * constants and the glossary used by the <Term> helper.
 */

export const APEXPAD_PROJECT_SLUG = 'apexpad-editor-v1'
export const APEXPAD_VERSION = 'APEX-EDITOR-V1'
export const APEXPAD_ACTIVE_FILE = 'src/architecture/ContextNote.ts'
export const APEXPAD_INDEX_TASK_PROMPT = 'workbench: live editor indexing'

export const EDITOR_LINE_HEIGHT_PX = 21 // text-[13px] leading-[1.6] ≈ 20.8px
export const EDITOR_DEBOUNCE_MS = 500

/**
 * Canvas mirror of the CSS tokens (globals.css @theme).
 * Canvas 2D contexts cannot resolve CSS custom properties, so the minimap
 * reads from this object. Keep in sync with DESIGN.md §3.
 */
export const CANVAS_PALETTE = {
  vault: '#0d1117',
  panel: '#161b22',
  wire: '#30363d',
  ink: '#c9d1d9',
  inkMuted: '#8b949e',
  signalInfo: '#58a6ff',
  signalLive: '#3fb950',
  signalGate: '#d29922',
  signalDanger: '#f85149',
  signalMemory: '#d2a8ff',
  action: '#238636',
} as const

/**
 * Blueprint glossary (DESIGN.md §13 — "Tier 0 for concepts").
 * One-line definitions surfaced via <Term term="CCR" /> hover/focus
 * tooltips; the glossary dialog lists them all.
 */
export const GLOSSARY: Record<string, string> = {
  CCR: 'Compressed Context Record — a lossless digest of a cold conversation span, stored so the agent can re-read history without re-paying full tokens.',
  TOIN: 'Tier-1 Observation Integrity Number — 0…1 score of how faithfully a compressed block can be reconstructed from the tier above it.',
  Ripwire: 'The AST indexer — parses the note into a symbol graph (functions, interfaces, edges) that powers the outline and jump-to-symbol.',
  PPR: 'Personalized PageRank — ranks AST symbols by structural importance so "hot" code floats to the top of the outline.',
  'U-Curve': 'The context budget shape: fixed frozen prefix + live zone. Pressure above the ceiling forces CCR compression of the coldest spans.',
  MEM0: 'Memory routing convention — picks the memory scope (session / branch / global) a query should read from.',
  'Frozen Prefix': 'The hash-stable head of the prompt. Mutating it invalidates the provider KV-cache and re-prices every later turn.',
  'KV-Cache Aligned': 'Prompt layout kept byte-stable so the provider cache hits; the frozen prefix hash must never change mid-session.',
  BM25: 'Classic keyword ranking over the Tier-0 index — the fast, exact-match search layer under the memory timeline.',
  'Headroom CCR': 'PostToolUse compression pass — when the live zone exceeds headroom, oldest tool output is compressed into a CCR block.',
  'Re-inflate': 'Rebuild a compressed CCR block from its source observations, scored by TOIN fidelity.',
  'DNA Vault': 'The invariant store — allow/deny rules that gate what the agent may write to disk. A layer-deny rule hard-blocks frozen-prefix edits.',
  DAG: 'Directed acyclic graph of staged edits — each artifact flows stage → verify → human approval → commit.',
  RefMap: 'Reference map syntax (@e1, @e2…) linking planner output to concrete artifacts in the pipeline.',
}

/**
 * Seed note (~60 lines) describing ApexPad's Context & Memory mechanics.
 * Contains imports, heading comments, a backlink, `calculateContextBudget`,
 * and a small nested object so the AST/backlink indexer has something to chew.
 */
export const DEFAULT_NOTE_CONTENT = `/**
 * ApexPad Working Note — Context & Memory Mechanics
 * Linked Note: [[Project DNA Vault#Invariants]]
 * Linked Note: [[Ripwire AST Graph#PPR Ranking]]
 */

import { AstSymbolNode } from '@/lib/ripwire/ast-graph';
import { MemoryScope } from '@/lib/claude-mem/index-types';

// ### Frozen Prefix Invariants
// The frozen prefix is hash-stable (KV-Cache Aligned). Mutating it mid-session
// invalidates the provider prompt cache and re-prices every subsequent turn.
// DNA GATE: layer deny refuses any write that touches the frozen prefix hash.

export const CONTEXT_BUDGET_CEILING = 12_000;
export const BYTE_CEILING = 48_000;
export const U_CURVE_PRESSURE = 0.82;

export interface ContextBudgetInput {
  frozenPrefixTokens: number;
  liveZoneTokens: number;
  headroomReservedTokens: number;
}

export interface ContextBudgetReport {
  totalTokens: number;
  withinCeiling: boolean;
  compressionDebtTokens: number;
  disclosures: string[];
}

// ### Budget Math (U-Curve)
export function calculateContextBudget(input: ContextBudgetInput): ContextBudgetReport {
  const headroom = CONTEXT_BUDGET_CEILING - input.headroomReservedTokens;
  const totalTokens = input.frozenPrefixTokens + input.liveZoneTokens;
  const withinCeiling = totalTokens <= headroom;
  const compressionDebtTokens = Math.max(0, totalTokens - headroom);
  const disclosures: string[] = [];
  if (!withinCeiling) {
    disclosures.push('U-CURVE: live zone exceeded ceiling; CCR compression applied to cold spans.');
  }
  if (compressionDebtTokens > CONTEXT_BUDGET_CEILING * U_CURVE_PRESSURE) {
    disclosures.push('U-CURVE: debt above pressure threshold; oldest observations demoted to stubs.');
  }
  return { totalTokens, withinCeiling, compressionDebtTokens, disclosures };
}

// ### Memory Tier Probes (Progressive Disclosure)
export const memoryTierProbes = {
  tier0Index: { label: 'BM25 index probe', tokenCost: 64, discloses: 'titles + subtitles only' },
  tier1Timeline: { label: 'anchor timeline window', tokenCost: 512, discloses: '±3 observations + prompt context' },
  tier2FullRecord: { label: 'full observation records', tokenCost: 4096, discloses: 'narrative + facts + refs' },
} as const;

// ### Ripwire PPR Weighting
export function pprWeight(symbol: AstSymbolNode): number {
  const complexityPenalty = symbol.cyclomaticComplexity > 5 ? 0.65 : 1.0;
  const testBonus = symbol.hasTestCoverage ? 1.1 : 0.9;
  return symbol.pageRankScore * complexityPenalty * testBonus;
}

// ### Session Router (MEM0-style scope selection)
export function routeMemoryScope(query: string, branch: string): MemoryScope {
  if (query.includes('invariant') || query.includes('dna')) return 'global';
  if (query.includes(branch)) return 'branch';
  return 'session';
}

// TODO(next): wire Headroom CCR re-inflation into the retrieve path.
// TODO(next): LangGraph artifact staging must halt when architectureViolations.length > 0.
`
