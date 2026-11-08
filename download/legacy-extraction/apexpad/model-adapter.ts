/**
 * src/server/apexpad/model-adapter.ts
 * Production Model Retrieval Adapter, Progressive Tool-Call Interceptor,
 * Inline <memory> Extractor, Z.ai SDK LLM synthesis, and Dashboard Telemetry Aggregator.
 * z-ai-web-dev-sdk is used SERVER-SIDE ONLY.
 */

import { db } from '@/lib/db';
import ZAI from 'z-ai-web-dev-sdk';
import { MemoryRouter } from './memory-router';
import { DistillationPipeline } from './distillation-pipeline';
import { ContextEngine } from './context-engine';
import { publishCaptureEvent } from './event-bus';
import type {
  DashboardTelemetrySnapshot,
  ModelToolCallResult,
  ObservationRecord,
  PackedContextEnvelope,
} from '@/lib/apexpad-types';

export interface ModelToolCallRequest {
  toolName:
    | 'search_memory'
    | 'get_memory_timeline'
    | 'get_observations'
    | 'headroom_retrieve'
    | 'ripwire_blast_radius';
  arguments: Record<string, unknown>;
}

export class ModelRetrievalAdapter {
  private memoryRouter: MemoryRouter;
  private distillationPipeline: DistillationPipeline;
  private contextEngine: ContextEngine;

  constructor(
    memoryRouter: MemoryRouter,
    distillationPipeline: DistillationPipeline,
    contextEngine: ContextEngine
  ) {
    this.memoryRouter = memoryRouter;
    this.distillationPipeline = distillationPipeline;
    this.contextEngine = contextEngine;
  }

  /** Executes any of the 5 Context & Memory Mechanics tools requested by the LLM. */
  public async executeModelToolCall(
    projectSlug: string,
    call: ModelToolCallRequest
  ): Promise<ModelToolCallResult> {
    let resultPayload: unknown;

    switch (call.toolName) {
      case 'search_memory': {
        const query = String(call.arguments.query || '');
        const limit = Number(call.arguments.limit || 10);
        resultPayload = await this.memoryRouter.searchIndex({ projectSlug, query, limit });
        break;
      }

      case 'get_memory_timeline': {
        const observationId = String(call.arguments.observationId || '');
        const windowSize = Number(call.arguments.windowSize || 2);
        resultPayload = await this.memoryRouter.getTimeline(observationId, windowSize);
        break;
      }

      case 'get_observations': {
        const ids = Array.isArray(call.arguments.ids) ? call.arguments.ids.map(String) : [];
        resultPayload = await this.memoryRouter.getObservationsByIds(ids);
        break;
      }

      case 'headroom_retrieve': {
        const ccrId = String(call.arguments.ccrId || '');
        const lineStart =
          call.arguments.lineStart !== undefined ? Number(call.arguments.lineStart) : undefined;
        const lineEnd =
          call.arguments.lineEnd !== undefined ? Number(call.arguments.lineEnd) : undefined;
        resultPayload = await this.distillationPipeline.retrieveOriginalCCR(
          ccrId,
          lineStart,
          lineEnd
        );
        break;
      }

      case 'ripwire_blast_radius': {
        const targetFilePath = String(call.arguments.targetFilePath || '');
        const proposedContent = String(call.arguments.proposedContent || '');
        const previousContent = String(call.arguments.previousContent || '');
        resultPayload = await this.contextEngine.analyzeEditBlastRadius({
          projectSlug,
          targetFilePath,
          proposedContent,
          previousContent,
        });
        break;
      }

      default:
        throw new Error(`Unsupported model tool: ${String((call as { toolName?: string }).toolName)}`);
    }

    const outputJson = JSON.stringify(resultPayload, null, 2);
    return {
      toolName: call.toolName,
      outputJson,
      tokensConsumed: MemoryRouter.estimateTokens(outputJson),
    };
  }

