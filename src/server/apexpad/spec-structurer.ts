/**
 * src/server/apexpad/spec-structurer.ts
 * TASK 2: Input & Specification Structurer
 * Transforms unstructured human prompts into deterministic PRD Contracts,
 * auto-injects Project DNA constraints, resolves AST targets, and splits
 * overloaded tasks into an atomic Subtask DAG.
 *
 * APEX-EDITOR-V1 Slice 1 blueprint §7.3 — zero-stub implementation.
 * Stack adaptation: Prisma (async) replaces better-sqlite3 (sync);
 * all resolution primitives delegate to the Task 1 engine modules.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { publishCaptureEvent } from './event-bus';
import { MemoryRouter } from './memory-router';
import { ContextEngine } from './context-engine';
import type {
  AtomicSubtaskNode,
  StructuredSpecContract,
} from '@/lib/apexpad-guardrails-types';

/** Strict runtime guard for the `reasoning_complexity` CHECK constraint. */
const COMPLEXITY_LEVELS = ['low', 'medium', 'high'] as const;
type ComplexityLevel = (typeof COMPLEXITY_LEVELS)[number];

function assertComplexity(value: string): asserts value is ComplexityLevel {
  if (!COMPLEXITY_LEVELS.includes(value as ComplexityLevel)) {
    throw new Error(`Invalid reasoning complexity: ${value}`);
  }
}

export class SpecificationStructurer {
  private memoryRouter: MemoryRouter;
  private contextEngine: ContextEngine;

  constructor(memoryRouter: MemoryRouter, contextEngine: ContextEngine) {
    this.memoryRouter = memoryRouter;
    this.contextEngine = contextEngine;
  }

