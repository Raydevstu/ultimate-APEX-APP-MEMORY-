/**
 * src/lib/apexpad-guardrails-types.ts
 * Domain Interfaces for Task 2 (Specification Structurer),
 * Task 3 (Generation Guardrails & Anti-Truncation Patcher), and
 * Task 4 (Automated Runtime Verification & Agent-Browser CDP Loop).
 *
 * APEX-EDITOR-V1 Slice 1 blueprint §7.1 — shared client/server contract.
 * Client-safe: types only, no runtime imports.
 */

/* ------------------------------ Task 2 types ------------------------------ */

/**
 * One atomic, ordered node of the Specification Subtask DAG.
 * Agent rotation is always researcher → architect(s) → verifier.
 */
export interface AtomicSubtaskNode {
  subtaskId: string;
  orderIndex: number;
  assignedAgent: 'researcher' | 'architect' | 'verifier';
  title: string;
  targetFiles: string[];
  targetSymbols: string[];
  explicitConstraints: string[];
  verificationCommand: string;
  dependsOnSubtaskIds: string[];
}

/**
 * Deterministic PRD contract compiled from a raw, unstructured user prompt.
 * Persisted in the `structured_specs` table (blueprint §7.2 table 12).
 */
export interface StructuredSpecContract {
  specId: string;
  sessionId: string;
  projectSlug: string;
  rawUserPrompt: string;
  normalizedGoal: string;
  detectedAmbiguities: string[];
  injectedImplicitConstraints: string[];
  schemaAndSignatureContracts: string[];
  subtaskDag: AtomicSubtaskNode[];
  acceptanceCriteria: string[];
  isOverloadedPromptSplit: boolean;
  estimatedReasoningComplexity: 'low' | 'medium' | 'high';
  createdAt: string;
}

/* ------------------------------ Task 3 types ------------------------------ */

/** A lazy "// ... rest of existing code ..." placeholder detected in generated output. */
export interface TruncationPlaceholderMatch {
  lineNumber: number;
  rawLine: string;
  recoveredSymbolNames: string[];
}

/**
 * Aggregate report of the Task 3 guardrail gates:
 * anti-truncation AST merger, import hallucination verifier,
 * version-skew scanner, and anti-sycophancy premise critic.
 * Persisted in the `guardrail_reports` table (blueprint §7.2 table 13).
 */
export interface GuardrailInspectionReport {
  guardId: string;
  sessionId: string;
  targetFilePath: string;
  passedAllGates: boolean;
  wasAutoHealed: boolean;
  healedContent: string;
  truncationMatches: TruncationPlaceholderMatch[];
  missingSymbolsRecovered: string[];
  hallucinatedImports: string[];
  versionSkewWarnings: string[];
  sycophancyWarnings: string[];
  createdAt: string;
}

/* ------------------------------ Task 4 types ------------------------------ */

/** A single Agent-Browser CDP action command in the verification loop. */
export interface AgentBrowserActionCommand {
  commandType: 'open' | 'snapshot' | 'click' | 'fill' | 'get_url' | 'close';
  targetRefOrUrl?: string; // e.g., "@e1" or "http://127.0.0.1:3000"
  inputValue?: string;
}

/**
 * Result of one Agent-Browser action execution.
 * Fails loudly if the target ref is hidden, disabled, offscreen, or covered,
 * wraps untrusted DOM text between CSPRNG nonce content boundaries, and
 * records the post-action DOM diff for the persistent daemon loop.
 */
export interface AgentBrowserActionExecutionResult {
  command: AgentBrowserActionCommand;
  success: boolean;
  loudFailureReason: string | null;
  postActionSnapshotId: string | null;
  domDiffFromPrevious: string | null;
  csprngBoundaryNonce: string;
  wrappedSafeOutput: string;
  executionLatencyMs: number;
}

/**
 * Aggregate runtime verification report for a staged artifact:
 * type-check gate, test gate, and the Agent-Browser CDP loop.
 * Persisted in the `runtime_verifications` table (blueprint §7.2 table 14).
 */
export interface RuntimeVerificationReport {
  verificationId: string;
  sessionId: string;
  artifactId: string;
  targetFilePath: string;
  typeCheckPassed: boolean;
  typeCheckDiagnostics: string[];
  testGatePassed: boolean;
  executedTestFiles: string[];
  testRunnerOutputCcrId: string | null;
  agentBrowserResults: AgentBrowserActionExecutionResult[];
  overallStatus: 'verified_ready_for_approval' | 'failed_verification';
  createdAt: string;
}

/* --------------------------- API request/response --------------------------- */

export interface StructureSpecRequest {
  sessionId: string;
  rawUserPrompt: string;
}

