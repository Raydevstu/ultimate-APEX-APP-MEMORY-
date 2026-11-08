/**
 * src/app/api/apexpad/dag-rollback/route.ts
 * PHASE 10 (GAP #1 / blueprint ITEM 1): deterministic 1-click rollback of a
 * previously approved artifact. Restores the exact pre-approval bytes from
 * `.apexpad-backups/<artifactId>.bak` (or deletes a newly-created file),
 * updates the SHA-256 ledger, re-indexes the restored AST symbols, and
 * records the rollback as a memory observation + SSE event.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type { RollbackArtifactRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<RollbackArtifactRequest>;
    if (!body.artifactId) {
      return NextResponse.json({ error: 'artifactId is required' }, { status: 400 });
    }

    const receipt = await engine.dagOrchestrator.rollbackCommittedArtifact({
      artifactId: body.artifactId,
      reason: (body.reason || 'Operator triggered 1-click rollback from Workbench').trim(),
      projectSlug: PROJECT_SLUG,
    });

    const symbols = await engine.contextEngine.getAllProjectSymbols(PROJECT_SLUG);
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);

    return NextResponse.json({ receipt, symbols, telemetry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
