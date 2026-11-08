import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/apexpad/engine';
import type { RetrieveCcrRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<RetrieveCcrRequest>;
    if (!body.ccrId) {
      return NextResponse.json({ error: 'ccrId is required' }, { status: 400 });
    }

    const result = await engine.distillationPipeline.retrieveOriginalCCR(
      body.ccrId,
      body.lineStart,
      body.lineEnd
    );

    if (!result) {
      return NextResponse.json({ error: `CCR block ${body.ccrId} not found` }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
