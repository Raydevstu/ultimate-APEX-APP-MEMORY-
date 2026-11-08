import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/apexpad/engine';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json().catch(() => ({}))) as {
      observationId?: string;
      windowSize?: number;
    };
    if (!body.observationId) {
      return NextResponse.json({ error: 'observationId is required' }, { status: 400 });
    }
    const timeline = await engine.memoryRouter.getTimeline(
      body.observationId,
      body.windowSize ?? 2
    );
    return NextResponse.json({ timeline });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
