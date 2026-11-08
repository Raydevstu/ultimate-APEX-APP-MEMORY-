import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type { ExecuteToolRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<ExecuteToolRequest>;
    if (!body.toolName) {
      return NextResponse.json({ error: 'toolName is required' }, { status: 400 });
    }

    const result = await engine.modelAdapter.executeModelToolCall(PROJECT_SLUG, {
      toolName: body.toolName,
      arguments: body.arguments ?? {},
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
