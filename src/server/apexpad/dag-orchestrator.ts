/**
 * src/server/apexpad/dag-orchestrator.ts
 * ApexPad Multi-Agent Control Plane: CrewAI Planner -> LangGraph State Machine DAG ->
 * Research Agent & Architect Agent -> Artifact Staging (Ripwire Blast Radius Gate) ->
 * Human Approval Gate.
 *
 * PHASE 10 (GAP #1 CLOSED — blueprint ITEM 1):
 *   `resolveHumanApproval` now performs a REAL atomic disk write on approval:
 *     1. path-traversal-safe resolution of the target inside the workspace root,
 *     2. pre-commit snapshot of the on-disk file into `.apexpad-backups/<id>.bak`,
 *     3. crash-safe atomic write (sibling temp file + `fs.renameSync`),
 *     4. SHA-256 ledger row in `artifact_disk_commits`,
 *     5. immediate AST re-index + call-graph rebuild so the graph stays live.
 *   `rollbackCommittedArtifact` restores the exact pre-approval bytes from the
 *   `.bak` snapshot (or deletes a newly-created file) and marks the commit
 *   rolled back — deterministically, with receipts.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { ContextEngine } from './context-engine';
import { MemoryRouter } from './memory-router';
import { publishCaptureEvent } from './event-bus';
import {
  atomicWriteFile,
  readWorkspaceFileOrNull,
  resolveSafeWorkspacePath,
  restoreFromBackup,
  sha256Hex,
  snapshotForBackup,
} from './workspace';
import type {
  DiskCommitReceipt,
  DiskCommitRecord,
  DiskRollbackReceipt,
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

  /**
   * NODE 6: HUMAN APPROVAL GATE — atomic disk write + `.bak` snapshot, AST
   * re-index, verified observation. On approve, the artifact's proposed bytes
   * land on the real filesystem via temp-file + `fs.renameSync` and the
   * pre-commit state is preserved in `.apexpad-backups/<artifactId>.bak`.
   * On reject, disk is never touched and the rejection reason is recorded.
   */
  public async resolveHumanApproval(params: {
    artifactId: string;
    projectSlug: string;
    approved: boolean;
    reviewerNote?: string;
  }): Promise<{ artifact: StagedArtifact; diskReceipt?: DiskCommitReceipt }> {
    const row = await db.stagedArtifact.findUnique({ where: { artifactId: params.artifactId } });
    if (!row) {
      throw new Error(`Staged artifact ${params.artifactId} not found.`);
    }
    if (row.status !== 'staged') {
      throw new Error(
        `Staged artifact ${params.artifactId} is already '${row.status}' — approval gate decisions are final; use rollbackCommittedArtifact for approved commits.`
      );
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
    const verdictId = `vrd_${crypto.randomBytes(6).toString('hex')}`;

    let diskReceipt: DiskCommitReceipt | undefined;

    if (params.approved) {
      // ---- PHASE 10 (GAP #1): REAL ATOMIC DISK COMMIT -----------------
      // 1. Resolve the workspace path with traversal protection.
      const absoluteFilePath = resolveSafeWorkspacePath(targetFilePath);

      // 2. Snapshot the pre-commit on-disk state into `.apexpad-backups/`.
      const backup = snapshotForBackup({
        artifactId: params.artifactId,
        absoluteFilePath,
        // The staged artifact carries only proposed bytes; the on-disk file
        // (or nothing, for brand-new files) is the authoritative rollback source.
        fallbackPreviousContent: '',
      });

      // 3. Crash-safe atomic write: temp sibling + fs.renameSync.
      atomicWriteFile(absoluteFilePath, proposedContent);

      // 4. SHA-256 ledger row for the committed bytes.
      const committedSha256 = sha256Hex(proposedContent);
      const committedAt = new Date().toISOString();

      await db.artifactDiskCommit.upsert({
        where: { artifactId: params.artifactId },
        create: {
          artifactId: params.artifactId,
          verdictId,
          sessionId,
          targetFilePath,
          absoluteFilePath,
          backupFilePath: backup.backupFilePath,
          existedBeforeCommit: backup.existedBeforeCommit,
          committedSha256,
          rolledBack: false,
          committedAt,
        },
        update: {
          verdictId,
          absoluteFilePath,
          backupFilePath: backup.backupFilePath,
          existedBeforeCommit: backup.existedBeforeCommit,
          committedSha256,
          rolledBack: false,
          committedAt,
          rolledBackAt: null,
          rollbackReason: null,
          restoredSha256: null,
        },
      });

      // 5. Immediate AST re-index + call-graph rebuild from the committed bytes.
      const updatedSymbols = await this.contextEngine.indexFileSymbols({
        projectSlug: params.projectSlug,
        filePath: targetFilePath,
        content: proposedContent,
      });
      const storeContents: Record<string, string> = {};
      const workspace = await import('./context-engine').then((m) => m.getWorkspaceFileStore());
      for (const [p, c] of workspace.entries()) {
        storeContents[p] = c;
      }
      storeContents[targetFilePath] = proposedContent;
      await this.contextEngine.rebuildCallGraphEdges(params.projectSlug, storeContents);

      const fileSha256 = committedSha256;
      await this.memoryRouter.recordObservation({
        sessionId,
        projectSlug: params.projectSlug,
        scope: 'repo',
        category: 'decision',
        title: `Approved Artifact Update: ${targetFilePath}`,
        subtitle: params.reviewerNote || 'Human-approved architectural change',
        narrative: `Atomically committed ${targetFilePath} to the workspace (SHA-256 ${committedSha256.slice(0, 12)}…) affecting ${updatedSymbols.length} symbols (${updatedSymbols.map((s) => s.symbolName).join(', ')}). Cyclomatic delta: ${blastRadius.cyclomaticDelta}. Rollback snapshot: ${backup.backupFilePath ?? 'none (new file)'}.`,
        facts: [
          `Target file: ${targetFilePath}`,
          `Committed SHA-256: ${committedSha256}`,
          `Backup snapshot: ${backup.backupFilePath ?? 'none (new file)'}`,
          `Required tests: ${blastRadius.requiredTests.join(', ') || 'none'}`,
        ],
        referencedFiles: [targetFilePath],
        referencedSymbols: updatedSymbols.map((s) => s.symbolName),
        gitBlobHashes: { [targetFilePath]: fileSha256 },
      });

      diskReceipt = {
        artifactId: params.artifactId,
        verdictId,
        targetFilePath,
        absoluteFilePath,
        backupFilePath: backup.backupFilePath,
        existedBeforeCommit: backup.existedBeforeCommit,
        committedSha256,
        committedAt,
      };

      publishCaptureEvent('artifact:committed', sessionId, params.projectSlug, {
        artifactId: params.artifactId,
        targetFilePath,
        committedSha256,
        backupFilePath: backup.backupFilePath,
        existedBeforeCommit: backup.existedBeforeCommit,
        verdictId,
      });
    } else {
      await this.memoryRouter.recordObservation({
        sessionId,
        projectSlug: params.projectSlug,
        scope: 'repo',
        category: 'decision',
        title: `Rejected Artifact: ${targetFilePath}`,
        subtitle: params.reviewerNote || 'Human gate rejection',
        narrative: `Artifact ${params.artifactId} for ${targetFilePath} was rejected at the Human Approval Gate. Disk untouched — no bytes were written.`,
        facts: [`Artifact: ${params.artifactId}`, `Reviewer note: ${params.reviewerNote || '—'}`],
        referencedFiles: [targetFilePath],
        referencedSymbols: [],
        gitBlobHashes: {},
      });
    }

    publishCaptureEvent('artifact:resolved', sessionId, params.projectSlug, {
      artifactId: params.artifactId,
      approved: params.approved,
      targetFilePath,
    });

    return {
      artifact: {
        artifactId: params.artifactId,
        sessionId,
        agentRole: row.agentRole as StagedArtifact['agentRole'],
        targetFilePath,
        proposedContent,
        unifiedDiff: row.unifiedDiff,
        blastRadius,
        status: nextStatus,
        createdAt: row.createdAt,
      },
      diskReceipt,
    };
  }

  /**
   * PHASE 10 (GAP #1): deterministic 1-click rollback of a previously approved
   * artifact. Restores the exact pre-approval bytes from
   * `.apexpad-backups/<artifactId>.bak` (or deletes the file when the commit
   * created it new), re-indexes the restored AST symbols, and records the
   * rollback in both the ledger and the memory system.
   */
  public async rollbackCommittedArtifact(params: {
    artifactId: string;
    reason: string;
    projectSlug: string;
  }): Promise<DiskRollbackReceipt> {
    const commitRow = await db.artifactDiskCommit.findUnique({
      where: { artifactId: params.artifactId },
    });
    if (!commitRow) {
      throw new Error(
        `No committed disk record found for artifact "${params.artifactId}".`
      );
    }
    if (commitRow.rolledBack) {
      throw new Error(
        `Artifact "${params.artifactId}" has already been rolled back (${commitRow.rolledBackAt}).`
      );
    }

    const rolledBackAt = new Date().toISOString();
    const restore = restoreFromBackup({
      absoluteFilePath: commitRow.absoluteFilePath,
      backupFilePath: commitRow.backupFilePath,
      existedBeforeCommit: commitRow.existedBeforeCommit,
    });

    await db.artifactDiskCommit.update({
      where: { artifactId: params.artifactId },
      data: {
        rolledBack: true,
        rolledBackAt,
        rollbackReason: params.reason,
        restoredSha256: restore.restoredSha256,
      },
    });

    await db.stagedArtifact.update({
      where: { artifactId: params.artifactId },
      data: { status: 'rejected' },
    });

    // Re-index the restored bytes so the AST graph mirrors disk reality.
    const restoredContent =
      restore.restoredSha256 !== null
        ? readWorkspaceFileOrNull(commitRow.targetFilePath)
        : null;
    if (restoredContent !== null) {
      const restoredSymbols = await this.contextEngine.indexFileSymbols({
        projectSlug: params.projectSlug,
        filePath: commitRow.targetFilePath,
        content: restoredContent,
      });
      const storeContents: Record<string, string> = {};
      const workspace = await import('./context-engine').then((m) => m.getWorkspaceFileStore());
      for (const [p, c] of workspace.entries()) {
        storeContents[p] = c;
      }
      storeContents[commitRow.targetFilePath] = restoredContent;
      await this.contextEngine.rebuildCallGraphEdges(params.projectSlug, storeContents);
      void restoredSymbols;
    }

    await this.memoryRouter.recordObservation({
      sessionId: commitRow.sessionId,
      projectSlug: params.projectSlug,
      scope: 'repo',
      category: 'bugfix',
      title: `Artifact Rolled Back: ${commitRow.targetFilePath}`,
      subtitle: params.reason,
      narrative: `Commit ${commitRow.committedSha256.slice(0, 12)}… for ${commitRow.targetFilePath} was rolled back from ${commitRow.backupFilePath ?? 'new-file deletion'}. Disk state restored deterministically.`,
      facts: [
        `Artifact: ${params.artifactId}`,
        `Reason: ${params.reason}`,
        `Was deleted because new: ${String(restore.wasDeletedBecauseNew)}`,
        `Restored SHA-256: ${restore.restoredSha256 ?? '—'}`,
      ],
      referencedFiles: [commitRow.targetFilePath],
      referencedSymbols: [],
      gitBlobHashes: {},
    });

    publishCaptureEvent('artifact:rolled_back', commitRow.sessionId, params.projectSlug, {
      artifactId: params.artifactId,
      targetFilePath: commitRow.targetFilePath,
      wasDeletedBecauseNew: restore.wasDeletedBecauseNew,
      restoredSha256: restore.restoredSha256,
      reason: params.reason,
    });

    return {
      artifactId: params.artifactId,
      restoredFilePath: commitRow.targetFilePath,
      wasDeletedBecauseNew: restore.wasDeletedBecauseNew,
      restoredSha256: restore.restoredSha256,
      rolledBackAt,
      reason: params.reason,
    };
  }

  /** PHASE 10: recent disk commit ledger rows (newest first). */
  public async listDiskCommits(sessionId?: string, limit = 25): Promise<DiskCommitRecord[]> {
    const rows = await db.artifactDiskCommit.findMany({
      where: sessionId ? { sessionId } : undefined,
      orderBy: { committedAt: 'desc' },
      take: limit,
    });
    return rows.map((row) => ({
      artifactId: row.artifactId,
      verdictId: row.verdictId,
      sessionId: row.sessionId,
      targetFilePath: row.targetFilePath,
      absoluteFilePath: row.absoluteFilePath,
      backupFilePath: row.backupFilePath,
      existedBeforeCommit: row.existedBeforeCommit,
      committedSha256: row.committedSha256,
      committedAt: row.committedAt,
      rolledBack: row.rolledBack,
      rolledBackAt: row.rolledBackAt,
      rollbackReason: row.rollbackReason,
      restoredSha256: row.restoredSha256,
    }));
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
