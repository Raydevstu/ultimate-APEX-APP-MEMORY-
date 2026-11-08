import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/apexpad/engine';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
    const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
    if (ids.length === 0) {
      return NextResponse.json({ observations: [] });
    }
    const observations = await engine.memoryRouter.getObservationsByIds(ids);
    return NextResponse.json({ observations });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
