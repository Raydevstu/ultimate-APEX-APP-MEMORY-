/**
 * src/server/apexpad/distillation-pipeline.ts
 * Headroom ContentRouter + SmartCrusher (JSON) + CodeCompressor (AST) +
 * Log/Prose Crusher + CCR (Compress-Cache-Retrieve) with TOIN reinforcement.
 */

import crypto from 'crypto';
import { db } from '@/lib/db';
import { MemoryRouter } from './memory-router';
import { isFtsAvailable } from './fts';
import type { CCRCompressedBlock, ContentPayloadType } from '@/lib/apexpad-types';

export class DistillationPipeline {
  /** Automatically classify content payload for compressor routing. */
  public classifyContent(rawText: string, hintLabel = ''): ContentPayloadType {
    const trimmed = rawText.trim();
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch {
        // Fallback if malformed JSON
      }
    }

    if (trimmed.includes('[ref=e') || hintLabel.toLowerCase().includes('snapshot')) {
      return 'accessibility_tree';
    }

    const logLines = trimmed.split('\n').slice(0, 20);
    const logPatternCount = logLines.filter((l) =>
      /(\bINFO\b|\bWARN\b|\bERROR\b|\bFATAL\b|\bDEBUG\b|\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.test(l)
    ).length;
    if (logLines.length >= 4 && logPatternCount / logLines.length >= 0.4) {
      return 'log';
    }

    if (
      /\.(ts|tsx|js|jsx|py|rs|go|cpp|java|sql)$/i.test(hintLabel) ||
      /(export\s+(class|function|interface|const)|import\s+.*from\s+|def\s+\w+\s*\(|fn\s+\w+\s*\()/.test(trimmed)
    ) {
      return 'code';
    }

    return 'prose';
  }

  /** Main entry: route through specialized compressor, store raw bytes, return reversible stub. */
  public async compressAndStoreCCR(params: {
    sessionId: string;
    sourceLabel: string;
    rawContent: string;
    forceType?: ContentPayloadType;
  }): Promise<CCRCompressedBlock> {
    const scrubbed = MemoryRouter.scrubPrivateContent(params.rawContent);
    const originalTokens = MemoryRouter.estimateTokens(scrubbed);
    const contentType = params.forceType ?? this.classifyContent(scrubbed, params.sourceLabel);

    const hash = crypto
      .createHash('sha256')
      .update(`${params.sourceLabel}:${scrubbed}`)
      .digest('hex')
      .slice(0, 12);
    const ccrId = `ccr_${hash}`;

    // If already small (< 140 tokens), store without lossy folding
    if (originalTokens <= 140) {
      return this.persistCcr({
        ccrId,
        sessionId: params.sessionId,
        sourceLabel: params.sourceLabel,
        contentType,
        scrubbed,
        compressedStub: scrubbed,
        originalTokens,
        compressedTokens: originalTokens,
        preserveRetrievalState: false,
      });
    }

    let compressedBody: string;
    switch (contentType) {
      case 'json':
        compressedBody = this.smartCrushJson(scrubbed);
        break;
      case 'code':
        compressedBody = this.compressCodeAst(scrubbed, ccrId);
        break;
      case 'log':
        compressedBody = this.crushLogs(scrubbed);
        break;
      case 'accessibility_tree':
        compressedBody = this.crushAccessibilityTree(scrubbed);
        break;
      case 'prose':
      default:
        compressedBody = this.compressProse(scrubbed);
        break;
    }

    const ccrFooter = `\n<ccr_ref id="${ccrId}" source="${params.sourceLabel}" type="${contentType}" orig_tokens="${originalTokens}" hint="Call headroom_retrieve('${ccrId}') to inspect full uncompressed bytes" />`;
    const compressedStub = `${compressedBody}${ccrFooter}`;
    const compressedTokens = MemoryRouter.estimateTokens(compressedStub);

    return this.persistCcr({
      ccrId,
      sessionId: params.sessionId,
      sourceLabel: params.sourceLabel,
      contentType,
      scrubbed,
      compressedStub,
      originalTokens,
      compressedTokens,
      preserveRetrievalState: true,
    });
  }

  private async persistCcr(args: {
    ccrId: string;
    sessionId: string;
    sourceLabel: string;
    contentType: ContentPayloadType;
    scrubbed: string;
    compressedStub: string;
    originalTokens: number;
    compressedTokens: number;
    preserveRetrievalState: boolean;
  }): Promise<CCRCompressedBlock> {
    const compressionRatio = Number(
      (args.compressedTokens / Math.max(1, args.originalTokens)).toFixed(3)
    );
    const now = new Date().toISOString();

    let retrievalCount = 0;
    let valueScore = 0.5;

    if (args.preserveRetrievalState) {
      const prev = await db.ccrBlock.findUnique({ where: { ccrId: args.ccrId } });
      if (prev) {
        retrievalCount = prev.retrievalCount;
        valueScore = prev.valueScore;
      }
    }

    const saved = await db.ccrBlock.upsert({
      where: { ccrId: args.ccrId },
      create: {
        ccrId: args.ccrId,
        sessionId: args.sessionId,
        sourceLabel: args.sourceLabel,
        contentType: args.contentType,
        originalBytes: args.scrubbed,
        compressedStub: args.compressedStub,
        originalTokens: args.originalTokens,
        compressedTokens: args.compressedTokens,
        compressionRatio,
        retrievalCount,
        valueScore,
        createdAt: now,
      },
      update: {
        sessionId: args.sessionId,
        sourceLabel: args.sourceLabel,
        contentType: args.contentType,
        originalBytes: args.scrubbed,
        compressedStub: args.compressedStub,
        originalTokens: args.originalTokens,
        compressedTokens: args.compressedTokens,
        compressionRatio,
      },
    });

    return {
      ccrId: saved.ccrId,
      sessionId: saved.sessionId,
      sourceLabel: saved.sourceLabel,
      contentType: saved.contentType as ContentPayloadType,
      originalBytes: saved.originalBytes,
      compressedStub: saved.compressedStub,
      originalTokens: saved.originalTokens,
      compressedTokens: saved.compressedTokens,
      compressionRatio: saved.compressionRatio,
      retrievalCount: saved.retrievalCount,
      valueScore: saved.valueScore,
      createdAt: saved.createdAt,
    };
  }

  /** Headroom SmartCrusher: 60-95% JSON compression preserving schema + anomalies. */
  public smartCrushJson(jsonString: string): string {
    try {
      const parsed: unknown = JSON.parse(jsonString);
      const crushed = this.crushJsonNode(parsed, 0);
      return JSON.stringify(crushed, null, 2);
    } catch {
      return this.crushLogs(jsonString);
    }
  }

  private crushJsonNode(node: unknown, depth: number): unknown {
    if (depth > 5) return '[DepthTruncated]';
    if (Array.isArray(node)) {
      if (node.length <= 4) {
        return node.map((item) => this.crushJsonNode(item, depth + 1));
      }

      const anomalies = node.filter((item) => {
        const str = JSON.stringify(item).toLowerCase();
        return (
          str.includes('"error"') ||
          str.includes('"fatal"') ||
          str.includes('"failed"') ||
          str.includes('"exception"') ||
          str.includes('"status":500') ||
          str.includes('"status":4')
        );
      });

      const schemaKeys =
        typeof node[0] === 'object' && node[0] !== null
          ? Object.keys(node[0] as Record<string, unknown>)
          : [typeof node[0]];

      return {
        _smartCrusherArray: true,
        totalItems: node.length,
        itemSchemaKeys: schemaKeys,
        headSample: node.slice(0, 2).map((i) => this.crushJsonNode(i, depth + 1)),
        anomaliesPreserved: anomalies.slice(0, 3).map((i) => this.crushJsonNode(i, depth + 1)),
        tailSample: this.crushJsonNode(node[node.length - 1], depth + 1),
      };
    }

    if (typeof node === 'object' && node !== null) {
      const obj = node as Record<string, unknown>;
      const result: Record<string, unknown> = {};
      const keys = Object.keys(obj);
      for (const k of keys.slice(0, 35)) {
        const val = obj[k];
        if (typeof val === 'string' && val.length > 280) {
          result[k] = `${val.slice(0, 240)}... [truncated ${val.length - 240} chars]`;
        } else {
          result[k] = this.crushJsonNode(val, depth + 1);
        }
      }
      if (keys.length > 35) {
        result._omittedKeyCount = keys.length - 35;
      }
      return result;
    }

    return node;
  }

  /** Headroom AST-Aware CodeCompressor: signatures + contracts kept, bodies folded. */
  public compressCodeAst(code: string, ccrId: string): string {
    const lines = code.split('\n');
    const output: string[] = [];
    let braceDepth = 0;
    let bodyStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const lineNum = i + 1;

      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;

      const isSignatureOrImport =
        /^(import\s+|export\s+|interface\s+|type\s+|class\s+|async\s+function\s+|function\s+|public\s+|private\s+|protected\s+|def\s+|fn\s+|struct\s+|enum\s+)/.test(trimmed) ||
        trimmed.startsWith('//') ||
        trimmed.startsWith('/*') ||
        trimmed.startsWith('*');

      if (braceDepth <= 1 || isSignatureOrImport) {
        if (bodyStartLine !== -1 && lineNum - bodyStartLine > 3) {
          output.push(
            `    /* [CCR Folded Lines ${bodyStartLine}-${lineNum - 1}: call headroom_retrieve('${ccrId}', ${bodyStartLine}, ${lineNum - 1})] */`
          );
        }
        bodyStartLine = -1;
        output.push(`${String(lineNum).padStart(4, ' ')} | ${line}`);
      } else {
        if (bodyStartLine === -1) {
          bodyStartLine = lineNum;
        }
        // Always keep explicit throw / error / return contract lines even inside deep bodies
        if (/\b(throw\s+new|console\.error|return\s+)/.test(trimmed)) {
          output.push(`${String(lineNum).padStart(4, ' ')} | ${line}`);
        }
      }

      braceDepth = Math.max(0, braceDepth + openBraces - closeBraces);
    }

    if (bodyStartLine !== -1) {
      output.push(
        `    /* [CCR Folded Lines ${bodyStartLine}-${lines.length}: call headroom_retrieve('${ccrId}', ${bodyStartLine}, ${lines.length})] */`
      );
    }

    return output.join('\n');
  }

  /** Headroom Log Crusher: collapse repeated templates, keep all ERROR/FATAL context. */
  public crushLogs(logText: string): string {
    const lines = logText.split('\n');
    const templateCounts = new Map<string, { count: number; sample: string }>();
    const criticalLines: string[] = [];

    lines.forEach((line, idx) => {
      if (/(\bERROR\b|\bFATAL\b|\bException\b|\bTraceback\b|\bFAIL\b)/i.test(line)) {
        const start = Math.max(0, idx - 1);
        const end = Math.min(lines.length - 1, idx + 2);
        criticalLines.push(`[Lines ${start + 1}-${end + 1}]:\n${lines.slice(start, end + 1).join('\n')}`);
      } else {
        const normalized = line
          .replace(/\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<TIMESTAMP>')
          .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<UUID>')
          .replace(/\b\d+\b/g, '<N>');
        const existing = templateCounts.get(normalized);
        if (existing) {
          existing.count++;
        } else {
          templateCounts.set(normalized, { count: 1, sample: line });
        }
      }
    });

    const summaryLines: string[] = [
      `=== LOG SUMMARY (${lines.length} raw lines -> ${templateCounts.size} unique templates) ===`,
    ];
    for (const [, entry] of Array.from(templateCounts.entries()).slice(0, 20)) {
      summaryLines.push(entry.count > 1 ? `[x${entry.count}] ${entry.sample}` : entry.sample);
    }

    if (criticalLines.length > 0) {
      summaryLines.push(`=== CRITICAL / ERROR ANOMALIES (${criticalLines.length}) ===`);
      summaryLines.push(...criticalLines.slice(0, 12));
    }

    return summaryLines.join('\n');
  }

  /** Agent-Browser accessibility tree pruner: keep interactive refs + structural roles. */
  public crushAccessibilityTree(treeText: string): string {
    return treeText
      .split('\n')
      .filter(
        (line) =>
          line.includes('[ref=e') ||
          /\b(heading|button|link|textbox|checkbox|combobox|dialog|alert|main|navigation)\b/i.test(line)
      )
      .join('\n');
  }

  /** Prose & Markdown Distiller: keep headings, bullets, code blocks, high-salience lines. */
  public compressProse(prose: string): string {
    const lines = prose.split('\n');
    const kept: string[] = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('#') ||
        trimmed.startsWith('- ') ||
        trimmed.startsWith('* ') ||
        trimmed.startsWith('1.') ||
        trimmed.startsWith('```') ||
        /\b(must|never|always|architecture|schema|constraint|decision|todo|fixme)\b/i.test(trimmed)
      ) {
        kept.push(line);
      } else if (trimmed.length > 40) {
        kept.push(trimmed.slice(0, 180) + (trimmed.length > 180 ? '...' : ''));
      }
    }
    return kept.join('\n');
  }

