/**
 * src/lib/apexpad-types.ts
 * ApexPad (APEX-EDITOR-V1) shared domain model & API contract types.
 * Client-safe: no server-only imports. Mirrors the blueprint domain model.
 */

export type MemoryScope = 'global' | 'repo' | 'branch' | 'session';

export type ObservationCategory =
  | 'decision'
  | 'bugfix'
  | 'arch_rule'
  | 'invariant'
  | 'tool_trace'
  | 'security_alert'
  | 'note_synthesis';

export type ContentPayloadType = 'json' | 'code' | 'prose' | 'log' | 'accessibility_tree';

export type EdgeHonestyLabel = 'exact' | 'heuristic_ambiguous' | 'markdown_backlink';

export interface SdkSession {
  sessionId: string;
  projectSlug: string;
  branchName: string;
  firstPrompt: string;
  promptCount: number;
  status: 'initialized' | 'active' | 'completed';
  startedAt: string;
  endedAt: string | null;
}

export interface ObservationRecord {
  id: string;
  sessionId: string;
  projectSlug: string;
  scope: MemoryScope;
  category: ObservationCategory;
  title: string;
  subtitle: string;
  narrative: string;
  factsJson: string[];
  referencedFiles: string[];
  referencedSymbols: string[];
  gitBlobHashes: Record<string, string>;
  confirmationCount: number;
  isStale: boolean;
  tokenEstimate: number;
  createdAt: string;
  updatedAt: string;
}

export interface SessionSummaryRecord {
  sessionId: string;
  projectSlug: string;
  requested: string;
  investigated: string;
  learned: string;
  completed: string;
  tokenCount: number;
  createdAt: string;
}

