'use client'

/**
 * src/app/page.tsx — ApexPad Workbench (APEX-EDITOR-V1)
 * Single-route AI notepad / codebase workbench with a Tier-1 Context &
 * Memory engine. All data flows through the /api/apexpad contract.
 */
import * as React from 'react'
import { Loader2, Zap } from 'lucide-react'

import type {
  AgentTurnResponse,
  AstSymbolNode,
  DagExecutionState,
  DashboardTelemetrySnapshot,
  MemorySearchIndexHit,
  MemoryTimelineEntry,
  ObservationRecord,
  PackedContextEnvelope,
  ProjectDnaRule,
  SdkSession,
  StagedArtifact,
  UnattendedCaptureEvent,
} from '@/lib/apexpad-types'
import type { StructuredSpecContract } from '@/lib/apexpad-guardrails-types'
import { apexpadApi } from '@/lib/apexpad-client'
import { useApexpadSse } from '@/hooks/use-apexpad-sse'
import { useToast } from '@/hooks/use-toast'

import { WorkbenchHeader } from '@/components/apexpad/header'
import { LeftPane, type LeftPaneTab } from '@/components/apexpad/left-pane'
import { CenterPane } from '@/components/apexpad/center-pane'
import { RightPane, type RightPaneTab } from '@/components/apexpad/right-pane'
import { CcrDialog, ObservationFullRecordDialog } from '@/components/apexpad/dialogs'
import {
  APEXPAD_ACTIVE_FILE,
  APEXPAD_INDEX_TASK_PROMPT,
  DEFAULT_NOTE_CONTENT,
  EDITOR_DEBOUNCE_MS,
} from '@/components/apexpad/constants'
import { TOAST_DARK } from '@/components/apexpad/ui-kit'

const MAX_EVENTS = 50

