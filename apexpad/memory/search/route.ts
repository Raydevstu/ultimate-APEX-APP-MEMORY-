import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json().catch(() => ({}))) as { query?: string; limit?: number };
    const hits = await engine.memoryRouter.searchIndex({
      projectSlug: PROJECT_SLUG,
      query: body.query ?? '',
      limit: body.limit ?? 12,
    });
    return NextResponse.json({ hits });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