export interface ProjectDnaRule {
  id: string;
  projectSlug: string;
  category: 'architecture' | 'convention' | 'forbidden_pattern' | 'environment_fact';
  ruleKey: string;
  ruleStatement: string;
  sourceObservationIds: string[];
  confirmationSessions: number;
  enforcedInCi: boolean;
  layerDenyRule: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CCRCompressedBlock {
  ccrId: string;
  sessionId: string;
  sourceLabel: string;
  contentType: ContentPayloadType;
  originalBytes: string;
  compressedStub: string;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
  retrievalCount: number;
  valueScore: number;
  createdAt: string;
}

export interface AstSymbolNode {
  symbolId: string;
  projectSlug: string;
  filePath: string;
  symbolName: string;
  kind: 'function' | 'class' | 'interface' | 'method' | 'variable' | 'heading';
  signature: string;
  startLine: number;
  endLine: number;
  cyclomaticComplexity: number;
  gitChurn30d: number;
  hasTestCoverage: boolean;
  pageRankScore: number;
  fileSha256: string;
  updatedAt: string;
}

export interface AstDependencyEdge {
  edgeId: string;
  projectSlug: string;
  callerSymbolId: string;
  calleeSymbolId: string;
  callerFile: string;
  calleeFile: string;
  honestyLabel: EdgeHonestyLabel;
  weight: number;
}

export interface BlastRadiusReport {
  targetSymbols: string[];
  directCallers: AstSymbolNode[];
  transitiveCallers: AstSymbolNode[];
  affectedFiles: string[];
  requiredTests: string[];
  contractChangesDetected: string[];
  architectureViolations: string[];
  cyclomaticDelta: number;
  propagationCost: number;
  honestyFloorDisclosed: boolean;
}

export interface AgentBrowserElementRef {
  refId: string;
  role: string;
  name: string;
  tagName: string;
  isInteractive: boolean;
  isDisabled: boolean;
  isVisibleInViewport: boolean;
  boundingBox: { x: number; y: number; width: number; height: number };
  domPathSelector: string;
}

export interface AgentBrowserSnapshot {
  snapshotId: string;
  sessionId: string;
  url: string;
  domHash: string;
  compactTextTree: string;
  refMap: Record<string, AgentBrowserElementRef>;
  diffFromPrevious: string | null;
  createdAt: string;
}

export interface StagedArtifact {
  artifactId: string;
  sessionId: string;
  agentRole: 'planner' | 'researcher' | 'architect';
  targetFilePath: string;
  proposedContent: string;
  unifiedDiff: string;
  blastRadius: BlastRadiusReport;
  status: 'staged' | 'approved' | 'rejected';
  createdAt: string;
}

export interface PackedContextEnvelope {
  frozenPrefix: string;
  frozenPrefixHash: string;
  liveZoneXml: string;
  estimatedTotalTokens: number;
  tokenBudgetCeiling: number;
  byteCeiling: number;
  includedObservationIds: string[];
  includedSymbolIds: string[];
  includedCcrIds: string[];
  truncationDisclosures: string[];
}

export interface MemorySearchIndexHit {
  id: string;
  scope: MemoryScope;
  category: ObservationCategory;
  title: string;
  subtitle: string;
  isStale: boolean;
  tokenEstimate: number;
  createdAt: string;
  bm25Score: number;
}

export interface MemoryTimelineEntry {
  anchorObservation: MemorySearchIndexHit;
  precedingObservations: MemorySearchIndexHit[];
  succeedingObservations: MemorySearchIndexHit[];
  sessionPromptContext: string;
}

export interface DashboardTelemetrySnapshot {
  projectSlug: string;
  totalSessions: number;
  totalObservations: number;
  staleObservationsCount: number;
  confirmedDnaRulesCount: number;
  ccrBlocksStored: number;
  totalOriginalTokensCrushed: number;
  totalCompressedTokensShipped: number;
  netTokenSavingsPct: number;
  totalCcrRetrievals: number;
  averageToinValueScore: number;
  indexedAstSymbolsCount: number;
  indexedAstEdgesCount: number;
}

export interface DagExecutionState {
  runId: string;
  sessionId: string;
  projectSlug: string;
  userGoal: string;
  currentNode: string;
  contextEnvelope: PackedContextEnvelope;
  plannerSubtasks: string[];
  researchFindings: string[];
  stagedArtifacts: StagedArtifact[];
  status: 'running' | 'awaiting_human_approval' | 'completed' | 'halted_on_violation';
}

export interface CcrRetrievalResult {
  ccrId: string;
  sourceLabel: string;
  contentType: ContentPayloadType;
  uncompressedSlice: string;
  retrievalCount: number;
  updatedValueScore: number;
}

export interface ModelToolCallResult {
  toolName: string;
  outputJson: string;
  tokensConsumed: number;
}

export type CaptureEventType =
  | 'hook:session_start'
  | 'hook:user_prompt'
  | 'hook:post_tool_use'
  | 'hook:session_end'
  | 'fs:file_indexed'
  | 'fs:file_rekeyed'
  | 'spec:structured'
  | 'agent:turn_complete'
  | 'dag:staged'
  | 'artifact:resolved'
  | 'guardrail:report'
  | 'verify:report'
  | 'pipeline:complete'
  | 'browser:command'
  | 'e2e:suite';

export interface UnattendedCaptureEvent {
  eventType: CaptureEventType;
  timestamp: string;
  sessionId: string;
  projectSlug: string;
  payload: Record<string, unknown>;
}

/* ---------------- API REQUEST / RESPONSE CONTRACTS ---------------- */

export interface InitWorkbenchRequest {
  sessionId: string;
  activeFilePath: string;
  initialContent: string;
}

export interface InitWorkbenchResponse {
  session: SdkSession;
  dnaRules: ProjectDnaRule[];
  symbols: AstSymbolNode[];
  memoryIndexHits: MemorySearchIndexHit[];
  contextEnvelope: PackedContextEnvelope;
  telemetry: DashboardTelemetrySnapshot;
  recentSummaries: SessionSummaryRecord[];
  stagedArtifacts: StagedArtifact[];
}

export interface IndexFileRequest {
  sessionId: string;
  filePath: string;
  content: string;
  taskPrompt: string;
}

export interface IndexFileResponse {
  symbols: AstSymbolNode[];
  memoryIndexHits: MemorySearchIndexHit[];
  contextEnvelope: PackedContextEnvelope;
  telemetry: DashboardTelemetrySnapshot;
}

export interface StageDagRequest {
  sessionId: string;
  userGoal: string;
  targetFilePath: string;
  previousContent: string;
  proposedContent: string;
}

export type StageDagResponse = DagExecutionState;

export interface ResolveApprovalRequest {
  artifactId: string;
  approved: boolean;
  reviewerNote?: string;
}

export interface ResolveApprovalResponse {
  resolved: StagedArtifact;
  symbols: AstSymbolNode[];
  memoryIndexHits: MemorySearchIndexHit[];
  telemetry: DashboardTelemetrySnapshot;
}

export interface RetrieveCcrRequest {
  ccrId: string;
  lineStart?: number;
  lineEnd?: number;
}

export interface ExecuteToolRequest {
  toolName:
    | 'search_memory'
    | 'get_memory_timeline'
    | 'get_observations'
    | 'headroom_retrieve'
    | 'ripwire_blast_radius';
  arguments: Record<string, unknown>;
}

export interface AgentTurnRequest {
  sessionId: string;
  userPrompt: string;
  activeFilePath: string;
  editorContent: string;
  tokenBudgetCeiling?: number;
}

export interface AgentTurnResponse {
  cleanedResponse: string;
  storedInlineObservations: ObservationRecord[];
  executedToolCalls: ModelToolCallResult[];
  contextEnvelope: PackedContextEnvelope;
  llmMode: 'sdk' | 'deterministic';
  memoryIndexHits: MemorySearchIndexHit[];
  telemetry: DashboardTelemetrySnapshot;
}

export interface HookPostToolUseRequest {
  sessionId?: string;
  projectSlug?: string;
  toolName: string;
  title?: string;
  toolOutput: string;
  referencedFiles?: string[];
  referencedSymbols?: string[];
  category?: ObservationCategory;
  scope?: MemoryScope;
}

export interface TimelineResponse {
  timeline: MemoryTimelineEntry | null;
}
