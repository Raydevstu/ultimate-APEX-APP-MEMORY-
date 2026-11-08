/**
 * src/app/api/apexpad/e2e-suite/route.ts
 * §7.7 endpoint: executes the runtime End-to-End Verification Suite for
 * Tasks 2, 3, and 4 (overloaded prompt decomposition, anti-truncation +
 * hallucination guardrails, Agent-Browser @e1 RefMap loud-failure loop)
 * and returns per-assertion evidence.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/apexpad/engine';

export const maxDuration = 120;

export async function POST(_req: NextRequest) {
  try {
    const engine = await getEngine();
    const run = await engine.e2eSuite.runFullSuite();
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
