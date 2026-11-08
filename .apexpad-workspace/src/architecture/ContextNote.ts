/**
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
