/**
 * src/app/api/apexpad/verify-runtime/route.ts
 * TASK 4 endpoint: runs the full artifact verification (Compiler/Type-Check
 * Gate + Ripwire Test Gate + Agent-Browser loop) for a staged artifact and
 * persists the RuntimeVerificationReport.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import { db } from '@/lib/db';
import type { RunRuntimeVerificationRequest } from '@/lib/apexpad-guardrails-types';

export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<RunRuntimeVerificationRequest>;
    const sessionId = body.sessionId;
    const artifactId = body.artifactId;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    if (!artifactId) {
      return NextResponse.json({ error: 'artifactId is required' }, { status: 400 });
    }

    const artifact = await db.stagedArtifact.findUnique({ where: { artifactId } });
    if (!artifact) {
      return NextResponse.json({ error: `Staged artifact ${artifactId} not found` }, { status: 404 });
    }

    let blastRadiusTests: string[] = [];
    try {
      const parsed: unknown = JSON.parse(artifact.blastRadiusJson);
      if (
        parsed &&
        typeof parsed === 'object' &&
        Array.isArray((parsed as { requiredTests?: unknown }).requiredTests)
      ) {
        blastRadiusTests = (parsed as { requiredTests: unknown[] }).requiredTests.map(String);
      }
    } catch {
      blastRadiusTests = [];
    }

    const report = await engine.runtimeVerifier.runFullArtifactVerification({
      sessionId,
      projectSlug: PROJECT_SLUG,
      artifactId,
      targetFilePath: artifact.targetFilePath,
      candidateContent: artifact.proposedContent,
      previousContent: undefined,
      requiredTestFiles: blastRadiusTests,
      browserVerificationScript: body.browserVerificationScript,
    });
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);

    return NextResponse.json({ report, telemetry });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** Recent runtime verification reports (newest first). */
export async function GET(req: NextRequest) {
  try {
    const engine = await getEngine();
    const sessionId = req.nextUrl.searchParams.get('sessionId') ?? undefined;
    const reports = await engine.runtimeVerifier.listRecentVerifications(sessionId, 12);
    return NextResponse.json({ reports });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
