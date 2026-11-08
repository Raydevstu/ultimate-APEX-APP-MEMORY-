import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import { publishCaptureEvent } from '@/server/apexpad/event-bus';
import type { IndexFileRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<IndexFileRequest>;
    const sessionId = body.sessionId || `sess_${Date.now()}`;
    const filePath = body.filePath || 'untitled.ts';
    const content = body.content ?? '';
    const taskPrompt = body.taskPrompt || '';

    const symbols = await engine.contextEngine.indexFileSymbols({
      projectSlug: PROJECT_SLUG,
      filePath,
      content,
    });
    await engine.contextEngine.rebuildCallGraphEdges(PROJECT_SLUG, { [filePath]: content });

    const allSymbols = await engine.contextEngine.getAllProjectSymbols(PROJECT_SLUG);
    const memoryIndexHits = await engine.memoryRouter.searchIndex({
      projectSlug: PROJECT_SLUG,
      query: taskPrompt,
      limit: 15,
    });
    const contextEnvelope = await engine.contextEngine.buildContextPack({
      sessionId,
      projectSlug: PROJECT_SLUG,
      userTaskPrompt: taskPrompt || `Editing ${filePath}`,
      tokenBudgetCeiling: 4000,
      activeCcrBlocks: content.trim().length > 0 ? [{ sourceLabel: filePath, rawContent: content }] : [],
    });
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);

    publishCaptureEvent('fs:file_indexed', sessionId, PROJECT_SLUG, {
      filePath,
      symbolCount: symbols.length,
    });

    return NextResponse.json({
      symbols: allSymbols,
      memoryIndexHits,
      contextEnvelope,
      telemetry,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
