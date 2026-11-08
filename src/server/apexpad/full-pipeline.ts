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
 * Stack adaptation: async Prisma pipeline over the engine container
 * singletons (src/server/apexpad/engine.ts). Zero stubs.
 */

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
  StructuredSpecContract,
} from '@/lib/apexpad-guardrails-types';
import type { DagExecutionState } from '@/lib/apexpad-types';

export interface CandidateEdit {
  targetFilePath: string;
  previousContent: string;
  proposedContent: string;
}

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
   * Staged Artifact, pausing at the Human Approval Gate.
   */
  public async executeFullPipeline(params: {
    sessionId: string;
    projectSlug: string;
    rawUserPrompt: string;
    tokenBudgetCeiling: number;
    candidateEdits: CandidateEdit[];
    browserVerificationScript?: AgentBrowserActionCommand[];
  }): Promise<FullApexPipelineResult> {
    const startedAt = Date.now();

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
    const guardrailReports: GuardrailInspectionReport[] = [];
    const healedEdits: CandidateEdit[] = [];
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
      healedEdits.push({
        targetFilePath: edit.targetFilePath,
        previousContent: edit.previousContent,
        // Always pass auto-healed AST code downstream:
        proposedContent: report.healedContent,
      });
    }

    // STAGE 3 (Task 1): Context Packer, CrewAI Planner, Ripwire Blast Radius
    // & Artifact Staging.
    const dagState: DagExecutionState = await this.dagOrchestrator.executeDagUpToStaging({
      sessionId: params.sessionId,
      projectSlug: params.projectSlug,
      userGoal: specContract.normalizedGoal,
      tokenBudgetCeiling: params.tokenBudgetCeiling,
      candidateEdits: healedEdits,
    });

    // STAGE 4 (Task 4): Automated Compiler Gate, Test Gate & Agent-Browser
    // verification loop over every staged artifact.
    const workspace = await import('./context-engine').then((m) => m.getWorkspaceFileStore());
    const verificationReports = [];
    for (const staged of dagState.stagedArtifacts) {
      // The previous version of the edit is authoritative for import-continuity
      // shims (the workspace store may not hold the file yet for new modules).
      const previousForArtifact =
        healedEdits.find((e) => e.targetFilePath === staged.targetFilePath)?.previousContent ??
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
      dagRunId: dagState.runId,
      dagStatus: dagState.status,
      verificationReports: verificationReports.length,
      overallVerified: verificationReports.every((r) => r.overallStatus === 'verified_ready_for_approval'),
      latencyMs: Date.now() - startedAt,
    });

    return {
      specContract,
      guardrailReports,
      dagState,
      verificationReports,
    };
  }
}
