/**
 * src/app/api/apexpad/save-document/route.ts
 * PHASE 10 (GAP #4 / blueprint ITEM 4 — `apexpad:editor:save-document` IPC
 * equivalent): persists the active ApexPad note/code document to the real
 * workspace disk with path-traversal protection and atomic write semantics.
 * Backs the header "Saved locally" button with genuine disk persistence.
 */
import { NextRequest, NextResponse } from 'next/server';
import { saveWorkspaceDocument } from '@/server/apexpad/workspace';
import { publishCaptureEvent } from '@/server/apexpad/event-bus';
import type { SaveDocumentRequest } from '@/lib/apexpad-types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<SaveDocumentRequest>;
    const relativeFilePath = (body.relativeFilePath || '').trim();
    if (!relativeFilePath || typeof body.content !== 'string') {
      return NextResponse.json(
        { error: 'relativeFilePath and content are required' },
        { status: 400 }
      );
    }

    const receipt = saveWorkspaceDocument({ relativeFilePath, content: body.content });

    publishCaptureEvent('fs:file_indexed', body.notebook ?? 'workspace-save', 'apexpad-workspace', {
      commandType: 'save_document',
      filePath: receipt.filePath,
      byteLength: receipt.byteLength,
      sha256: receipt.sha256,
      existedBefore: receipt.existedBefore,
    });

    return NextResponse.json(receipt);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
