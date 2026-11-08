import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import type { InitWorkbenchRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<InitWorkbenchRequest>;
    const sessionId = body.sessionId || `sess_${Date.now()}`;
    const activeFilePath = body.activeFilePath || 'src/architecture/ContextNote.ts';
    const initialContent = body.initialContent || '';

    const sessionStart = await engine.memoryRouter.startSession({
      sessionId,
      projectSlug: PROJECT_SLUG,
      branchName: 'main',
      firstPrompt: 'Interactive Workbench Session',
    });

    if (initialContent.trim().length > 0) {
      await engine.contextEngine.indexFileSymbols({
        projectSlug: PROJECT_SLUG,
        filePath: activeFilePath,
        content: initialContent,
      });
      await engine.contextEngine.rebuildCallGraphEdges(PROJECT_SLUG, {
        [activeFilePath]: initialContent,
      });
    }

    const symbols = await engine.contextEngine.getAllProjectSymbols(PROJECT_SLUG);
    const memoryIndexHits = await engine.memoryRouter.searchIndex({
      projectSlug: PROJECT_SLUG,
      query: '',
      limit: 15,
    });
    const contextEnvelope = await engine.contextEngine.buildContextPack({
      sessionId,
      projectSlug: PROJECT_SLUG,
      userTaskPrompt: 'Initialize workbench context pack',
      tokenBudgetCeiling: 4000,
    });
    const telemetry = await engine.modelAdapter.getDashboardTelemetry(PROJECT_SLUG);
    const stagedArtifacts = await engine.dagOrchestrator.listStagedArtifacts();

    return NextResponse.json({
      session: sessionStart.session,
      dnaRules: sessionStart.dnaRules,
      recentSummaries: sessionStart.recentSummaries,
      symbols,
      memoryIndexHits,
      contextEnvelope,
      telemetry,
      stagedArtifacts,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
