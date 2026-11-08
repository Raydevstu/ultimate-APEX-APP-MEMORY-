import { NextRequest } from 'next/server';
import { subscribeCaptureEvents } from '@/server/apexpad/event-bus';
import { ensureFtsSetup } from '@/server/apexpad/fts';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest): Promise<Response> {
  // Make sure engine-side setup has run before clients subscribe
  await ensureFtsSetup().catch(() => undefined);

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const send = (data: string) => write(`data: ${data}\n\n`);

      // Initial connection frame
      send(JSON.stringify({ status: 'connected', service: 'apexpad-capture' }));

      const unsubscribe = subscribeCaptureEvents((evt) => {
        send(JSON.stringify(evt));
      });

      // Heartbeat every 25s to keep intermediaries from closing the stream
      const heartbeat = setInterval(() => write(`: heartbeat\n\n`), 25000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        unsubscribe();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      // Abort when the client disconnects
      req.signal.addEventListener('abort', () => cleanup?.());
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