  /**
   * Compiles a raw, unstructured user prompt into a deterministic,
   * AST-grounded Specification Contract.
   */
  public async compileSpecificationContract(params: {
    sessionId: string;
    projectSlug: string;
    rawUserPrompt: string;
  }): Promise<StructuredSpecContract> {
    const cleanPrompt = MemoryRouter.scrubPrivateContent(params.rawUserPrompt.trim());
    const now = new Date().toISOString();
    const specId = `spec_${crypto.randomBytes(6).toString('hex')}`;

    // 1. Rank workspace AST symbols against the raw prompt to ground implicit references
    const rankedSymbols = (
      await this.contextEngine.computePersonalizedPageRank(
        params.projectSlug,
        cleanPrompt
      )
    ).slice(0, 8);
    const matchedFiles = Array.from(new Set(rankedSymbols.map((s) => s.filePath)));
    const matchedSymbolNames = rankedSymbols.map((s) => s.symbolName);

    // 2. Detect Ambiguities in the raw prompt
    const detectedAmbiguities: string[] = [];
    if (matchedFiles.length === 0) {
      detectedAmbiguities.push(
        'No existing workspace file or AST symbol matched the prompt directly; new module creation or broader search required.'
      );
    }
    if (
      /\b(fix it|make it work|optimize this|clean up|update it)\b/i.test(cleanPrompt) &&
      cleanPrompt.length < 60
    ) {
      detectedAmbiguities.push(
        'Underspecified action verb detected without explicit error trace or target signature; grounded to top PageRank symbols.'
      );
    }

    // 3. Auto-Inject Implicit Constraints from Project DNA + Baseline Engineering Guardrails
    const dnaRules = await this.memoryRouter.getProjectDnaRules(params.projectSlug);
    const injectedImplicitConstraints: string[] = [
      'ZERO_TRUNCATION: Never emit placeholder comments such as "// ... rest of code ..."; preserve all existing symbol implementations.',
      'IMPORT_INTEGRITY: Only import packages declared in package.json or verified workspace relative paths.',
      'SECRET_HYGIENE: Never hardcode API keys, credentials, or tokens in source files.',
      ...dnaRules.map(
        (rule) =>
          `PROJECT_DNA [${rule.ruleKey}]: ${rule.ruleStatement}${
            rule.layerDenyRule ? ` (ENFORCED GATE: ${rule.layerDenyRule})` : ''
          }`
      ),
    ];

    // 4. Extract Existing Signature & Schema Contracts from matched AST nodes
    const schemaAndSignatureContracts = rankedSymbols.map(
      (sym) =>
        `${sym.filePath}:${sym.startLine}-${sym.endLine} -> ${sym.signature} (Cyclomatic=${sym.cyclomaticComplexity}, Tested=${sym.hasTestCoverage})`
    );

    // 5. Split Overloaded Prompts into an Atomic Subtask DAG
    const clauses = this.splitCompoundClauses(cleanPrompt);
    const isOverloadedPromptSplit = clauses.length > 1;
    const subtaskDag: AtomicSubtaskNode[] = [];

    // Node 1: Always start with a Research & Blast-Radius Grounding Subtask
    const researchSubtaskId = `${specId}_sub_1`;
    subtaskDag.push({
      subtaskId: researchSubtaskId,
      orderIndex: 1,
      assignedAgent: 'researcher',
      title: `Ground AST dependencies & progressive memory for: ${clauses[0].slice(0, 60)}`,
      targetFiles: matchedFiles.slice(0, 4),
      targetSymbols: matchedSymbolNames.slice(0, 6),
      explicitConstraints: injectedImplicitConstraints.slice(0, 4),
      verificationCommand: 'ripwire --impact --for-task',
      dependsOnSubtaskIds: [],
    });

    // Node 2..N: One atomic Architect Subtask per decomposed clause
    const architectSubtaskIds: string[] = [];
    clauses.forEach((clause, idx) => {
      const archId = `${specId}_sub_${idx + 2}`;
      architectSubtaskIds.push(archId);
      subtaskDag.push({
        subtaskId: archId,
        orderIndex: idx + 2,
        assignedAgent: 'architect',
        title: `Implement atomic change #${idx + 1}: ${clause}`,
        targetFiles: matchedFiles.slice(0, 3),
        targetSymbols: matchedSymbolNames.slice(0, 4),
        explicitConstraints: injectedImplicitConstraints,
        verificationCommand: 'tsc --noEmit',
        dependsOnSubtaskIds:
          idx === 0 ? [researchSubtaskId] : [architectSubtaskIds[idx - 1]],
      });
    });

    // Final Node: Automated Runtime & Agent-Browser Verification Gate
    const verifySubtaskId = `${specId}_sub_${subtaskDag.length + 1}`;
    subtaskDag.push({
      subtaskId: verifySubtaskId,
      orderIndex: subtaskDag.length + 1,
      assignedAgent: 'verifier',
      title:
        'Run Anti-Truncation Guard, TypeScript Gate, Test Gate & Agent-Browser Snapshot Verification',
      targetFiles: matchedFiles,
      targetSymbols: matchedSymbolNames,
      explicitConstraints: [
        'All existing callers must pass type-checking without signature breakage.',
        'Interactive UI refs (@e1..@eN) must pass loud-failure visibility checks.',
      ],
      verificationCommand: 'vitest run && agent-browser snapshot -i',
      dependsOnSubtaskIds: architectSubtaskIds,
    });

    const acceptanceCriteria = [
      `All ${subtaskDag.length} atomic DAG subtasks complete with zero guardrail violations.`,
      `Zero hallucinated package imports or lazy truncation comments in ${
        matchedFiles.join(', ') || 'target files'
      }.`,
      `Ripwire layer-deny gates (${dnaRules.filter((d) => d.layerDenyRule).length} active) report 0 violations.`,
      `Compiler type-check and affected test files pass cleanly prior to Human Approval.`,
    ];

    const estimatedComplexityRaw: StructuredSpecContract['estimatedReasoningComplexity'] =
      clauses.length >= 3 || rankedSymbols.some((s) => s.cyclomaticComplexity >= 8)
        ? 'high'
        : clauses.length === 2
          ? 'medium'
          : 'low';
    assertComplexity(estimatedComplexityRaw);
    const estimatedReasoningComplexity = estimatedComplexityRaw;

    const normalizedGoal = clauses.map((c, i) => `[Step ${i + 1}] ${c}`).join(' -> ');

    await db.structuredSpec.create({
      data: {
        specId,
        sessionId: params.sessionId,
        projectSlug: params.projectSlug,
        rawUserPrompt: params.rawUserPrompt,
        normalizedGoal,
        detectedAmbiguitiesJson: JSON.stringify(detectedAmbiguities),
        injectedConstraintsJson: JSON.stringify(injectedImplicitConstraints),
        schemaContractsJson: JSON.stringify(schemaAndSignatureContracts),
        subtaskDagJson: JSON.stringify(subtaskDag),
        acceptanceCriteriaJson: JSON.stringify(acceptanceCriteria),
        isOverloadedSplit: isOverloadedPromptSplit,
        reasoningComplexity: estimatedReasoningComplexity,
        createdAt: now,
      },
    });

    publishCaptureEvent('spec:structured', params.sessionId, params.projectSlug, {
      specId,
      isOverloadedPromptSplit,
      estimatedReasoningComplexity,
      subtaskCount: subtaskDag.length,
      ambiguityCount: detectedAmbiguities.length,
      injectedConstraintCount: injectedImplicitConstraints.length,
      matchedFiles: matchedFiles.length,
    });

    return {
      specId,
      sessionId: params.sessionId,
      projectSlug: params.projectSlug,
      rawUserPrompt: params.rawUserPrompt,
      normalizedGoal,
      detectedAmbiguities,
      injectedImplicitConstraints,
      schemaAndSignatureContracts,
      subtaskDag,
      acceptanceCriteria,
      isOverloadedPromptSplit,
      estimatedReasoningComplexity,
      createdAt: now,
    };
  }

