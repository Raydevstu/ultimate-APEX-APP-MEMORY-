import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type { AgentTurnRequest } from '@/lib/apexpad-types';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<AgentTurnRequest>;
    const sessionId = body.sessionId || `sess_${Date.now()}`;
    const userPrompt = body.userPrompt || '';
    if (!userPrompt.trim()) {
      return NextResponse.json({ error: 'userPrompt is required' }, { status: 400 });
    }
    const activeFilePath = body.activeFilePath || 'src/architecture/ContextNote.ts';
    const editorContent = body.editorContent ?? '';

    const result = await engine.modelAdapter.runContextualAgentTurn({
      sessionId,
      projectSlug: PROJECT_SLUG,
      userPrompt,
      tokenBudgetCeiling: body.tokenBudgetCeiling ?? 4000,
      activeCcrBlocks:
        editorContent.trim().length > 0
          ? [{ sourceLabel: activeFilePath, rawContent: editorContent }]
          : [],
    });

    const memoryIndexHits = await engine.memoryRouter.searchIndex({
      projectSlug: PROJECT_SLUG,
      query: userPrompt,
      limit: 15,
    });
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);

    return NextResponse.json({ ...result, memoryIndexHits, telemetry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
