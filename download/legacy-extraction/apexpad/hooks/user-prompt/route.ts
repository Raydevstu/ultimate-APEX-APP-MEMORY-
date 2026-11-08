import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import { publishCaptureEvent } from '@/server/apexpad/event-bus';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sessionId = String(body.sessionId || `codex_live_${Date.now()}`);
    const projectSlug = String(body.projectSlug || PROJECT_SLUG);
    const rawPrompt = String(body.prompt || '');

    if (!rawPrompt.trim()) {
      return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
    }

    const promptNumber = await engine.memoryRouter.recordUserPrompt(sessionId, rawPrompt);
    const contextPack = await engine.contextEngine.buildContextPack({
      sessionId,
      projectSlug,
      userTaskPrompt: rawPrompt,
      tokenBudgetCeiling: Number(body.tokenBudgetCeiling || 4000),
    });

    publishCaptureEvent('hook:user_prompt', sessionId, projectSlug, {
      promptNumber,
      estimatedTokens: contextPack.estimatedTotalTokens,
      includedSymbols: contextPack.includedSymbolIds.length,
    });

    return NextResponse.json({ promptNumber, contextPack });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
