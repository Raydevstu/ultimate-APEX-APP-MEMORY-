import { NextRequest, NextResponse } from 'next/server';
import { getEngine, PROJECT_SLUG } from '@/server/apexpad/engine';
import { publishCaptureEvent } from '@/server/apexpad/event-bus';
import { getWorkspaceFileStore } from '@/server/apexpad/context-engine';
import type { HookPostToolUseRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<HookPostToolUseRequest>;
    const sessionId = body.sessionId || `codex_live_${Date.now()}`;
    const projectSlug = body.projectSlug || PROJECT_SLUG;
    const toolName = body.toolName || 'unknown_tool';
    const toolOutput = body.toolOutput || '';

    const ccrBlock = await engine.distillationPipeline.compressAndStoreCCR({
      sessionId,
      sourceLabel: `tool:${toolName}`,
      rawContent: toolOutput,
    });

    const referencedFiles = Array.isArray(body.referencedFiles) ? body.referencedFiles : [];
    const gitBlobHashes: Record<string, string> = {};
    // Attach known SHA-256 hashes for referenced files from the workspace store
    for (const f of referencedFiles) {
      const content = getWorkspaceFileStore().get(f);
      if (content !== undefined) {
        const { createHash } = await import('crypto');
        gitBlobHashes[f] = createHash('sha256').update(content).digest('hex');
      }
    }

    const observation = await engine.memoryRouter.recordObservation({
      sessionId,
      projectSlug,
      scope: body.scope || 'repo',
      category: body.category || 'tool_trace',
      title: body.title || `Tool Execution: ${toolName}`,
      subtitle: `CCR ${ccrBlock.ccrId} (${ccrBlock.originalTokens} -> ${ccrBlock.compressedTokens} tok)`,
      narrative: ccrBlock.compressedStub,
      facts: [`Tool: ${toolName}`, `CCR Reference: ${ccrBlock.ccrId}`],
      referencedFiles,
      referencedSymbols: Array.isArray(body.referencedSymbols) ? body.referencedSymbols : [],
      gitBlobHashes,
    });

    publishCaptureEvent('hook:post_tool_use', sessionId, projectSlug, {
      toolName,
      ccrId: ccrBlock.ccrId,
      compressionRatio: ccrBlock.compressionRatio,
      observationId: observation.id,
    });

    return NextResponse.json({ ccrBlock, observation });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
