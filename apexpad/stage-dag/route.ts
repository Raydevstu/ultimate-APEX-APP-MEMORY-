import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type { StageDagRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<StageDagRequest>;
    const sessionId = body.sessionId || `sess_${Date.now()}`;
    const userGoal = body.userGoal || 'Staged edit from workbench';
    const targetFilePath = body.targetFilePath || 'untitled.ts';
    const previousContent = body.previousContent ?? '';
    const proposedContent = body.proposedContent ?? '';

    const state = await engine.dagOrchestrator.executeDagUpToStaging({
      sessionId,
      projectSlug: PROJECT_SLUG,
      userGoal,
      tokenBudgetCeiling: 4000,
      candidateEdits: [
        {
          targetFilePath,
          previousContent,
          proposedContent,
        },
      ],
    });

    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);
    return NextResponse.json({ ...state, telemetry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
