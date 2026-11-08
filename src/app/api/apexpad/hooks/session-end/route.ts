import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import { publishCaptureEvent } from '@/server/apexpad/event-bus';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sessionId = String(body.sessionId || `codex_live_${Date.now()}`);
    const projectSlug = String(body.projectSlug || PROJECT_SLUG);

    const summary = await engine.memoryRouter.completeSession({
      sessionId,
      projectSlug,
      requested: String(body.requested || ''),
      investigated: String(body.investigated || ''),
      learned: String(body.learned || ''),
      completed: String(body.completed || ''),
    });

    publishCaptureEvent('hook:session_end', sessionId, projectSlug, {
      tokenCount: summary.tokenCount,
    });

    return NextResponse.json(summary);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
