/**
 * src/server/apexpad/event-bus.ts
 * In-memory pub/sub bus for ApexPad live capture events, streamed to the UI via SSE.
 * Single-process dev server only (Next.js runtime).
 */

import { EventEmitter } from 'events';
import type { UnattendedCaptureEvent, CaptureEventType } from '@/lib/apexpad-types';

const globalForBus = globalThis as unknown as {
  apexpadBus: EventEmitter | undefined;
};

function getBus(): EventEmitter {
  if (!globalForBus.apexpadBus) {
    const bus = new EventEmitter();
    bus.setMaxListeners(200);
    globalForBus.apexpadBus = bus;
  }
  return globalForBus.apexpadBus;
}

export function publishCaptureEvent(
  eventType: CaptureEventType,
  sessionId: string,
  projectSlug: string,
  payload: Record<string, unknown>
): UnattendedCaptureEvent {
  const evt: UnattendedCaptureEvent = {
    eventType,
    timestamp: new Date().toISOString(),
    sessionId,
    projectSlug,
    payload,
  };
  getBus().emit('capture_event', evt);
  return evt;
}

export function subscribeCaptureEvents(
  listener: (evt: UnattendedCaptureEvent) => void
): () => void {
  const bus = getBus();
  bus.on('capture_event', listener);
  return () => {
    bus.off('capture_event', listener);
  };
}