export interface StructureSpecResponse {
  spec: StructuredSpecContract;
  telemetry: import('./apexpad-types').DashboardTelemetrySnapshot;
}

/* ------------------------------ §7.6 pipeline ------------------------------ */

/** One candidate file edit entering the unified pipeline. */
export interface CandidateEdit {
  targetFilePath: string;
  previousContent: string;
  proposedContent: string;
}

/** Result of the unified 4-stage engineering pipeline (blueprint §7.6). */
export interface FullApexPipelineResult {
  specContract: StructuredSpecContract;
  guardrailReports: GuardrailInspectionReport[];
  dagState: import('./apexpad-types').DagExecutionState;
  verificationReports: RuntimeVerificationReport[];
}

export interface RunFullPipelineRequest {
  sessionId?: string;
  rawUserPrompt: string;
  tokenBudgetCeiling?: number;
  candidateEdits: CandidateEdit[];
  browserVerificationScript?: AgentBrowserActionCommand[];
}

export interface RunFullPipelineResponse {
  result: FullApexPipelineResult;
  telemetry: import('./apexpad-types').DashboardTelemetrySnapshot;
}

/* --------------------------- TASK 3 API contract --------------------------- */

export interface InspectGuardrailsRequest {
  sessionId: string;
  targetFilePath: string;
  previousContent: string;
  proposedContent: string;
  userPrompt: string;
}

export interface InspectGuardrailsResponse {
  report: GuardrailInspectionReport;
  telemetry: import('./apexpad-types').DashboardTelemetrySnapshot;
}

export interface GuardrailReportSummary {
  guardId: string;
  sessionId: string;
  targetFilePath: string;
  passedAllGates: boolean;
  wasAutoHealed: boolean;
  recoveredSymbolCount: number;
  hallucinatedImportCount: number;
  versionSkewCount: number;
  sycophancyCount: number;
  createdAt: string;
}

export interface GuardrailReportListResponse {
  reports: GuardrailReportSummary[];
}

/* --------------------------- TASK 4 API contract --------------------------- */

/** One interactive element of the live page accessibility registry. */
export interface LiveDomElement {
  role: string;
  name: string;
  tagName: string;
  isInteractive: boolean;
  isDisabled?: boolean;
  isVisibleInViewport?: boolean;
  /** Selector of an overlay covering this element -> click must fail LOUDLY. */
  coveredByOverlaySelector?: string | null;
  boundingBox?: { x: number; y: number; width: number; height: number };
  domPathSelector: string;
}

export interface SetLiveDomStateRequest {
  sessionId: string;
  url: string;
  elements: LiveDomElement[];
}

export interface SetLiveDomStateResponse {
  livePage: {
    sessionId: string;
    url: string;
    revision: number;
    elementCount: number;
    updatedAt: string;
  };
}

export interface ExecuteAgentBrowserCommandRequest {
  sessionId: string;
  command: AgentBrowserActionCommand;
}

export interface ExecuteAgentBrowserCommandResponse {
  result: AgentBrowserActionExecutionResult;
}

export interface BrowserSessionStateView {
  currentUrl: string | null;
  livePage: {
    sessionId: string;
    url: string;
    revision: number;
    elementCount: number;
    updatedAt: string;
  } | null;
  activeRefMap: {
    snapshotId: string;
    url: string;
    domRevision: number;
    createdAt: string;
    compactTextTree: string;
    refIds: string[];
  } | null;
  actionLog: string[];
}

export interface GetBrowserSessionStateResponse {
  state: BrowserSessionStateView;
}

export interface RunRuntimeVerificationRequest {
  sessionId: string;
  artifactId: string;
  browserVerificationScript?: AgentBrowserActionCommand[];
}

export interface RunRuntimeVerificationResponse {
  report: RuntimeVerificationReport;
  telemetry: import('./apexpad-types').DashboardTelemetrySnapshot;
}

export interface RuntimeVerificationListResponse {
  reports: RuntimeVerificationReport[];
}

/* ------------------------------ §7.7 E2E suite ------------------------------ */

export interface E2eAssertion {
  name: string;
  passed: boolean;
  evidence: string;
}

export interface E2eScenarioReport {
  scenarioId: string;
  title: string;
  passed: boolean;
  assertions: E2eAssertion[];
  durationMs: number;
}

export interface E2eSuiteRunReport {
  runId: string;
  projectSlug: string;
  startedAt: string;
  durationMs: number;
  scenarios: E2eScenarioReport[];
  allPassed: boolean;
}

export interface RunE2eSuiteResponse {
  run: E2eSuiteRunReport;
}
