'use client'

/**
 * src/hooks/use-apexpad-sse.ts
 * Live SSE subscription to /api/apexpad/events.
 * The browser auto-reconnects EventSource; we additionally tear down and
 * re-create the stream 2s after any error so the feed self-heals.
 */
import { useEffect, useRef, useState } from 'react'
import type { UnattendedCaptureEvent } from '@/lib/apexpad-types'

const SSE_PATH = '/api/apexpad/events'
const RECONNECT_DELAY_MS = 2000

export function useApexpadSse(
  onEvent: (event: UnattendedCaptureEvent) => void,
): boolean {
  const [connected, setConnected] = useState(false)
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    const connect = () => {
      if (disposed) return
      source = new EventSource(SSE_PATH)

      source.onopen = () => setConnected(true)

      source.onmessage = (message: MessageEvent<string>) => {
        try {
          const parsed = JSON.parse(message.data) as Partial<UnattendedCaptureEvent>
          // Ignore control/status frames that are not conformant capture events.
          if (
            typeof parsed.eventType === 'string' &&
            typeof parsed.timestamp === 'string' &&
            typeof parsed.payload === 'object' &&
            parsed.payload !== null
          ) {
            onEventRef.current({
              eventType: parsed.eventType as UnattendedCaptureEvent['eventType'],
              timestamp: parsed.timestamp,
              sessionId: parsed.sessionId ?? 'unknown',
              projectSlug: parsed.projectSlug ?? 'unknown',
              payload: parsed.payload as Record<string, unknown>,
            })
          }
        } catch {
          // Malformed frame — ignore and keep the stream alive.
        }
      }

      source.onerror = () => {
        setConnected(false)
        source?.close()
        source = null
        retryTimer = setTimeout(connect, RECONNECT_DELAY_MS)
      }
    }

    connect()

    return () => {
      disposed = true
      if (retryTimer) clearTimeout(retryTimer)
      source?.close()
      source = null
    }
  }, [])

  return connected
}
