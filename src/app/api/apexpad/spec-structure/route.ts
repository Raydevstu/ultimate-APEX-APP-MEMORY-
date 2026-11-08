/**
 * src/app/api/apexpad/spec-structure/route.ts
 * TASK 2 endpoint: compiles a raw, unstructured user prompt into a
 * deterministic, AST-grounded Specification Contract (Subtask DAG,
 * implicit Project DNA constraints, acceptance criteria).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type { StructureSpecRequest } from '@/lib/apexpad-guardrails-types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<StructureSpecRequest>;
    const sessionId = body.sessionId || `sess_${Date.now()}`;
    const rawUserPrompt = body.rawUserPrompt || '';
    if (!rawUserPrompt.trim()) {
      return NextResponse.json({ error: 'rawUserPrompt is required' }, { status: 400 });
    }

    const spec = await engine.specStructurer.compileSpecificationContract({
      sessionId,
      projectSlug: PROJECT_SLUG,
      rawUserPrompt,
    });
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);

    return NextResponse.json({ spec, telemetry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** Lists recent specification contracts for a session (spec history panel). */
export async function GET(req: NextRequest) {
  try {
    const engine = await getEngine();
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    const specs = await engine.specStructurer.listRecentSpecs(sessionId, 10);
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);
    return NextResponse.json({ specs, telemetry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
