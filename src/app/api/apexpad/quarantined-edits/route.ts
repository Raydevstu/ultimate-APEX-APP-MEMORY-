/**
 * src/app/api/apexpad/quarantined-edits/route.ts
 * PHASE 10 (GAP #2): recent hard-quarantined candidate edits — edits that
 * failed the strict pre-staging quarantine gate and never reached Artifact
 * Staging, with their structured blocking reasons.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/apexpad/engine';

export async function GET(req: NextRequest) {
  try {
    const engine = await getEngine();
    const sessionId = req.nextUrl.searchParams.get('sessionId') ?? undefined;
    const quarantinedEdits = await engine.fullPipeline.listQuarantinedEdits(sessionId);
    return NextResponse.json({ quarantinedEdits });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
