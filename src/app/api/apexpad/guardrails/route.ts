/**
 * src/app/api/apexpad/guardrails/route.ts
 * TASK 3 endpoint: runs the Model Generation Guardrails (anti-truncation AST
 * splicer, import hallucination verifier, version-skew scanner, anti-sycophancy
 * critic) over a candidate edit and returns the persisted inspection report.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type { InspectGuardrailsRequest } from '@/lib/apexpad-guardrails-types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<InspectGuardrailsRequest>;
    const sessionId = body.sessionId || `sess_${Date.now()}`;
    const targetFilePath = (body.targetFilePath || '').trim();
    const previousContent = body.previousContent ?? '';
    const proposedContent = body.proposedContent ?? '';
    const userPrompt = body.userPrompt ?? '';

    if (!targetFilePath) {
      return NextResponse.json({ error: 'targetFilePath is required' }, { status: 400 });
    }
    if (!proposedContent.trim()) {
      return NextResponse.json({ error: 'proposedContent is required' }, { status: 400 });
    }

    const report = await engine.codeGuardrails.inspectAndHealCandidateCode({
      sessionId,
      projectSlug: PROJECT_SLUG,
      targetFilePath,
      previousContent,
      proposedContent,
      userPrompt,
      allowedSymbolDeletions: Array.isArray(body.allowedSymbolDeletions)
        ? body.allowedSymbolDeletions.map(String)
        : undefined,
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

/** Recent guardrail reports (summary view, newest first). */
export async function GET(req: NextRequest) {
  try {
    const engine = await getEngine();
    const sessionId = req.nextUrl.searchParams.get('sessionId') ?? undefined;
    const reports = await engine.codeGuardrails.listRecentReports(sessionId, 12);
    return NextResponse.json({ reports });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
