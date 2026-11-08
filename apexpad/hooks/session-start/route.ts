import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import { publishCaptureEvent } from '@/server/apexpad/event-bus';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const sessionId = String(body.sessionId || `codex_live_${Date.now()}`);
    const projectSlug = String(body.projectSlug || PROJECT_SLUG);

    const result = await engine.memoryRouter.startSession({
      sessionId,
      projectSlug,
      branchName: String(body.branchName || 'main'),
      firstPrompt: String(body.firstPrompt || 'Unattended Codex Session'),
    });

    publishCaptureEvent('hook:session_start', sessionId, projectSlug, {
      dnaCount: result.dnaRules.length,
      summariesLoaded: result.recentSummaries.length,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
