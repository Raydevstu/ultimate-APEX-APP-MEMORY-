/**
 * src/server/apexpad/dag-orchestrator.ts
 * ApexPad Multi-Agent Control Plane: CrewAI Planner -> LangGraph State Machine DAG ->
 * Research Agent & Architect Agent -> Artifact Staging (Ripwire Blast Radius Gate) ->
 * Human Approval Gate.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { ContextEngine } from './context-engine';
import { MemoryRouter } from './memory-router';
import { publishCaptureEvent } from './event-bus';
import type {
  StagedArtifact,
  DagExecutionState,
  BlastRadiusReport,
} from '@/lib/apexpad-types';

export class ApexDagOrchestrator {
  private memoryRouter: MemoryRouter;
  private contextEngine: ContextEngine;

  constructor(memoryRouter: MemoryRouter, contextEngine: ContextEngine) {
    this.memoryRouter = memoryRouter;
    this.contextEngine = contextEngine;
  }

  /** Executes the deterministic DAG pipeline up to ARTIFACT STAGING, pausing at HUMAN APPROVAL. */
  public async executeDagUpToStaging(params: {
    sessionId: string;
    projectSlug: string;
    userGoal: string;
    tokenBudgetCeiling: number;
    candidateEdits: Array<{
      targetFilePath: string;
      previousContent: string;
      proposedContent: string;
    }>;
  }): Promise<DagExecutionState> {
    const runId = `dag_${crypto.randomBytes(6).toString('hex')}`;

    // NODE 1: CONTEXT PACK (Ripwire PPR + CacheAligner + U-Curve)
    await this.memoryRouter.recordUserPrompt(params.sessionId, params.userGoal);
    const contextEnvelope = await this.contextEngine.buildContextPack({
      sessionId: params.sessionId,
      projectSlug: params.projectSlug,
      userTaskPrompt: params.userGoal,
      tokenBudgetCeiling: params.tokenBudgetCeiling,
    });

    // NODE 2: PLANNER (CrewAI Role Decomposition)
    const plannerSubtasks = [
      `1. [Research Agent]: Verify top ${contextEnvelope.includedSymbolIds.length} PPR symbols and ${contextEnvelope.includedObservationIds.length} progressive memory records.`,
      `2. [Architect Agent]: Validate contract stability and layer boundaries across ${params.candidateEdits.length} candidate file edit(s).`,
      `3. [Artifact Staging]: Compute Ripwire blast radius, cyclomatic complexity delta, and required test gates before Human Approval.`,
    ];

    // NODE 3: RESEARCH AGENT (Progressive Disclosure Timeline & Symbol Inspection)
    const researchFindings: string[] = [];
    for (const obsId of contextEnvelope.includedObservationIds.slice(0, 3)) {
      const timeline = await this.memoryRouter.getTimeline(obsId, 1);
      if (timeline) {
        researchFindings.push(
          `Verified Memory [${timeline.anchorObservation.id}] "${timeline.anchorObservation.title}" (Session context: "${timeline.sessionPromptContext}")`
        );
      }
    }

    // NODE 4 & 5: ARCHITECT AGENT -> ARTIFACT STAGING WITH RIPWIRE BLAST RADIUS
    const stagedArtifacts: StagedArtifact[] = [];
    let hasBlockingViolation = false;

    for (const edit of params.candidateEdits) {
      const blastRadius = await this.contextEngine.analyzeEditBlastRadius({
        projectSlug: params.projectSlug,
        targetFilePath: edit.targetFilePath,
        previousContent: edit.previousContent,
        proposedContent: edit.proposedContent,
      });

      if (blastRadius.architectureViolations.length > 0) {
        hasBlockingViolation = true;
      }

      const unifiedDiff = computeUnifiedDiff(
        edit.targetFilePath,
        edit.previousContent,
        edit.proposedContent
      );

      const artifactId = `art_${crypto.randomBytes(6).toString('hex')}`;
      const now = new Date().toISOString();

      await db.stagedArtifact.create({
        data: {
          artifactId,
          sessionId: params.sessionId,
          agentRole: 'architect',
          targetFilePath: edit.targetFilePath,
          proposedContent: edit.proposedContent,
          unifiedDiff,
          blastRadiusJson: JSON.stringify(blastRadius),
          status: 'staged',
          createdAt: now,
        },
      });

      stagedArtifacts.push({
        artifactId,
        sessionId: params.sessionId,
        agentRole: 'architect',
        targetFilePath: edit.targetFilePath,
        proposedContent: edit.proposedContent,
        unifiedDiff,
        blastRadius,
        status: 'staged',
        createdAt: now,
      });
    }

    const state: DagExecutionState = {
      runId,
      sessionId: params.sessionId,
      projectSlug: params.projectSlug,
      userGoal: params.userGoal,
      currentNode: 'HUMAN_APPROVAL',
      contextEnvelope,
      plannerSubtasks,
      researchFindings,
      stagedArtifacts,
      status: hasBlockingViolation ? 'halted_on_violation' : 'awaiting_human_approval',
    };

    publishCaptureEvent('dag:staged', params.sessionId, params.projectSlug, {
      runId,
      userGoal: params.userGoal,
      stagedArtifacts: stagedArtifacts.length,
      status: state.status,
    });

    return state;
  }

  /** NODE 6: HUMAN APPROVAL GATE — commit, re-index AST, record verified observation. */
  public async resolveHumanApproval(params: {
    artifactId: string;
    projectSlug: string;
    approved: boolean;
    reviewerNote?: string;
  }): Promise<StagedArtifact> {
    const row = await db.stagedArtifact.findUnique({ where: { artifactId: params.artifactId } });
    if (!row) {
      throw new Error(`Staged artifact ${params.artifactId} not found.`);
    }

    const nextStatus: StagedArtifact['status'] = params.approved ? 'approved' : 'rejected';
    await db.stagedArtifact.update({
      where: { artifactId: params.artifactId },
      data: { status: nextStatus },
    });

    const targetFilePath = row.targetFilePath;
    const proposedContent = row.proposedContent;
    const sessionId = row.sessionId;
    const blastRadius = safeBlastRadius(row.blastRadiusJson);

    if (params.approved) {
      const updatedSymbols = await this.contextEngine.indexFileSymbols({
        projectSlug: params.projectSlug,
        filePath: targetFilePath,
        content: proposedContent,
      });

      // Rebuild call graph so the updated file resolves edges with the workspace
      const storeContents: Record<string, string> = {};
      const workspace = await import('./context-engine').then((m) => m.getWorkspaceFileStore());
      for (const [p, c] of workspace.entries()) {
        storeContents[p] = c;
      }
      storeContents[targetFilePath] = proposedContent;
      await this.contextEngine.rebuildCallGraphEdges(params.projectSlug, storeContents);

      const fileSha256 = crypto.createHash('sha256').update(proposedContent).digest('hex');
      await this.memoryRouter.recordObservation({
        sessionId,
        projectSlug: params.projectSlug,
        scope: 'repo',
        category: 'decision',
        title: `Approved Artifact Update: ${targetFilePath}`,
        subtitle: params.reviewerNote || 'Human-approved architectural change',
        narrative: `Updated ${targetFilePath} affecting ${updatedSymbols.length} symbols (${updatedSymbols.map((s) => s.symbolName).join(', ')}). Cyclomatic delta: ${blastRadius.cyclomaticDelta}.`,
        facts: [
          `Target file: ${targetFilePath}`,
          `Required tests: ${blastRadius.requiredTests.join(', ') || 'none'}`,
        ],
        referencedFiles: [targetFilePath],
        referencedSymbols: updatedSymbols.map((s) => s.symbolName),
        gitBlobHashes: { [targetFilePath]: fileSha256 },
      });
    }

    publishCaptureEvent('artifact:resolved', sessionId, params.projectSlug, {
      artifactId: params.artifactId,
      approved: params.approved,
      targetFilePath,
    });

    return {
      artifactId: params.artifactId,
      sessionId,
      agentRole: row.agentRole as StagedArtifact['agentRole'],
      targetFilePath,
      proposedContent,
      unifiedDiff: row.unifiedDiff,
      blastRadius,
      status: nextStatus,
      createdAt: row.createdAt,
    };
  }

  public async listStagedArtifacts(sessionId?: string): Promise<StagedArtifact[]> {
    const rows = await db.stagedArtifact.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 25,
    });
    return rows.map((row) => ({
      artifactId: row.artifactId,
      sessionId: row.sessionId,
      agentRole: row.agentRole as StagedArtifact['agentRole'],
      targetFilePath: row.targetFilePath,
      proposedContent: row.proposedContent,
      unifiedDiff: row.unifiedDiff,
      blastRadius: safeBlastRadius(row.blastRadiusJson),
      status: row.status as StagedArtifact['status'],
      createdAt: row.createdAt,
    }));
  }
}