  /**
   * End-to-end Model Retrieval & Synthesis turn:
   * 1. Packs Frozen Prefix + U-Curve Live Context
   * 2. Auto-resolves <ccr_ref>/obs retrieval mentions from the prompt
   * 3. Calls Z.ai SDK LLM (or deterministic AST/Memory synthesizer when offline)
   * 4. Parses and persists inline <memory> blocks with zero extra latency
   */
  public async runContextualAgentTurn(params: {
    sessionId: string;
    projectSlug: string;
    userPrompt: string;
    tokenBudgetCeiling: number;
    activeCcrBlocks?: Array<{ sourceLabel: string; rawContent: string }>;
  }): Promise<{
    cleanedResponse: string;
    storedInlineObservations: ObservationRecord[];
    executedToolCalls: ModelToolCallResult[];
    contextEnvelope: PackedContextEnvelope;
    llmMode: 'sdk' | 'deterministic';
  }> {
    const contextEnvelope = await this.contextEngine.buildContextPack({
      sessionId: params.sessionId,
      projectSlug: params.projectSlug,
      userTaskPrompt: params.userPrompt,
      tokenBudgetCeiling: params.tokenBudgetCeiling,
      activeCcrBlocks: params.activeCcrBlocks,
    });

    const executedToolCalls: ModelToolCallResult[] = [];

    // Automatic pre-retrieval when the prompt explicitly references a CCR or observation id
    const ccrMentionMatch = /\b(ccr_[0-9a-f]{8,16})\b/i.exec(params.userPrompt);
    if (ccrMentionMatch) {
      executedToolCalls.push(
        await this.executeModelToolCall(params.projectSlug, {
          toolName: 'headroom_retrieve',
          arguments: { ccrId: ccrMentionMatch[1] },
        })
      );
    }

    const obsMentionMatch = /\b(obs_[0-9a-f]{8,16})\b/i.exec(params.userPrompt);
    if (obsMentionMatch) {
      executedToolCalls.push(
        await this.executeModelToolCall(params.projectSlug, {
          toolName: 'get_observations',
          arguments: { ids: [obsMentionMatch[1]] },
        })
      );
    }

    let rawLlmResponse: string;
    let llmMode: 'sdk' | 'deterministic' = 'deterministic';

    try {
      const zai = await ZAI.create();
      const completion = await zai.chat.completions.create({
        messages: [
          {
            role: 'assistant',
            content:
              'You are the ApexPad Tier-1 Engineering Intelligence. Ground every answer in the provided context pack (U-Curve symbols, progressive memories, Project DNA rules, CCR stubs). Never print the context XML itself. Emit durable architectural learnings as inline <memory category="..." scope="repo" title="..." subtitle="..." files="..." symbols="...">...</memory> blocks. If a compressed block carries <ccr_ref id="ccr_..." />, you may request exact bytes via headroom_retrieve(ccrId).',
          },
          {
            role: 'user',
            content: `<packed_context>\n<frozen_prefix kv_cache_aligned hash="${contextEnvelope.frozenPrefixHash.slice(0, 16)}">\n${contextEnvelope.frozenPrefix}\n</frozen_prefix>\n${contextEnvelope.liveZoneXml}\n</packed_context>`,
          },
          {
            role: 'assistant',
            content:
              'Context pack absorbed — I have the ranked symbols, verified memories, DNA rules and CCR stubs. Awaiting the task. I will answer directly without repeating the pack.',
          },
          {
            role: 'user',
            content: [
              `Task: ${params.userPrompt}`,
              executedToolCalls.length > 0
                ? `Pre-retrieved tool outputs:\n${executedToolCalls
                    .map((t) => t.outputJson)
                    .join('\n')}`
                : '',
              'Respond to the task now with a concise, technically grounded engineering analysis. Do not print the context XML or these instructions. Emit any durable learnings as inline <memory> blocks per the system contract.',
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        thinking: { type: 'disabled' },
      });

      const content = completion.choices[0]?.message?.content;
      if (!content || content.trim().length === 0) {
        throw new Error('Empty LLM response');
      }
      rawLlmResponse = content;
      llmMode = 'sdk';
    } catch (err) {
      console.warn('[apexpad] Z.ai SDK unavailable, using deterministic synthesis:', err);
      rawLlmResponse = await this.deterministicSynthesis(params, contextEnvelope, executedToolCalls);
      llmMode = 'deterministic';
    }

    const { cleanedResponse, storedObservations } =
      await this.memoryRouter.extractAndStoreInlineMemories({
        sessionId: params.sessionId,
        projectSlug: params.projectSlug,
        rawLlmResponse,
      });

    publishCaptureEvent('agent:turn_complete', params.sessionId, params.projectSlug, {
      userPrompt: params.userPrompt.slice(0, 140),
      llmMode,
      storedObservations: storedObservations.length,
      toolCalls: executedToolCalls.length,
      estimatedTokens: contextEnvelope.estimatedTotalTokens,
    });

    return {
      cleanedResponse,
      storedInlineObservations: storedObservations,
      executedToolCalls,
      contextEnvelope,
      llmMode,
    };
  }

  /** Deterministic AST & Memory-grounded synthesis for offline / CI verification. */
  private async deterministicSynthesis(
    params: { userPrompt: string; projectSlug: string },
    contextEnvelope: PackedContextEnvelope,
    executedToolCalls: ModelToolCallResult[]
  ): Promise<string> {
    const topSymbols = (await this.contextEngine.getAllProjectSymbols(params.projectSlug)).slice(0, 3);
    const symSummary = topSymbols
      .map((s) => `${s.symbolName} (${s.filePath}:${s.startLine}, PPR=${s.pageRankScore})`)
      .join(', ');

    return [
      `Grounded Analysis for "${params.userPrompt}":`,
      `- Active Frozen Prefix Hash: ${contextEnvelope.frozenPrefixHash.slice(0, 12)}`,
      `- Top PPR Symbols Evaluated: ${symSummary || 'none indexed'}`,
      `- Progressive Memory Records Linked: ${contextEnvelope.includedObservationIds.length}`,
      executedToolCalls.length > 0
        ? `- Re-inflated Tool Payloads: ${executedToolCalls.map((c) => c.toolName).join(', ')}`
        : '',
      `<memory category="decision" scope="repo" title="Verified Task Context: ${params.userPrompt.slice(0, 36)}" subtitle="Automated synthesis check" files="${topSymbols.map((s) => s.filePath).join(',')}" symbols="${topSymbols.map((s) => s.symbolName).join(',')}">`,
      `- Verified task execution under ${contextEnvelope.byteCeiling} byte ceiling.`,
      `</memory>`,
    ]
      .filter(Boolean)
      .join('\n');
  }

  /** Real-time metrics for the ApexPad Dashboard & Telemetry Bar. */
  public async getDashboardTelemetry(projectSlug: string): Promise<DashboardTelemetrySnapshot> {
    const totalSessions = await db.sdkSession.count({ where: { projectSlug } });
    const totalObservations = await db.observation.count({ where: { projectSlug } });
    const staleObservationsCount = await db.observation.count({
      where: { projectSlug, isStale: true },
    });
    const confirmedDnaRulesCount = await db.projectDna.count({ where: { projectSlug } });
    const indexedAstSymbolsCount = await db.astSymbol.count({ where: { projectSlug } });
    const indexedAstEdgesCount = await db.astEdge.count({ where: { projectSlug } });

    const ccrRows = await db.ccrBlock.findMany({
      select: {
        originalTokens: true,
        compressedTokens: true,
        retrievalCount: true,
        valueScore: true,
      },
    });

    const origTok = ccrRows.reduce((sum, r) => sum + r.originalTokens, 0);
    const compTok = ccrRows.reduce((sum, r) => sum + r.compressedTokens, 0);
    const totalCcrRetrievals = ccrRows.reduce((sum, r) => sum + r.retrievalCount, 0);
    const avgScore =
      ccrRows.length > 0
        ? ccrRows.reduce((sum, r) => sum + r.valueScore, 0) / ccrRows.length
        : 0.5;
    const netTokenSavingsPct =
      origTok > 0 ? Number((((origTok - compTok) / origTok) * 100).toFixed(2)) : 0;

    return {
      projectSlug,
      totalSessions,
      totalObservations,
      staleObservationsCount,
      confirmedDnaRulesCount,
      ccrBlocksStored: ccrRows.length,
      totalOriginalTokensCrushed: origTok,
      totalCompressedTokensShipped: compTok,
      netTokenSavingsPct,
      totalCcrRetrievals,
      averageToinValueScore: Number(avgScore.toFixed(4)),
      indexedAstSymbolsCount,
      indexedAstEdgesCount,
    };
  }
}