  /** Lists the most recent specification contracts for a session (Spec panel history). */
  public async listRecentSpecs(sessionId: string, limit = 10): Promise<StructuredSpecContract[]> {
    const rows = await db.structuredSpec.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapSpecRow);
  }

  /** Fetches one specification contract by id, or null when unknown. */
  public async getSpec(specId: string): Promise<StructuredSpecContract | null> {
    const row = await db.structuredSpec.findUnique({ where: { specId } });
    return row ? mapSpecRow(row) : null;
  }

  /**
   * Splits overloaded multi-concern user prompts into atomic engineering clauses.
   * Split points: "and then", "also", semicolons, markdown/numbered list items,
   * and "and" followed by an explicit imperative verb.
   */
  private splitCompoundClauses(prompt: string): string[] {
    const rawParts = prompt
      .split(
        /(?:\s+and\s+then\s+|\s+also\s+|\s*;\s*|\n+\s*[-*\d.]+\s+|\s+and\s+(?=(?:build|create|add|update|connect|refactor|fix|implement|wire|remove|delete)\b))/i
      )
      .map((p) => p.trim())
      .filter((p) => p.length > 4);
    return rawParts.length > 0 ? rawParts : [prompt];
  }
}

/* ------------------------------------------------------------------ */
/* Row mapping helpers                                                 */
/* ------------------------------------------------------------------ */

export function mapSpecRow(
  row: import('@prisma/client').Prisma.StructuredSpecGetPayload<Record<string, never>>
): StructuredSpecContract {
  return {
    specId: row.specId,
    sessionId: row.sessionId,
    projectSlug: row.projectSlug,
    rawUserPrompt: row.rawUserPrompt,
    normalizedGoal: row.normalizedGoal,
    detectedAmbiguities: safeParseArray(row.detectedAmbiguitiesJson),
    injectedImplicitConstraints: safeParseArray(row.injectedConstraintsJson),
    schemaAndSignatureContracts: safeParseArray(row.schemaContractsJson),
    subtaskDag: safeParseSubtasks(row.subtaskDagJson),
    acceptanceCriteria: safeParseArray(row.acceptanceCriteriaJson),
    isOverloadedPromptSplit: row.isOverloadedSplit,
    estimatedReasoningComplexity: row.reasoningComplexity as StructuredSpecContract['estimatedReasoningComplexity'],
    createdAt: row.createdAt,
  };
}

function safeParseArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function safeParseSubtasks(json: string): AtomicSubtaskNode[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isAtomicSubtaskNode);
  } catch {
    return [];
  }
}

const VALID_AGENT_ROLES: ReadonlySet<string> = new Set(['researcher', 'architect', 'verifier']);

function isAtomicSubtaskNode(value: unknown): value is AtomicSubtaskNode {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as Record<string, unknown>;
  return (
    typeof node.subtaskId === 'string' &&
    typeof node.orderIndex === 'number' &&
    typeof node.assignedAgent === 'string' &&
    VALID_AGENT_ROLES.has(node.assignedAgent) &&
    typeof node.title === 'string' &&
    Array.isArray(node.targetFiles) &&
    Array.isArray(node.targetSymbols) &&
    Array.isArray(node.explicitConstraints) &&
    typeof node.verificationCommand === 'string' &&
    Array.isArray(node.dependsOnSubtaskIds)
  );
}
