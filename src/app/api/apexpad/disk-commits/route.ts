/**
 * src/app/api/apexpad/disk-commits/route.ts
 * PHASE 10 (GAP #1): recent atomic disk commit receipts — the SHA-256 +
 * `.bak` ledger powering the Staging panel's rollback UI.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/apexpad/engine';

export async function GET(req: NextRequest) {
  try {
    const engine = await getEngine();
    const sessionId = req.nextUrl.searchParams.get('sessionId') ?? undefined;
    const commits = await engine.dagOrchestrator.listDiskCommits(sessionId);
    return NextResponse.json({ commits });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