export default function Home() {
  const { toast } = useToast()

  /* ------------------------------- state ------------------------------- */

  const sessionId = React.useMemo(() => `sess_${Date.now().toString(36)}`, [])

  const [booting, setBooting] = React.useState(true)
  const [session, setSession] = React.useState<SdkSession | null>(null)
  const [dnaRules, setDnaRules] = React.useState<ProjectDnaRule[]>([])
  const [symbols, setSymbols] = React.useState<AstSymbolNode[]>([])
  const [memoryIndexHits, setMemoryIndexHits] = React.useState<MemorySearchIndexHit[]>([])
  const [envelope, setEnvelope] = React.useState<PackedContextEnvelope | null>(null)
  const [telemetry, setTelemetry] = React.useState<DashboardTelemetrySnapshot | null>(null)
  const [stagedArtifacts, setStagedArtifacts] = React.useState<StagedArtifact[]>([])
  const [dagState, setDagState] = React.useState<DagExecutionState | null>(null)
  const [spec, setSpec] = React.useState<StructuredSpecContract | null>(null)
  const [events, setEvents] = React.useState<UnattendedCaptureEvent[]>([])

  const [editorContent, setEditorContent] = React.useState<string>(DEFAULT_NOTE_CONTENT)
  const [lastSavedContent, setLastSavedContent] = React.useState<string>(DEFAULT_NOTE_CONTENT)
  const [indexing, setIndexing] = React.useState(false)

  const [agentLoading, setAgentLoading] = React.useState(false)
  const [agentResult, setAgentResult] = React.useState<AgentTurnResponse | null>(null)

  const [leftTab, setLeftTab] = React.useState<LeftPaneTab>('outline')
  const [rightTab, setRightTab] = React.useState<RightPaneTab>('dag')

  const [busyArtifactId, setBusyArtifactId] = React.useState<string | null>(null)

  const [ccrDialogOpen, setCcrDialogOpen] = React.useState(false)
  const [ccrDialogId, setCcrDialogId] = React.useState<string | null>(null)

  const [memoryDrill, setMemoryDrill] = React.useState<{
    hit: MemorySearchIndexHit
    timeline: MemoryTimelineEntry
  } | null>(null)
  const [timelineLoading, setTimelineLoading] = React.useState(false)
  const [fullRecordLoading, setFullRecordLoading] = React.useState(false)
  const [fullRecordsOpen, setFullRecordsOpen] = React.useState(false)
  const [fullRecords, setFullRecords] = React.useState<ObservationRecord[]>([])

  const [scrollTarget, setScrollTarget] = React.useState<{ line: number; nonce: number } | null>(
    null,
  )
  const jumpNonceRef = React.useRef(0)
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null)
  const lastIndexedRef = React.useRef<string | null>(null)
  const indexNonceRef = React.useRef(0)

  /* ------------------------------ helpers ------------------------------ */

  const fail = React.useCallback(
    (err: unknown) => {
      toast({
        title: 'Request failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
        ...TOAST_DARK,
      })
    },
    [toast],
  )

  const refreshTelemetry = React.useCallback(async () => {
    try {
      setTelemetry(await apexpadApi.telemetry())
    } catch (err) {
      fail(err)
    }
  }, [fail])

  /* ------------------------------ SSE feed ------------------------------ */

  const sseConnected = useApexpadSse(
    React.useCallback((event: UnattendedCaptureEvent) => {
      setEvents((prev) => [event, ...prev].slice(0, MAX_EVENTS))
    }, []),
  )

  /* --------------------------- boot: init call --------------------------- */

  React.useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await apexpadApi.init({
          sessionId,
          activeFilePath: APEXPAD_ACTIVE_FILE,
          initialContent: DEFAULT_NOTE_CONTENT,
        })
        if (cancelled) return
        setSession(res.session)
        setDnaRules(res.dnaRules)
        setSymbols(res.symbols)
        setMemoryIndexHits(res.memoryIndexHits)
        setEnvelope(res.contextEnvelope)
        setTelemetry(res.telemetry)
        setStagedArtifacts(res.stagedArtifacts)
        lastIndexedRef.current = DEFAULT_NOTE_CONTENT
      } catch (err) {
        if (!cancelled) fail(err)
      } finally {
        if (!cancelled) setBooting(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [sessionId, fail])

  /* ---------------------- debounced live file indexing -------------------- */

  React.useEffect(() => {
    if (editorContent === lastIndexedRef.current) return
    const timer = setTimeout(async () => {
      const nonce = ++indexNonceRef.current
      setIndexing(true)
      try {
        const res = await apexpadApi.indexFile({
          sessionId,
          filePath: APEXPAD_ACTIVE_FILE,
          content: editorContent,
          taskPrompt: APEXPAD_INDEX_TASK_PROMPT,
        })
        if (nonce !== indexNonceRef.current) return
        setSymbols(res.symbols)
        setMemoryIndexHits(res.memoryIndexHits)
        setEnvelope(res.contextEnvelope)
        setTelemetry(res.telemetry)
        lastIndexedRef.current = editorContent
      } catch (err) {
        if (nonce === indexNonceRef.current) fail(err)
      } finally {
        if (nonce === indexNonceRef.current) setIndexing(false)
      }
    }, EDITOR_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [editorContent, sessionId, fail])

  /* ------------------------------- actions ------------------------------- */

  const runAgentTurn = React.useCallback(
    async (prompt: string) => {
      setAgentLoading(true)
      try {
        // PIPELINE ORDER (Slice 1 blueprint §6.1): raw prompt → TASK 2 structurer →
        // TASK 1 context pack + planner + agents. The spec contract is compiled first,
        // then the normalized goal drives the contextual agent turn.
        let effectivePrompt = prompt
        try {
          const structured = await apexpadApi.structureSpec({ sessionId, rawUserPrompt: prompt })
          setSpec(structured.spec)
          setTelemetry(structured.telemetry)
          setRightTab('spec')
          effectivePrompt = structured.spec.normalizedGoal
          toast({
            title: 'Spec contract compiled',
            description: `${structured.spec.specId} • ${structured.spec.subtaskDag.length} subtasks • complexity: ${structured.spec.estimatedReasoningComplexity}${structured.spec.isOverloadedPromptSplit ? ' • overloaded prompt split' : ''}`,
            ...TOAST_DARK,
          })
        } catch (specErr) {
          // Non-fatal: the raw prompt still flows through the Task 1 pipeline.
          fail(specErr)
        }

        const res = await apexpadApi.agentTurn({
          sessionId,
          userPrompt: effectivePrompt,
          activeFilePath: APEXPAD_ACTIVE_FILE,
          editorContent,
          ...(envelope ? { tokenBudgetCeiling: envelope.tokenBudgetCeiling } : {}),
        })
        setAgentResult(res)
        setEnvelope(res.contextEnvelope)
        setMemoryIndexHits(res.memoryIndexHits)
        setTelemetry(res.telemetry)
        toast({
          title: 'Agent turn complete',
          description: `${res.llmMode === 'sdk' ? 'Z.ai SDK' : 'Offline Synthesizer'} • ${res.executedToolCalls.length} tool calls • ${res.storedInlineObservations.length} obs stored`,
          ...TOAST_DARK,
        })
      } catch (err) {
        fail(err)
      } finally {
        setAgentLoading(false)
      }
    },
    [sessionId, editorContent, envelope, fail, toast],
  )

  const stageDag = React.useCallback(
    async (userGoal: string): Promise<boolean> => {
      try {
        const res = await apexpadApi.stageDag({
          sessionId,
          userGoal,
          targetFilePath: APEXPAD_ACTIVE_FILE,
          previousContent: lastSavedContent,
          proposedContent: editorContent,
        })
        setDagState(res)
        setEnvelope(res.contextEnvelope)
        setStagedArtifacts((prev) => {
          const byId = new Map(prev.map((a) => [a.artifactId, a]))
          for (const artifact of res.stagedArtifacts) byId.set(artifact.artifactId, artifact)
          return Array.from(byId.values()).sort((a, b) =>
            a.createdAt < b.createdAt ? 1 : -1,
          )
        })
        void refreshTelemetry()
        setRightTab('staging')
        toast({
          title: 'DAG run staged',
          description: `${res.runId.slice(0, 10)} staged ${res.stagedArtifacts.length} artifact(s) — status: ${res.status}`,
          ...TOAST_DARK,
        })
        return true
      } catch (err) {
        fail(err)
        return false
      }
    },
    [sessionId, lastSavedContent, editorContent, refreshTelemetry, fail, toast],
  )

  const resolveApproval = React.useCallback(
    async (artifactId: string, approved: boolean): Promise<boolean> => {
      setBusyArtifactId(artifactId)
      try {
        const res = await apexpadApi.resolveApproval({ artifactId, approved })
        setStagedArtifacts((prev) =>
          prev.map((a) => (a.artifactId === artifactId ? res.resolved : a)),
        )
        setSymbols(res.symbols)
        setMemoryIndexHits(res.memoryIndexHits)
        setTelemetry(res.telemetry)
        if (approved) {
          setEditorContent(res.resolved.proposedContent)
          setLastSavedContent(res.resolved.proposedContent)
          lastIndexedRef.current = res.resolved.proposedContent
        }
        toast({
          title: approved ? 'Artifact approved & committed' : 'Artifact rejected',
          description: `${res.resolved.targetFilePath} — approval gate updated.`,
          ...TOAST_DARK,
        })
        return true
      } catch (err) {
        fail(err)
        return false
      } finally {
        setBusyArtifactId(null)
      }
    },
    [fail, toast],
  )

  const sendHook = React.useCallback(
    async (toolName: string, toolOutput: string) => {
      try {
        const res = await apexpadApi.hookPostToolUse({
          sessionId,
          toolName,
          toolOutput,
          referencedFiles: [APEXPAD_ACTIVE_FILE],
        })
        toast({
          title: `CCR ${res.ccrBlock.ccrId}`,
          description: `${res.ccrBlock.originalTokens} → ${res.ccrBlock.compressedTokens} tok (${res.ccrBlock.compressionRatio.toFixed(2)}× ratio)`,
          ...TOAST_DARK,
        })
        void refreshTelemetry()
      } catch (err) {
        fail(err)
      }
    },
    [sessionId, refreshTelemetry, fail, toast],
  )

  /* ---------------------- memory progressive disclosure ------------------- */

  const searchMemory = React.useCallback(
    async (query: string): Promise<MemorySearchIndexHit[] | null> => {
      try {
        const res = await apexpadApi.memorySearch(query, 20)
        return res.hits
      } catch (err) {
        fail(err)
        return null
      }
    },
    [fail],
  )

  const handleHitClick = React.useCallback(
    async (hit: MemorySearchIndexHit) => {
      setTimelineLoading(true)
      try {
        const res = await apexpadApi.memoryTimeline(hit.id)
        if (!res.timeline) {
          toast({
            title: 'No timeline available',
            description: `Observation ${hit.id} has no surrounding window in memory.`,
            ...TOAST_DARK,
          })
          return
        }
        setMemoryDrill({ hit, timeline: res.timeline })
      } catch (err) {
        fail(err)
      } finally {
        setTimelineLoading(false)
      }
    },
    [fail, toast],
  )

  const handleLoadFullRecord = React.useCallback(async () => {
    if (!memoryDrill) return
    const timeline = memoryDrill.timeline
    const ids = Array.from(
      new Set([
        timeline.anchorObservation.id,
        ...timeline.precedingObservations.map((o) => o.id),
        ...timeline.succeedingObservations.map((o) => o.id),
      ]),
    )
    setFullRecordLoading(true)
    try {
      const res = await apexpadApi.memoryObservations(ids)
      setFullRecords(res.observations)
      setFullRecordsOpen(true)
    } catch (err) {
      fail(err)
    } finally {
      setFullRecordLoading(false)
    }
  }, [memoryDrill, fail])

  /* ----------------------------- misc actions ---------------------------- */

  const openCcr = React.useCallback((ccrId: string) => {
    setCcrDialogId(ccrId)
    setCcrDialogOpen(true)
  }, [])

  const jumpToLine = React.useCallback((line: number) => {
    jumpNonceRef.current += 1
    setScrollTarget({ line, nonce: jumpNonceRef.current })
  }, [])

  /* -------------------------------- render ------------------------------- */

  if (booting) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#0d1117] text-[#e6edf3]">
        <div className="flex h-10 w-10 items-center justify-center rounded-md border border-[#30363d] bg-[#161b22]">
          <Zap className="h-5 w-5 text-[#58a6ff]" />
        </div>
        <div className="flex items-center gap-2 font-mono text-xs text-[#8b949e]">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#58a6ff]" />
          Initializing workbench — DNA vault · AST index · CCR store…
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0d1117] text-[#e6edf3] lg:h-screen lg:overflow-hidden">
      <WorkbenchHeader
        telemetry={telemetry}
        session={session}
        sseConnected={sseConnected}
        booting={booting}
      />

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-[300px_minmax(0,1fr)_400px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
        <LeftPane
          symbols={symbols}
          activeFilePath={APEXPAD_ACTIVE_FILE}
          dnaRules={dnaRules}
          memoryIndexHits={memoryIndexHits}
          drill={memoryDrill}
          timelineLoading={timelineLoading}
          fullRecordLoading={fullRecordLoading}
          fullRecordsOpen={fullRecordsOpen}
          tab={leftTab}
          onTabChange={setLeftTab}
          onJumpToLine={jumpToLine}
          onSearchMemory={searchMemory}
          onHitClick={handleHitClick}
          onBackFromTimeline={() => setMemoryDrill(null)}
          onLoadFullRecord={() => void handleLoadFullRecord()}
        />

        <CenterPane
          activeFilePath={APEXPAD_ACTIVE_FILE}
          editorContent={editorContent}
          onEditorChange={setEditorContent}
          indexing={indexing}
          textareaRef={textareaRef}
          scrollTarget={scrollTarget}
          symbols={symbols}
          agentLoading={agentLoading}
          agentResult={agentResult}
          onRunAgent={(prompt) => void runAgentTurn(prompt)}
          onStageDag={stageDag}
          onSendHook={sendHook}
        />

        <RightPane
          envelope={envelope}
          dagState={dagState}
          stagedArtifacts={stagedArtifacts}
          events={events}
          spec={spec}
          sessionId={sessionId}
          tab={rightTab}
          onTabChange={setRightTab}
          onReInflateCcr={openCcr}
          onResolveApproval={resolveApproval}
          busyArtifactId={busyArtifactId}
          onRefreshTelemetry={() => void refreshTelemetry()}
        />
      </main>

      {/* dialogs */}
      <CcrDialog
        open={ccrDialogOpen}
        ccrId={ccrDialogId}
        onClose={() => setCcrDialogOpen(false)}
      />
      <ObservationFullRecordDialog
        open={fullRecordsOpen}
        records={fullRecords}
        loading={fullRecordLoading}
        onClose={() => setFullRecordsOpen(false)}
      />
    </div>
  )
}
