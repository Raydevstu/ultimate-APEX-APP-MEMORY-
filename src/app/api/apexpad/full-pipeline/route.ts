/**
 * src/app/api/apexpad/full-pipeline/route.ts
 * §7.6 endpoint: runs the unified 4-stage engineering pipeline
 * (Spec Structurer -> Guardrails -> DAG Staging -> Runtime Verification)
 * from a raw user prompt to verified Staged Artifacts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type {
  CandidateEdit,
  RunFullPipelineRequest,
} from '@/lib/apexpad-guardrails-types';

export const maxDuration = 120;

function sanitizeCandidateEdits(raw: unknown): CandidateEdit[] {
  if (!Array.isArray(raw)) return [];
  const edits: CandidateEdit[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const candidate = item as Partial<CandidateEdit>;
    if (
      typeof candidate.targetFilePath === 'string' &&
      candidate.targetFilePath.trim() &&
      typeof candidate.proposedContent === 'string' &&
      typeof candidate.previousContent === 'string'
    ) {
      edits.push({
        targetFilePath: candidate.targetFilePath.trim(),
        previousContent: candidate.previousContent,
        proposedContent: candidate.proposedContent,
      });
    }
  }
  return edits;
}

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<RunFullPipelineRequest>;
    const sessionId = body.sessionId || `sess_${Date.now()}`;
    const rawUserPrompt = (body.rawUserPrompt || '').trim();
    if (!rawUserPrompt) {
      return NextResponse.json({ error: 'rawUserPrompt is required' }, { status: 400 });
    }

    const candidateEdits = sanitizeCandidateEdits(body.candidateEdits);
    if (candidateEdits.length === 0) {
      return NextResponse.json(
        { error: 'candidateEdits must contain at least one full edit (targetFilePath, previousContent, proposedContent)' },
        { status: 400 }
      );
    }

    const tokenBudgetCeiling =
      typeof body.tokenBudgetCeiling === 'number' && body.tokenBudgetCeiling > 0
        ? body.tokenBudgetCeiling
        : 12000;

    const result = await engine.fullPipeline.executeFullPipeline({
      sessionId,
      projectSlug: PROJECT_SLUG,
      rawUserPrompt,
      tokenBudgetCeiling,
      candidateEdits,
      browserVerificationScript: Array.isArray(body.browserVerificationScript)
        ? body.browserVerificationScript
        : undefined,
    });
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);

    return NextResponse.json({ result, telemetry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
