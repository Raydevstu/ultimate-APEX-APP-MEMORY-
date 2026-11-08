/**
 * src/server/apexpad/memory-router.ts
 * Unified Memory Router: Claude-Mem 3-Layer Progressive Disclosure, Headroom 4-Scope
 * Hierarchy, Inline <memory> Extraction, Ripwire Forward-Rekeying, and
 * TokenEconomizer 3-Session Project DNA Promotion.
 */

import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { isFtsAvailable } from './fts';
import type {
  MemoryScope,
  MemorySearchIndexHit,
  MemoryTimelineEntry,
  ObservationCategory,
  ObservationRecord,
  ProjectDnaRule,
  SdkSession,
  SessionSummaryRecord,
} from '@/lib/apexpad-types';

type SessionRow = Prisma.SdkSessionGetPayload<Record<string, never>>;
type ObservationRow = Prisma.ObservationGetPayload<Record<string, never>>;
type SummaryRow = Prisma.SessionSummaryGetPayload<Record<string, never>>;
type DnaRow = Prisma.ProjectDnaGetPayload<Record<string, never>>;

export function mapSession(row: SessionRow): SdkSession {
  return {
    sessionId: row.sessionId,
    projectSlug: row.projectSlug,
    branchName: row.branchName,
    firstPrompt: row.firstPrompt,
    promptCount: row.promptCount,
    status: row.status as SdkSession['status'],
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

export function mapObservation(row: ObservationRow): ObservationRecord {
  return {
    id: row.id,
    sessionId: row.sessionId,
    projectSlug: row.projectSlug,
    scope: row.scope as MemoryScope,
    category: row.category as ObservationCategory,
    title: row.title,
    subtitle: row.subtitle,
    narrative: row.narrative,
    factsJson: safeParseArray(row.factsJson),
    referencedFiles: safeParseArray(row.referencedFiles),
    referencedSymbols: safeParseArray(row.referencedSymbols),
    gitBlobHashes: safeParseRecord(row.gitBlobHashes),
    confirmationCount: row.confirmationCount,
    isStale: row.isStale,
    tokenEstimate: row.tokenEstimate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapSummary(row: SummaryRow): SessionSummaryRecord {
  return {
    sessionId: row.sessionId,
    projectSlug: row.projectSlug,
    requested: row.requested,
    investigated: row.investigated,
    learned: row.learned,
    completed: row.completed,
    tokenCount: row.tokenCount,
    createdAt: row.createdAt,
  };
}

export function mapDna(row: DnaRow): ProjectDnaRule {
  return {
    id: row.id,
    projectSlug: row.projectSlug,
    category: row.category as ProjectDnaRule['category'],
    ruleKey: row.ruleKey,
    ruleStatement: row.ruleStatement,
    sourceObservationIds: safeParseArray(row.sourceObservationIds),
    confirmationSessions: row.confirmationSessions,
    enforcedInCi: row.enforcedInCi,
    layerDenyRule: row.layerDenyRule,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function safeParseArray(json: string): string[] {
  try {
    const parsed: unknown = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function safeParseRecord(json: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(json);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        out[k] = String(v);
      }
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

export class MemoryRouter {
  /** Ripwire conservative calibrated ratio (2.36 bytes/token). */
  public static estimateTokens(text: string): number {
    const byteLen = Buffer.byteLength(text, 'utf8');
    return Math.ceil(byteLen / 2.36);
  }

  /** Strip <private>...</private> blocks and redact API keys before persistence. */
  public static scrubPrivateContent(input: string): string {
    return input
      .replace(/<private>[\s\S]*?<\/private>/gi, '[REDACTED_PRIVATE_BLOCK]')
      .replace(/(sk-[a-zA-Z0-9]{20,}|AIza[0-9A-Za-z-_]{35}|ghp_[a-zA-Z0-9]{36})/g, '[REDACTED_SECRET]');
  }

  /** Lifecycle Hook 1: SessionStart — registers session, loads DNA + recent summaries. */
  public async startSession(params: {
    sessionId: string;
    projectSlug: string;
    branchName: string;
    firstPrompt: string;
  }): Promise<{
    session: SdkSession;
    dnaRules: ProjectDnaRule[];
    recentSummaries: SessionSummaryRecord[];
  }> {
    const now = new Date().toISOString();
    const cleanPrompt = MemoryRouter.scrubPrivateContent(params.firstPrompt);

    const existing = await db.sdkSession.findUnique({
      where: { sessionId: params.sessionId },
    });

    if (existing) {
      await db.sdkSession.update({
        where: { sessionId: params.sessionId },
        data: { status: 'active' },
      });
    } else {
      await db.sdkSession.create({
        data: {
          sessionId: params.sessionId,
          projectSlug: params.projectSlug,
          branchName: params.branchName,
          firstPrompt: cleanPrompt,
          promptCount: 1,
          status: 'active',
          startedAt: now,
        },
      });
    }

    const sessionRow = (await db.sdkSession.findUnique({
      where: { sessionId: params.sessionId },
    })) as SessionRow;

    const dnaRules = await this.getProjectDnaRules(params.projectSlug);
    const recentSummaries = await this.getRecentSessionSummaries(params.projectSlug, 5);

    return {
      session: mapSession(sessionRow),
      dnaRules,
      recentSummaries,
    };
  }

  /** Lifecycle Hook 2: UserPromptSubmit. */
  public async recordUserPrompt(sessionId: string, rawPrompt: string): Promise<number> {
    const cleaned = MemoryRouter.scrubPrivateContent(rawPrompt);
    const now = new Date().toISOString();

    const session = await db.sdkSession.findUnique({ where: { sessionId } });
    if (!session) {
      throw new Error(`Session ${sessionId} not found when recording user prompt.`);
    }

    const nextCount = session.promptCount + 1;
    await db.sdkSession.update({
      where: { sessionId },
      data: { promptCount: nextCount, status: 'active' },
    });

    await db.userPrompt.create({
      data: {
        sessionId,
        promptNumber: nextCount,
        rawPrompt,
        cleanedPrompt: cleaned,
        createdAt: now,
      },
    });

    return nextCount;
  }

  /** Headroom zero-latency inline <memory> parser: persists + strips from user response. */
  public async extractAndStoreInlineMemories(params: {
    sessionId: string;
    projectSlug: string;
    rawLlmResponse: string;
    currentGitBlobHashes?: Record<string, string>;
  }): Promise<{ cleanedResponse: string; storedObservations: ObservationRecord[] }> {
    const storedObservations: ObservationRecord[] = [];
    const memoryRegex = /<memory\s+([^>]+)>([\s\S]*?)<\/memory>/gi;
    const attrRegex = /(\w+)="([^"]*)"/g;

    let cleanedResponse = params.rawLlmResponse;
    const matches = [...cleanedResponse.matchAll(memoryRegex)];

    for (const match of matches) {
      const [fullMatch, attrString, innerBody] = match;
      const attrs: Record<string, string> = {};
      let attrMatch: RegExpExecArray | null;
      while ((attrMatch = attrRegex.exec(attrString)) !== null) {
        attrs[attrMatch[1]] = attrMatch[2];
      }

      const category = (attrs.category as ObservationCategory) || 'decision';
      const scope = (attrs.scope as MemoryScope) || 'repo';
      const title = attrs.title || 'Architectural Observation';
      const subtitle = attrs.subtitle || 'Inline distilled memory';
      const referencedFiles = attrs.files
        ? attrs.files.split(',').map((s) => s.trim()).filter(Boolean)
        : [];
      const referencedSymbols = attrs.symbols
        ? attrs.symbols.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const lines = innerBody
        .trim()
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      const facts = lines
        .filter((l) => l.startsWith('- ') || l.startsWith('* '))
        .map((l) => l.slice(2).trim());
      const narrative = lines.filter((l) => !l.startsWith('- ') && !l.startsWith('* ')).join(' ');

      const obs = await this.recordObservation({
        sessionId: params.sessionId,
        projectSlug: params.projectSlug,
        scope,
        category,
        title,
        subtitle,
        narrative,
        facts,
        referencedFiles,
        referencedSymbols,
        gitBlobHashes: params.currentGitBlobHashes || {},
      });

      storedObservations.push(obs);
      cleanedResponse = cleanedResponse.replace(fullMatch, '');
    }

    return { cleanedResponse: cleanedResponse.trim(), storedObservations };
  }

  /** Persist observation + evaluate TokenEconomizer 3-Session DNA promotion rule. */
  public async recordObservation(params: {
    sessionId: string;
    projectSlug: string;
    scope: MemoryScope;
    category: ObservationCategory;
    title: string;
    subtitle: string;
    narrative: string;
    facts: string[];
    referencedFiles: string[];
    referencedSymbols: string[];
    gitBlobHashes: Record<string, string>;
  }): Promise<ObservationRecord> {
    const cleanTitle = MemoryRouter.scrubPrivateContent(params.title);
    const cleanSubtitle = MemoryRouter.scrubPrivateContent(params.subtitle);
    const cleanNarrative = MemoryRouter.scrubPrivateContent(params.narrative);
    const cleanFacts = params.facts.map((f) => MemoryRouter.scrubPrivateContent(f));
    const now = new Date().toISOString();

    const existing = await db.observation.findFirst({
      where: {
        projectSlug: params.projectSlug,
        title: { equals: cleanTitle },
      },
    });

    if (existing) {
      const newCount = existing.confirmationCount + 1;
      const mergedFiles = Array.from(new Set([...safeParseArray(existing.referencedFiles), ...params.referencedFiles]));
      const mergedSymbols = Array.from(new Set([...safeParseArray(existing.referencedSymbols), ...params.referencedSymbols]));
      const mergedHashes = {
        ...safeParseRecord(existing.gitBlobHashes),
        ...params.gitBlobHashes,
      };
      const tokenEst = MemoryRouter.estimateTokens(`${cleanTitle} ${cleanSubtitle} ${cleanNarrative}`);

      const updated = await db.observation.update({
        where: { id: existing.id },
        data: {
          confirmationCount: newCount,
          narrative: cleanNarrative,
          factsJson: JSON.stringify(cleanFacts),
          referencedFiles: JSON.stringify(mergedFiles),
          referencedSymbols: JSON.stringify(mergedSymbols),
          gitBlobHashes: JSON.stringify(mergedHashes),
          isStale: false,
          tokenEstimate: tokenEst,
          updatedAt: now,
        },
      });

      // TokenEconomizer Rule: confirmed >= 3 times -> promote to immutable Project DNA
      if (newCount >= 3 && ['decision', 'arch_rule', 'invariant'].includes(params.category)) {
        await this.promoteToProjectDna({
          projectSlug: params.projectSlug,
          ruleKey: cleanTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
          ruleStatement: `${cleanTitle}: ${cleanNarrative}`,
          sourceObservationId: existing.id,
          confirmationSessions: newCount,
        });
      }

      return mapObservation(updated);
    }

    const id = `obs_${crypto.randomBytes(6).toString('hex')}`;
    const tokenEstimate = MemoryRouter.estimateTokens(
      `${cleanTitle} ${cleanSubtitle} ${cleanNarrative} ${cleanFacts.join(' ')}`
    );

    const created = await db.observation.create({
      data: {
        id,
        sessionId: params.sessionId,
        projectSlug: params.projectSlug,
        scope: params.scope,
        category: params.category,
        title: cleanTitle,
        subtitle: cleanSubtitle,
        narrative: cleanNarrative,
        factsJson: JSON.stringify(cleanFacts),
        referencedFiles: JSON.stringify(params.referencedFiles),
        referencedSymbols: JSON.stringify(params.referencedSymbols),
        gitBlobHashes: JSON.stringify(params.gitBlobHashes),
        confirmationCount: 1,
        isStale: false,
        tokenEstimate,
        createdAt: now,
        updatedAt: now,
      },
    });

    return mapObservation(created);
  }

  /** Progressive Disclosure LAYER 1: lightweight FTS5/LIKE index search. */
  public async searchIndex(params: {
    projectSlug: string;
    query: string;
    scopes?: MemoryScope[];
    categories?: ObservationCategory[];
    includeStale?: boolean;
    limit?: number;
  }): Promise<MemorySearchIndexHit[]> {
    const scopes = params.scopes ?? ['global', 'repo', 'branch', 'session'];
    const limit = params.limit ?? 12;
    const includeStale = params.includeStale ?? false;

    const scopeFilter = { in: scopes };
    const staleFilter = includeStale ? undefined : false;

    if (isFtsAvailable()) {
      const sanitizedTokens = params.query
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .map((t) => t.trim())
        .filter((t) => t.length > 1);

      if (sanitizedTokens.length > 0) {
        const ftsMatchExpr = sanitizedTokens.map((t) => `"${t}"*`).join(' OR ');
        try {
          const rows = (await db.$queryRawUnsafe(
            `
            SELECT o."id", o."scope", o."category", o."title", o."subtitle",
                   o."is_stale" AS isStale, o."token_estimate" AS tokenEstimate, o."created_at" AS createdAt,
                   ABS(bm25("observations_fts", 0.0, 0.0, 5.0, 3.0, 1.5, 2.0, 4.0, 4.0)) AS bm25Score
            FROM "observations_fts" f
            JOIN "observations" o ON o."id" = f."obs_id"
            WHERE "observations_fts" MATCH ?
              AND (o."project_slug" = ? OR o."scope" = 'global')
              AND o."scope" IN (${scopes.map(() => '?').join(',')})
              ${includeStale ? '' : 'AND o."is_stale" = 0'}
              ${params.categories && params.categories.length > 0 ? `AND o."category" IN (${params.categories.map(() => '?').join(',')})` : ''}
            ORDER BY bm25Score ASC, o."confirmation_count" DESC
            LIMIT ?
            `,
            ftsMatchExpr,
            params.projectSlug,
            ...scopes,
            ...(params.categories ?? []),
            limit
          )) as Array<{
            id: string;
            scope: string;
            category: string;
            title: string;
            subtitle: string;
            isStale: number | boolean;
            tokenEstimate: number;
            createdAt: string;
            bm25Score: number;
          }>;

          return rows.map((r) => ({
            id: r.id,
            scope: r.scope as MemoryScope,
            category: r.category as ObservationCategory,
            title: r.title,
            subtitle: r.subtitle,
            isStale: Boolean(r.isStale),
            tokenEstimate: Number(r.tokenEstimate),
            createdAt: r.createdAt,
            bm25Score: Number(r.bm25Score) || 1,
          }));
        } catch (err) {
          console.warn('[apexpad] FTS query failed, using fallback:', err);
        }
      } else {
        const rows = await db.observation.findMany({
          where: {
            OR: [{ projectSlug: params.projectSlug }, { scope: 'global' }],
            scope: scopeFilter,
            isStale: staleFilter,
            ...(params.categories && params.categories.length > 0
              ? { category: { in: params.categories } }
              : {}),
          },
          orderBy: [{ confirmationCount: 'desc' }, { updatedAt: 'desc' }],
          take: limit,
        });
        return rows.map((r) => mapObservation(r) as unknown as MemorySearchIndexHit & { narrative?: string }).map((o) => ({
          id: o.id,
          scope: o.scope,
          category: o.category,
          title: o.title,
          subtitle: o.subtitle,
          isStale: o.isStale,
          tokenEstimate: o.tokenEstimate,
          createdAt: o.createdAt,
          bm25Score: 1.0,
        }));
      }
    }

    // LIKE-based fallback search (no FTS5)
    const tokens = params.query
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((t) => t.length > 1);

    const candidates = await db.observation.findMany({
      where: {
        OR: [{ projectSlug: params.projectSlug }, { scope: 'global' }],
        scope: scopeFilter,
        isStale: staleFilter,
        ...(params.categories && params.categories.length > 0
          ? { category: { in: params.categories } }
          : {}),
      },
      orderBy: [{ confirmationCount: 'desc' }, { updatedAt: 'desc' }],
      take: 200,
    });

    const scored = candidates.map((row) => {
      const haystacks: Array<[string, number]> = [
        [row.title.toLowerCase(), 5],
        [row.subtitle.toLowerCase(), 3],
        [row.factsJson.toLowerCase(), 2],
        [row.narrative.toLowerCase(), 1.5],
        [row.referencedFiles.toLowerCase(), 4],
        [row.referencedSymbols.toLowerCase(), 4],
      ];
      let score = 0.001;
      for (const tok of tokens) {
        for (const [hay, weight] of haystacks) {
          if (hay.includes(tok)) score += weight;
        }
      }
      return { row, score };
    });

    const filtered = tokens.length > 0 ? scored.filter((s) => s.score > 0.001) : scored;
    filtered.sort((a, b) => b.score - a.score);

    return filtered.slice(0, limit).map(({ row, score }) => ({
      id: row.id,
      scope: row.scope as MemoryScope,
      category: row.category as ObservationCategory,
      title: row.title,
      subtitle: row.subtitle,
      isStale: row.isStale,
      tokenEstimate: row.tokenEstimate,
      createdAt: row.createdAt,
      bm25Score: Number(score.toFixed(3)),
    }));
  }

  /** Progressive Disclosure LAYER 2: contextual timeline around an observation. */
  public async getTimeline(observationId: string, windowSize = 2): Promise<MemoryTimelineEntry | null> {
    const target = await db.observation.findUnique({ where: { id: observationId } });
    if (!target) return null;

    const precedingRows = await db.observation.findMany({
      where: { sessionId: target.sessionId, createdAt: { lt: target.createdAt } },
      orderBy: { createdAt: 'desc' },
      take: windowSize,
    });

    const succeedingRows = await db.observation.findMany({
      where: { sessionId: target.sessionId, createdAt: { gt: target.createdAt } },
      orderBy: { createdAt: 'asc' },
      take: windowSize,
    });

    const sessionRow = await db.sdkSession.findUnique({ where: { sessionId: target.sessionId } });

    const toHit = (r: ObservationRow): MemorySearchIndexHit => ({
      id: r.id,
      scope: r.scope as MemoryScope,
      category: r.category as ObservationCategory,
      title: r.title,
      subtitle: r.subtitle,
      isStale: r.isStale,
      tokenEstimate: r.tokenEstimate,
      createdAt: r.createdAt,
      bm25Score: 1.0,
    });

    return {
      anchorObservation: toHit(target),
      precedingObservations: precedingRows.reverse().map(toHit),
      succeedingObservations: succeedingRows.map(toHit),
      sessionPromptContext: sessionRow ? sessionRow.firstPrompt : '',
    };
  }

  /** Progressive Disclosure LAYER 3: full observation records by ids. */
  public async getObservationsByIds(ids: string[]): Promise<ObservationRecord[]> {
    if (ids.length === 0) return [];
    const rows = await db.observation.findMany({ where: { id: { in: ids } } });
    const order = new Map(ids.map((id, idx) => [id, idx]));
    rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
    return rows.map(mapObservation);
  }

  /** Ripwire: "Repair the key where it is stored, not where it is read." Forward-rekey on move. */
  public async rekeyMovedFile(
    projectSlug: string,
    oldFilePath: string,
    newFilePath: string
  ): Promise<number> {
    const candidates = await db.observation.findMany({
      where: { projectSlug, referencedFiles: { contains: oldFilePath } },
    });

    let updatedCount = 0;
    const now = new Date().toISOString();

    for (const row of candidates) {
      const files = safeParseArray(row.referencedFiles);
      if (files.includes(oldFilePath)) {
        const nextFiles = files.map((f) => (f === oldFilePath ? newFilePath : f));
        const hashes = safeParseRecord(row.gitBlobHashes);
        if (hashes[oldFilePath]) {
          hashes[newFilePath] = hashes[oldFilePath];
          delete hashes[oldFilePath];
        }
        await db.observation.update({
          where: { id: row.id },
          data: {
            referencedFiles: JSON.stringify(nextFiles),
            gitBlobHashes: JSON.stringify(hashes),
            updatedAt: now,
          },
        });
        updatedCount++;
      }
    }

    await db.astSymbol.updateMany({
      where: { projectSlug, filePath: oldFilePath },
      data: { filePath: newFilePath, updatedAt: now },
    });
    await db.astEdge.updateMany({
      where: { projectSlug, callerFile: oldFilePath },
      data: { callerFile: newFilePath },
    });
    await db.astEdge.updateMany({
      where: { projectSlug, calleeFile: oldFilePath },
      data: { calleeFile: newFilePath },
    });

    return updatedCount;
  }

  /** Magic Context Descent: flag memories pinned to an older blob hash as stale. */
  public async invalidateStaleMemoriesForFile(
    projectSlug: string,
    filePath: string,
    newFileSha256: string
  ): Promise<string[]> {
    const rows = await db.observation.findMany({
      where: { projectSlug, isStale: false, referencedFiles: { contains: filePath } },
    });

    const invalidatedIds: string[] = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      const hashes = safeParseRecord(row.gitBlobHashes);
      if (hashes[filePath] && hashes[filePath] !== newFileSha256) {
        await db.observation.update({
          where: { id: row.id },
          data: { isStale: true, updatedAt: now },
        });
        invalidatedIds.push(row.id);
      }
    }

    return invalidatedIds;
  }

  /** Promote a verified architectural rule or 3-session confirmed fact into Project DNA. */
  public async promoteToProjectDna(params: {
    projectSlug: string;
    category?: ProjectDnaRule['category'];
    ruleKey: string;
    ruleStatement: string;
    sourceObservationId: string;
    confirmationSessions?: number;
    layerDenyRule?: string | null;
  }): Promise<ProjectDnaRule> {
    const now = new Date().toISOString();
    const existing = await db.projectDna.findUnique({
      where: { projectSlug_ruleKey: { projectSlug: params.projectSlug, ruleKey: params.ruleKey } },
    });

    if (existing) {
      const obsIds = Array.from(new Set([...safeParseArray(existing.sourceObservationIds), params.sourceObservationId]));
      const nextConf = Math.max(
        existing.confirmationSessions + 1,
        params.confirmationSessions ?? 1
      );

      const updated = await db.projectDna.update({
        where: { id: existing.id },
        data: {
          ruleStatement: params.ruleStatement,
          sourceObservationIds: JSON.stringify(obsIds),
          confirmationSessions: nextConf,
          layerDenyRule: params.layerDenyRule ?? existing.layerDenyRule,
          updatedAt: now,
        },
      });
      return mapDna(updated);
    }

    const id = `dna_${crypto.randomBytes(6).toString('hex')}`;
    const category = params.category ?? 'architecture';
    const conf = params.confirmationSessions ?? 3;

    const created = await db.projectDna.create({
      data: {
        id,
        projectSlug: params.projectSlug,
        category,
        ruleKey: params.ruleKey,
        ruleStatement: params.ruleStatement,
        sourceObservationIds: JSON.stringify([params.sourceObservationId]),
        confirmationSessions: conf,
        enforcedInCi: true,
        layerDenyRule: params.layerDenyRule ?? null,
        createdAt: now,
        updatedAt: now,
      },
    });

    return mapDna(created);
  }

  public async getProjectDnaRules(projectSlug: string): Promise<ProjectDnaRule[]> {
    const rows = await db.projectDna.findMany({
      where: { projectSlug },
      orderBy: [{ confirmationSessions: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map(mapDna);
  }

  /** Lifecycle Hook 5: SessionEnd — structured summary for future SessionStart hooks. */
  public async completeSession(params: {
    sessionId: string;
    projectSlug: string;
    requested: string;
    investigated: string;
    learned: string;
    completed: string;
  }): Promise<SessionSummaryRecord> {
    const now = new Date().toISOString();
    const tokenCount = MemoryRouter.estimateTokens(
      `${params.requested} ${params.investigated} ${params.learned} ${params.completed}`
    );

    await db.sdkSession.update({
      where: { sessionId: params.sessionId },
      data: { status: 'completed', endedAt: now },
    });

    const summary = await db.sessionSummary.upsert({
      where: { sessionId: params.sessionId },
      create: {
        sessionId: params.sessionId,
        projectSlug: params.projectSlug,
        requested: params.requested,
        investigated: params.investigated,
        learned: params.learned,
        completed: params.completed,
        tokenCount,
        createdAt: now,
      },
      update: {
        requested: params.requested,
        investigated: params.investigated,
        learned: params.learned,
        completed: params.completed,
        tokenCount,
      },
    });

    return mapSummary(summary);
  }

  public async getRecentSessionSummaries(
    projectSlug: string,
    limit = 5
  ): Promise<SessionSummaryRecord[]> {
    const rows = await db.sessionSummary.findMany({
      where: { projectSlug },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map(mapSummary);
  }
}
