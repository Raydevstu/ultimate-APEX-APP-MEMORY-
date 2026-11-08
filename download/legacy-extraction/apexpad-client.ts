/**
 * src/lib/apexpad-client.ts
 * ApexPad API client — thin fetch wrappers over the /api/apexpad contract.
 * Client-safe only (no server imports). All paths are RELATIVE.
 *
 * Domain types live in '@/lib/apexpad-types' (shared with backend).
 * A few response envelopes are not part of the shared type file yet, so
 * they are declared here (Apexpad* namespaced) without redefining anything.
 */
import type {
  AgentTurnRequest,
  AgentTurnResponse,
  CcrRetrievalResult,
  CCRCompressedBlock,
  DagExecutionState,
  DashboardTelemetrySnapshot,
  HookPostToolUseRequest,
  IndexFileRequest,
  IndexFileResponse,
  InitWorkbenchRequest,
  InitWorkbenchResponse,
  MemorySearchIndexHit,
  ModelToolCallResult,
  ObservationRecord,
  ResolveApprovalRequest,
  ResolveApprovalResponse,
  RetrieveCcrRequest,
  StageDagRequest,
  StagedArtifact,
  TimelineResponse,
} from '@/lib/apexpad-types'

/* -------- Response envelopes missing from the shared types file -------- */

export interface ApexpadHookPostToolUseResponse {
  ccrBlock: CCRCompressedBlock
  observation: ObservationRecord
}

export interface ApexpadObservationsResponse {
  observations: ObservationRecord[]
}

export interface ApexpadMemorySearchResponse {
  hits: MemorySearchIndexHit[]
}

export interface ApexpadStagedArtifactsResponse {
  artifacts: StagedArtifact[]
}

/* --------------------------------- core --------------------------------- */

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown; message?: unknown }
    if (typeof body.error === 'string' && body.error.trim()) return body.error
    if (typeof body.message === 'string' && body.message.trim()) return body.message
  } catch {
    /* body was not JSON */
  }
  return `HTTP ${res.status} ${res.statusText}`
}

async function request<T>(path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    })
  } catch (err) {
    throw new ApiError(
      err instanceof Error ? err.message : 'Network request failed',
      0,
    )
  }
  if (!res.ok) {
    throw new ApiError(await parseErrorBody(res), res.status)
  }
  return (await res.json()) as T
}

/* ------------------------------- endpoints ------------------------------- */

export const apexpadApi = {
  init: (body: InitWorkbenchRequest) =>
    request<InitWorkbenchResponse>('/api/apexpad/init', body),

  indexFile: (body: IndexFileRequest) =>
    request<IndexFileResponse>('/api/apexpad/index-file', body),

  stageDag: (body: StageDagRequest) =>
    request<DagExecutionState>('/api/apexpad/stage-dag', body),

  resolveApproval: (body: ResolveApprovalRequest) =>
    request<ResolveApprovalResponse>('/api/apexpad/resolve-approval', body),

  /** Returns null when the CCR id is unknown — callers must handle that. */
  retrieveCcr: (body: RetrieveCcrRequest) =>
    request<CcrRetrievalResult | null>('/api/apexpad/retrieve-ccr', body),

  executeTool: (
    toolName: 'search_memory' | 'get_memory_timeline' | 'get_observations' | 'headroom_retrieve' | 'ripwire_blast_radius',
    args: Record<string, unknown>,
  ) =>
    request<ModelToolCallResult>('/api/apexpad/tool', { toolName, arguments: args }),

  agentTurn: (body: AgentTurnRequest) =>
    request<AgentTurnResponse>('/api/apexpad/agent-turn', body),

  hookPostToolUse: (body: HookPostToolUseRequest) =>
    request<ApexpadHookPostToolUseResponse>('/api/apexpad/hooks/post-tool-use', body),

  telemetry: () =>
    request<DashboardTelemetrySnapshot>('/api/apexpad/telemetry'),

  memoryTimeline: (observationId: string, windowSize?: number) =>
    request<TimelineResponse>('/api/apexpad/memory/timeline', {
      observationId,
      ...(windowSize === undefined ? {} : { windowSize }),
    }),

  memoryObservations: (ids: string[]) =>
    request<ApexpadObservationsResponse>('/api/apexpad/memory/observations', { ids }),

  memorySearch: (query: string, limit?: number) =>
    request<ApexpadMemorySearchResponse>('/api/apexpad/memory/search', {
      query,
      ...(limit === undefined ? {} : { limit }),
    }),

  stagedArtifacts: (sessionId?: string) =>
    request<ApexpadStagedArtifactsResponse>(
      `/api/apexpad/staged-artifacts${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
    ),
}

/* ------------------------------ misc helpers ----------------------------- */

export function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** Pretty-print a (possibly non-JSON) tool output string. */
export function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw) as unknown, null, 2)
  } catch {
    return raw
  }
}

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return '—'
  const delta = Math.max(0, now - then)
  const s = Math.floor(delta / 1000)
  if (s < 5) return 'just now'
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
