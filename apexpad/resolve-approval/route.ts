import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type { ResolveApprovalRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<ResolveApprovalRequest>;
    if (!body.artifactId) {
      return NextResponse.json({ error: 'artifactId is required' }, { status: 400 });
    }

    const resolved = await engine.dagOrchestrator.resolveHumanApproval({
      artifactId: body.artifactId,
      projectSlug: PROJECT_SLUG,
      approved: body.approved === true,
      reviewerNote: body.reviewerNote,
    });

    const symbols = await engine.contextEngine.getAllProjectSymbols(PROJECT_SLUG);
    const memoryIndexHits = await engine.memoryRouter.searchIndex({
      projectSlug: PROJECT_SLUG,
      query: '',
      limit: 15,
    });
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);

    return NextResponse.json({ resolved, symbols, memoryIndexHits, telemetry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
