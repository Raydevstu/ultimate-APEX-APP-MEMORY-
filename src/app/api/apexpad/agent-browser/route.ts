/**
 * src/app/api/apexpad/agent-browser/route.ts
 * TASK 4 endpoint: the Agent-Browser verification loop.
 *   POST — executes one command (open | snapshot | click | fill | get_url | close)
 *          with loud failures, stale RefMap enforcement, CSPRNG content
 *          boundaries and domain allowlist.
 *   PUT  — seeds/updates the live page DOM state (capture-daemon registry).
 *   GET  — current session state (live page + active RefMap + action log).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/apexpad/engine';
import type {
  ExecuteAgentBrowserCommandRequest,
  SetLiveDomStateRequest,
} from '@/lib/apexpad-guardrails-types';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<ExecuteAgentBrowserCommandRequest>;
    const sessionId = body.sessionId;
    const command = body.command;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    if (!command || typeof command.commandType !== 'string') {
      return NextResponse.json({ error: 'command.commandType is required' }, { status: 400 });
    }

    const result = await engine.runtimeVerifier.executeAgentBrowserCommand(sessionId, command);
    return NextResponse.json({ result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const engine = await getEngine();
    const body = (await req.json()) as Partial<SetLiveDomStateRequest>;
    const sessionId = body.sessionId;
    const url = (body.url || '').trim();
    const elements = Array.isArray(body.elements) ? body.elements : [];
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }

    const livePage = engine.runtimeVerifier.setLivePageDomState({
      sessionId,
      url,
      elements,
    });
    return NextResponse.json({
      livePage: {
        sessionId: livePage.sessionId,
        url: livePage.url,
        revision: livePage.revision,
        elementCount: livePage.elements.length,
        updatedAt: livePage.updatedAt,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const engine = await getEngine();
    const sessionId = req.nextUrl.searchParams.get('sessionId');
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    const state = engine.runtimeVerifier.getBrowserSessionState(sessionId);
    return NextResponse.json({ state });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
