/**
 * src/server/apexpad/full-pipeline.ts
 * §7.6 Unified End-to-End Pipeline Controller.
 *
 * Master pipeline integrating Tasks 1, 2, 3, and 4 into one deterministic
 * flow (blueprint §7.6):
 *   STAGE 1 (Task 2): compile the deterministic Specification Contract
 *                     & Subtask DAG from the raw user prompt.
 *   STAGE 2 (Task 3): run the Anti-Truncation AST Splicer & Hallucination
 *                     Guardrails on every candidate edit; only auto-healed
 *                     code flows downstream.
 *   STAGE 3 (Task 1): execute the Context Packer, CrewAI Planner, Ripwire
 *                     Blast Radius & Artifact Staging (DAG orchestrator).
 *   STAGE 4 (Task 4): run the Compiler Gate, Test Gate & Agent-Browser
 *                     verification loop over every staged artifact.
 *
 * PHASE 10 (GAP #2 CLOSED — blueprint ITEM 2): a strict PRE-STAGING
 * QUARANTINE GATE (armed by default) evaluates every guardrail report after
 * healing. Any edit that still carries hallucinated imports, version skew,
 * or an unhealed lazy truncation placeholder is HARD-BLOCKED: it is
 * persisted to `quarantined_edits`, logged as a loud memory observation +
 * SSE event, and NEVER reaches Artifact Staging. Only verified-clean edits
 * enter `dagOrchestrator.executeDagUpToStaging`.
 *
 * Stack adaptation: async Prisma pipeline over the engine container
 * singletons (src/server/apexpad/engine.ts). Zero stubs.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { publishCaptureEvent } from './event-bus';
import { MemoryRouter } from './memory-router';
import { DistillationPipeline } from './distillation-pipeline';
import { ContextEngine } from './context-engine';
import { ApexDagOrchestrator } from './dag-orchestrator';
import { SpecificationStructurer } from './spec-structurer';
import { ModelGenerationGuardrails } from './guardrails';
import { RuntimeVerificationEngine } from './runtime-verifier';
import type {
  AgentBrowserActionCommand,
  FullApexPipelineResult,
  GuardrailInspectionReport,
  QuarantinedCandidateEdit,
  RuntimeVerificationReport,
  StructuredSpecContract,
} from '@/lib/apexpad-guardrails-types';
import type { DagExecutionState } from '@/lib/apexpad-types';

export interface CandidateEdit {
  targetFilePath: string;
  previousContent: string;
  proposedContent: string;
}

/** Lazy truncation marker that survived the AST splicer = unhealable. */
const TRUNCATION_PLACEHOLDER_PATTERN =
  /(\/\/\s*\.\.\.\s*(rest|remaining|existing)[^\n]*|\/\*\s*\.\.\.\s*(rest|remaining|existing)[^\n]*\*\/|\.\.\.\s*rest of existing code)/i;

export class FullApexSystemPipeline {
  public readonly specStructurer: SpecificationStructurer;
  public readonly codeGuardrails: ModelGenerationGuardrails;
  public readonly runtimeVerifier: RuntimeVerificationEngine;
  private dagOrchestrator: ApexDagOrchestrator;
  private memoryRouter: MemoryRouter;

  constructor(params: {
    memoryRouter: MemoryRouter;
    distillationPipeline: DistillationPipeline;
    contextEngine: ContextEngine;
    dagOrchestrator: ApexDagOrchestrator;
    specStructurer: SpecificationStructurer;
    codeGuardrails: ModelGenerationGuardrails;
    runtimeVerifier: RuntimeVerificationEngine;
  }) {
    this.specStructurer = params.specStructurer;
    this.codeGuardrails = params.codeGuardrails;
    this.runtimeVerifier = params.runtimeVerifier;
    this.dagOrchestrator = params.dagOrchestrator;
    this.memoryRouter = params.memoryRouter;
  }

