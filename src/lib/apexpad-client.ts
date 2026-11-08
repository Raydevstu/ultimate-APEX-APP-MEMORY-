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
  AstSymbolNode,
  CcrRetrievalResult,
  CCRCompressedBlock,
  DagExecutionState,
  DashboardTelemetrySnapshot,
  DiskCommitListResponse,
  DiskRollbackReceipt,
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
  RollbackArtifactRequest,
  SaveDocumentRequest,
  SaveDocumentResponse,
  StageDagRequest,
  StagedArtifact,
  TimelineResponse,
} from '@/lib/apexpad-types'
import type {
  StructureSpecRequest,
  StructureSpecResponse,
  StructuredSpecContract,
  InspectGuardrailsRequest,
  InspectGuardrailsResponse,
  GuardrailReportListResponse,
  SetLiveDomStateRequest,
  SetLiveDomStateResponse,
  ExecuteAgentBrowserCommandRequest,
  ExecuteAgentBrowserCommandResponse,
  GetBrowserSessionStateResponse,
  RunRuntimeVerificationRequest,
  RunRuntimeVerificationResponse,
  RuntimeVerificationListResponse,
  RunFullPipelineRequest,
  RunFullPipelineResponse,
  RunE2eSuiteResponse,
} from '@/lib/apexpad-guardrails-types'

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

export interface ApexpadSpecListResponse {
  specs: StructuredSpecContract[]
  telemetry: DashboardTelemetrySnapshot
}

/* -------- PHASE 10 response envelopes -------- */

export interface ApexpadRollbackResponse {
  receipt: DiskRollbackReceipt
  symbols: AstSymbolNode[]
  telemetry: DashboardTelemetrySnapshot
}

/** Quarantined edit rows as served by the quarantine list endpoint. */
export interface QuarantinedEditSummary {
  quarantineId: string
  sessionId: string
  projectSlug: string
  targetFilePath: string
  blockingReasons: string[]
  quarantinedAt: string
}

export interface ApexpadQuarantineListResponse {
  quarantinedEdits: QuarantinedEditSummary[]
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

async function request<T>(path: string, body?: unknown, method?: 'POST' | 'PUT'): Promise<T> {
  const verb = method ?? (body === undefined ? 'GET' : 'POST')
  let res: Response
  try {
    res = await fetch(path, {
      method: verb,
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

  /** TASK 2: compile a raw prompt into a deterministic Specification Contract. */
  structureSpec: (body: StructureSpecRequest) =>
    request<StructureSpecResponse>('/api/apexpad/spec-structure', body),

  /** TASK 2: list recent specification contracts for a session. */
  listSpecs: (sessionId: string) =>
    request<ApexpadSpecListResponse>(
      `/api/apexpad/spec-structure?sessionId=${encodeURIComponent(sessionId)}`,
    ),

  resolveApproval: (body: ResolveApprovalRequest) =>
    request<ResolveApprovalResponse>('/api/apexpad/resolve-approval', body),

  /* -------------------- Phase 10: disk commit / rollback -------------------- */

  /** PHASE 10 (GAP #1): 1-click deterministic rollback of an approved commit. */
  rollbackArtifact: (body: RollbackArtifactRequest) =>
    request<ApexpadRollbackResponse>('/api/apexpad/dag-rollback', body),

  /** PHASE 10 (GAP #4): persist the active editor document to the workspace disk. */
  saveDocument: (body: SaveDocumentRequest) =>
    request<SaveDocumentResponse>('/api/apexpad/save-document', body),

  /** PHASE 10 (GAP #1): recent atomic disk commit receipts (`.bak` ledger). */
  listDiskCommits: (sessionId?: string) =>
    request<DiskCommitListResponse>(
      `/api/apexpad/disk-commits${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
    ),

  /** PHASE 10 (GAP #2): recent hard-quarantined candidate edits. */
  listQuarantinedEdits: (sessionId?: string) =>
    request<ApexpadQuarantineListResponse>(
      `/api/apexpad/quarantined-edits${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
    ),

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

  /* ------------------------- Slice 3: Task 3 guardrails ------------------------- */

  /** TASK 3: run the anti-truncation splicer + hallucination + skew + premise gates. */
  inspectGuardrails: (body: InspectGuardrailsRequest) =>
    request<InspectGuardrailsResponse>('/api/apexpad/guardrails', body),

  /** TASK 3: recent guardrail reports (summary view). */
  listGuardrailReports: (sessionId?: string) =>
    request<GuardrailReportListResponse>(
      `/api/apexpad/guardrails${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
    ),

  /* ---------------------- Slice 3: Task 4 agent-browser ---------------------- */

  /** Seed/update the live page DOM state for the Agent-Browser registry. */
  setLiveDomState: (body: SetLiveDomStateRequest) =>
    request<SetLiveDomStateResponse>('/api/apexpad/agent-browser', body, 'PUT'),

  /** Execute one Agent-Browser command (open/snapshot/click/fill/get_url/close). */
  executeAgentBrowserCommand: (body: ExecuteAgentBrowserCommandRequest) =>
    request<ExecuteAgentBrowserCommandResponse>('/api/apexpad/agent-browser', body),

  /** Current Agent-Browser session state (live page + active RefMap + log). */
  getBrowserSessionState: (sessionId: string) =>
    request<GetBrowserSessionStateResponse>(
      `/api/apexpad/agent-browser?sessionId=${encodeURIComponent(sessionId)}`,
    ),

  /* ----------------------- Slice 3: Task 4 verification ----------------------- */

  /** TASK 4: run compiler gate + test gate + agent-browser loop for an artifact. */
  runRuntimeVerification: (body: RunRuntimeVerificationRequest) =>
    request<RunRuntimeVerificationResponse>('/api/apexpad/verify-runtime', body),

  /** TASK 4: recent runtime verification reports. */
  listRuntimeVerifications: (sessionId?: string) =>
    request<RuntimeVerificationListResponse>(
      `/api/apexpad/verify-runtime${sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''}`,
    ),

  /* --------------------------- Slice 3: §7.6 pipeline --------------------------- */

  /** Run the unified 4-stage pipeline (spec -> guardrails -> DAG -> verification). */
  runFullPipeline: (body: RunFullPipelineRequest) =>
    request<RunFullPipelineResponse>('/api/apexpad/full-pipeline', body),

  /* --------------------------- Slice 3: §7.7 E2E suite --------------------------- */

  /** Run the §7.7 End-to-End Verification Suite for Tasks 2, 3 and 4. */
  runE2eSuite: () => request<RunE2eSuiteResponse>('/api/apexpad/e2e-suite', {}),
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