  /** CCR Tool Handler (`headroom_retrieve`): re-inflate exact bytes + TOIN reinforcement. */
  public async retrieveOriginalCCR(
    ccrId: string,
    lineStart?: number,
    lineEnd?: number
  ): Promise<{
    ccrId: string;
    sourceLabel: string;
    contentType: ContentPayloadType;
    uncompressedSlice: string;
    retrievalCount: number;
    updatedValueScore: number;
  } | null> {
    const row = await db.ccrBlock.findUnique({ where: { ccrId } });
    if (!row) return null;

    const nextCount = row.retrievalCount + 1;
    // TOIN Reinforcement: boost value_score asymptotically toward 1.0 on each retrieval
    const currentScore = row.valueScore;
    const updatedValueScore = Number(
      Math.min(1.0, currentScore + (1.0 - currentScore) * 0.25).toFixed(4)
    );

    await db.ccrBlock.update({
      where: { ccrId },
      data: { retrievalCount: nextCount, valueScore: updatedValueScore },
    });

    const fullText = row.originalBytes;
    if (lineStart !== undefined && lineEnd !== undefined) {
      const lines = fullText.split('\n');
      const startIdx = Math.max(0, lineStart - 1);
      const endIdx = Math.min(lines.length, lineEnd);
      const numberedSlice = lines
        .slice(startIdx, endIdx)
        .map((l, idx) => `${String(startIdx + idx + 1).padStart(4, ' ')} | ${l}`)
        .join('\n');
      return {
        ccrId,
        sourceLabel: row.sourceLabel,
        contentType: row.contentType as ContentPayloadType,
        uncompressedSlice: numberedSlice,
        retrievalCount: nextCount,
        updatedValueScore,
      };
    }

    return {
      ccrId,
      sourceLabel: row.sourceLabel,
      contentType: row.contentType as ContentPayloadType,
      uncompressedSlice: fullText,
      retrievalCount: nextCount,
      updatedValueScore,
    };
  }
}

// Re-exported for consumers that need the FTS capability flag next to the pipeline.
export { isFtsAvailable };