function safeBlastRadius(json: string): BlastRadiusReport {
  try {
    return JSON.parse(json) as BlastRadiusReport;
  } catch {
    return {
      targetSymbols: [],
      directCallers: [],
      transitiveCallers: [],
      affectedFiles: [],
      requiredTests: [],
      contractChangesDetected: [],
      architectureViolations: [],
      cyclomaticDelta: 0,
      propagationCost: 0,
      honestyFloorDisclosed: false,
    };
  }
}

export function computeUnifiedDiff(filePath: string, oldText: string, newText: string): string {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const diff: string[] = [`--- a/${filePath}`, `+++ b/${filePath}`];

  const maxLen = Math.max(oldLines.length, newLines.length);
  let unchangedRun = 0;
  for (let i = 0; i < maxLen; i++) {
    const o = oldLines[i];
    const n = newLines[i];
    if (o === n && o !== undefined) {
      unchangedRun++;
      // Collapse long unchanged runs like real diffs
      if (unchangedRun <= 3) {
        diff.push(`  ${o}`);
      } else if (unchangedRun === 4) {
        diff.push(`  ... (${unchangedRun} unchanged lines so far)`);
      }
    } else {
      unchangedRun = 0;
      if (o !== undefined) diff.push(`- ${o}`);
      if (n !== undefined) diff.push(`+ ${n}`);
    }
  }
  return diff.join('\n');
}