  /**
   * Runs the full 4-Stage Engineering Pipeline from raw prompt to verified
   * Staged Artifact, pausing at the Human Approval Gate. With the strict
   * quarantine gate armed (default), failing candidate edits are
   * hard-blocked before staging.
   */
  public async executeFullPipeline(params: {
    sessionId: string;
    projectSlug: string;
    rawUserPrompt: string;
    tokenBudgetCeiling: number;
    candidateEdits: CandidateEdit[];
    browserVerificationScript?: AgentBrowserActionCommand[];
    strictQuarantineGate?: boolean;
  }): Promise<FullApexPipelineResult> {
    const startedAt = Date.now();
    const enforceQuarantine = params.strictQuarantineGate ?? true;

    // STAGE 0: ensure the memory session exists (idempotent) so progressive
    // disclosure recording downstream never loses the prompt.
    await this.memoryRouter.startSession({
      sessionId: params.sessionId,
      projectSlug: params.projectSlug,
      branchName: 'main',
      firstPrompt: params.rawUserPrompt,
    });

    // STAGE 1 (Task 2): Compile Deterministic Specification Contract & Subtask DAG
    const specContract: StructuredSpecContract =
      await this.specStructurer.compileSpecificationContract({
        sessionId: params.sessionId,
        projectSlug: params.projectSlug,
        rawUserPrompt: params.rawUserPrompt,
      });

    // STAGE 2 (Task 3): Anti-Truncation AST Splicer & Hallucination Guardrails
    // + PHASE 10 STRICT QUARANTINE GATE evaluation per candidate edit.
    const guardrailReports: GuardrailInspectionReport[] = [];
    const quarantinedEdits: QuarantinedCandidateEdit[] = [];
    const verifiedCleanEdits: CandidateEdit[] = [];

    for (const edit of params.candidateEdits) {
      const report = await this.codeGuardrails.inspectAndHealCandidateCode({
        sessionId: params.sessionId,
        projectSlug: params.projectSlug,
        targetFilePath: edit.targetFilePath,
        previousContent: edit.previousContent,
        proposedContent: edit.proposedContent,
        userPrompt: params.rawUserPrompt,
      });
      guardrailReports.push(report);

      // Collect blocking reasons across every guardrail dimension.
      const blockingReasons: string[] = [];
      for (const hallucination of report.hallucinatedImports) {
        blockingReasons.push(`Hallucinated import: "${hallucination}"`);
      }
      for (const skew of report.versionSkewWarnings) {
        blockingReasons.push(`Framework Version Skew: ${skew}`);
      }
      if (TRUNCATION_PLACEHOLDER_PATTERN.test(report.healedContent)) {
        blockingReasons.push(
          `Unhealed lazy truncation placeholder in ${edit.targetFilePath} — the AST splicer could not recover every dropped symbol.`
        );
      }

      if (enforceQuarantine && blockingReasons.length > 0) {
        // HARD QUARANTINE — never stage this edit.
        const quarantineId = `qtn_${crypto.randomBytes(6).toString('hex')}`;
        const quarantinedAt = new Date().toISOString();
        const quarantined: QuarantinedCandidateEdit = {
          quarantineId,
          targetFilePath: edit.targetFilePath,
          blockingReasons,
          guardrailReport: report,
          quarantinedAt,
        };
        quarantinedEdits.push(quarantined);

        await db.quarantinedEdit.create({
          data: {
            quarantineId,
            sessionId: params.sessionId,
            projectSlug: params.projectSlug,
            targetFilePath: edit.targetFilePath,
            blockingReasonsJson: JSON.stringify(blockingReasons),
            guardrailReportJson: JSON.stringify({
              guardId: report.guardId,
              passedAllGates: report.passedAllGates,
              wasAutoHealed: report.wasAutoHealed,
              truncationMatches: report.truncationMatches,
              missingSymbolsRecovered: report.missingSymbolsRecovered,
              hallucinatedImports: report.hallucinatedImports,
              versionSkewWarnings: report.versionSkewWarnings,
              sycophancyWarnings: report.sycophancyWarnings,
            }),
            quarantinedAt,
          },
        });

        // Log a loud quarantine observation into Mem0 so the agent (and the
        // operator timeline) cannot silently ignore the blocked edit.
        await this.memoryRouter.recordObservation({
          sessionId: params.sessionId,
          projectSlug: params.projectSlug,
          scope: 'session',
          category: 'security_alert',
          title: `QUARANTINED EDIT BLOCKED: ${edit.targetFilePath}`,
          subtitle: `${blockingReasons.length} blocking violation(s) before staging`,
          narrative: `Candidate edit to ${edit.targetFilePath} was hard-blocked by the strict quarantine gate and never reached Artifact Staging.\n${blockingReasons.map((r) => `- ${r}`).join('\n')}`,
          facts: blockingReasons,
          referencedFiles: [edit.targetFilePath],
          referencedSymbols: [],
          gitBlobHashes: {},
        });

        publishCaptureEvent('quarantine:blocked', params.sessionId, params.projectSlug, {
          quarantineId,
          targetFilePath: edit.targetFilePath,
          blockingReasons,
          guardId: report.guardId,
        });

        continue; // do NOT push into verifiedCleanEdits
      }

      // Clean (or gate disarmed): pass the auto-healed content downstream.
      verifiedCleanEdits.push({
        targetFilePath: edit.targetFilePath,
        previousContent: edit.previousContent,
        proposedContent: report.healedContent,
      });
    }

    // STAGE 3 (Task 1): Context Packer, CrewAI Planner, Ripwire Blast Radius
    // & Artifact Staging — ONLY verified-clean edits enter the DAG.
    const dagState: DagExecutionState = await this.dagOrchestrator.executeDagUpToStaging({
      sessionId: params.sessionId,
      projectSlug: params.projectSlug,
      userGoal: specContract.normalizedGoal,
      tokenBudgetCeiling: params.tokenBudgetCeiling,
      candidateEdits: verifiedCleanEdits,
    });

    if (quarantinedEdits.length > 0 && verifiedCleanEdits.length === 0) {
      dagState.currentNode = 'QUARANTINED';
    }

    // STAGE 4 (Task 4): Automated Compiler Gate, Test Gate & Agent-Browser
    // verification loop over every staged artifact.
    const workspace = await import('./context-engine').then((m) => m.getWorkspaceFileStore());
    const verificationReports: RuntimeVerificationReport[] = [];
    for (const staged of dagState.stagedArtifacts) {
      // The previous version of the edit is authoritative for import-continuity
      // shims (the workspace store may not hold the file yet for new modules).
      const previousForArtifact =
        verifiedCleanEdits.find((e) => e.targetFilePath === staged.targetFilePath)?.previousContent ??
        workspace.get(staged.targetFilePath);
      const verReport = await this.runtimeVerifier.runFullArtifactVerification({
        sessionId: params.sessionId,
        projectSlug: params.projectSlug,
        artifactId: staged.artifactId,
        targetFilePath: staged.targetFilePath,
        candidateContent: staged.proposedContent,
        previousContent: previousForArtifact,
        requiredTestFiles: staged.blastRadius.requiredTests,
        browserVerificationScript: params.browserVerificationScript,
      });
      verificationReports.push(verReport);
    }

    publishCaptureEvent('pipeline:complete', params.sessionId, params.projectSlug, {
      specId: specContract.specId,
      guardrailReports: guardrailReports.length,
      quarantinedEdits: quarantinedEdits.length,
      pipelineBlockedByQuarantine: quarantinedEdits.length > 0,
      dagRunId: dagState.runId,
      dagStatus: dagState.status,
      verificationReports: verificationReports.length,
      overallVerified: verificationReports.every((r) => r.overallStatus === 'verified_ready_for_approval'),
      latencyMs: Date.now() - startedAt,
    });

    return {
      specContract,
      guardrailReports,
      quarantinedEdits,
      pipelineBlockedByQuarantine: quarantinedEdits.length > 0,
      dagState,
      verificationReports,
    };
  }

  /** PHASE 10 (GAP #2): recent quarantined edits (newest first) for the UI. */
  public async listQuarantinedEdits(sessionId?: string, limit = 20) {
    const rows = await db.quarantinedEdit.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { quarantinedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      quarantineId: row.quarantineId,
      sessionId: row.sessionId,
      projectSlug: row.projectSlug,
      targetFilePath: row.targetFilePath,
      blockingReasons: safeParse<string[]>(row.blockingReasonsJson, []),
      quarantinedAt: row.quarantinedAt,
    }));
  }
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
