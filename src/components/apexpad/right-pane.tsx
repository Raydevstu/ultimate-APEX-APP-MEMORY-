'use client'

/**
 * src/components/apexpad/right-pane.tsx
 * DAG Control Plane + SSE event feed + Context Pack + Staging approval gate.
 */
import * as React from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  ArrowDown,
  Bot,
  CheckCircle2,
  FileCode,
  FileDiff,
  FileText,
  GitBranch,
  Layers,
  Loader2,
  MessageSquare,
  Network,
  PackageCheck,
  Play,
  RefreshCw,
  Route,
  ScrollText,
  ShieldCheck,
  Square,
  TriangleAlert,
  Wrench,
} from 'lucide-react'

import type {
  AtomicSubtaskNode,
  StructuredSpecContract,
} from '@/lib/apexpad-guardrails-types'
import type {
  CaptureEventType,
  DagExecutionState,
  PackedContextEnvelope,
  StagedArtifact,
  UnattendedCaptureEvent,
} from '@/lib/apexpad-types'
import { cn } from '@/lib/utils'
import { formatRelativeTime, truncate } from '@/lib/apexpad-client'
import { VerificationPanel } from '@/components/apexpad/verification-panel'
import {
  BTN_DANGER,
  BTN_PRIMARY,
  BTN_SECONDARY,
  Chip,
  CopyButton,
  DiffView,
  FadeIn,
  Panel,
  SlideInItem,
  THIN_SCROLL,
  TinyLabel,
} from './ui-kit'
import { FrozenPrefixDialog } from './dialogs'

/* ------------------------------ event feed ------------------------------- */

const EVENT_ICON: Record<CaptureEventType, { icon: React.ReactNode; color: string }> = {
  'hook:session_start': { icon: <Play className="h-3 w-3" />, color: 'text-[#3fb950]' },
  'hook:user_prompt': { icon: <MessageSquare className="h-3 w-3" />, color: 'text-[#58a6ff]' },
  'hook:post_tool_use': { icon: <Wrench className="h-3 w-3" />, color: 'text-[#d29922]' },
  'hook:session_end': { icon: <Square className="h-3 w-3" />, color: 'text-[#f85149]' },
  'fs:file_indexed': { icon: <FileCode className="h-3 w-3" />, color: 'text-[#79c0ff]' },
  'fs:file_rekeyed': { icon: <RefreshCw className="h-3 w-3" />, color: 'text-[#d2a8ff]' },
  'spec:structured': { icon: <ScrollText className="h-3 w-3" />, color: 'text-[#79c0ff]' },
  'agent:turn_complete': { icon: <Bot className="h-3 w-3" />, color: 'text-[#7ee787]' },
  'dag:staged': { icon: <GitBranch className="h-3 w-3" />, color: 'text-[#d2a8ff]' },
  'artifact:resolved': { icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-[#3fb950]' },
}

function EventFeed({ events }: { events: UnattendedCaptureEvent[] }) {
  const [, setTick] = React.useState(0)

  // Re-render periodically so relative timestamps stay fresh.
  React.useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 15000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div>
      <TinyLabel className="mb-1.5">Live Event Feed (SSE)</TinyLabel>
      <div
        className={cn(
          'max-h-64 space-y-1 overflow-y-auto rounded-md border border-[#30363d] bg-[#0d1117] p-1.5',
          THIN_SCROLL,
        )}
      >
        {events.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-[#8b949e]">
            Listening for capture events…
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((event, i) => {
              const meta = EVENT_ICON[event.eventType] ?? {
                icon: <Wrench className="h-3 w-3" />,
                color: 'text-[#8b949e]',
              }
              return (
                <SlideInItem
                  key={`${event.timestamp}-${event.eventType}-${i}`}
                  className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-[#161b22]"
                >
                  <span className={cn('mt-0.5 shrink-0', meta.color)}>
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn('font-mono text-[10px] font-semibold', meta.color)}>
                        {event.eventType}
                      </span>
                      <span className="shrink-0 font-mono text-[9px] text-[#8b949e]">
                        {formatRelativeTime(event.timestamp)}
                      </span>
                    </div>
                    <p className="break-all font-mono text-[9px] leading-relaxed text-[#8b949e]">
                      {truncate(JSON.stringify(event.payload ?? {}), 120)}
                    </p>
                  </div>
                </SlideInItem>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ DAG pipeline ------------------------------ */

function DagNode({
  title,
  titleColor,
  icon,
  children,
  highlight,
}: {
  title: string
  titleColor: string
  icon: React.ReactNode
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <>
      <Panel
        className={cn(
          'p-3 transition-colors',
          highlight && 'border-[#d29922]/70 bg-[#d29922]/5 shadow-[0_0_16px_rgba(210,153,34,0.08)]',
        )}
      >
        <div className="flex items-center gap-1.5">
          <span className={titleColor}>{icon}</span>
          <span className={cn('text-[11px] font-bold uppercase tracking-wide', titleColor)}>
            {title}
          </span>
        </div>
        <div className="mt-2">{children}</div>
      </Panel>
      <div className="mx-auto h-2.5 w-px bg-[#30363d]" aria-hidden />
    </>
  )
}

function DagTab({
  envelope,
  dagState,
  stagedArtifacts,
  events,
  onReInflateCcr,
}: {
  envelope: PackedContextEnvelope | null
  dagState: DagExecutionState | null
  stagedArtifacts: StagedArtifact[]
  events: UnattendedCaptureEvent[]
  onReInflateCcr: (ccrId: string) => void
}) {
  const stagedCount = stagedArtifacts.filter((a) => a.status === 'staged').length

  return (
    <div className="space-y-3">
      <TinyLabel>DAG Control Plane</TinyLabel>

      <DagNode
        title="1. Project DNA + MEM0 Router"
        titleColor="text-[#7ee787]"
        icon={<Route className="h-3.5 w-3.5" />}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-[#8b949e]">Frozen Prefix Hash:</span>
          <code className="rounded border border-[#30363d] bg-[#0d1117] px-1.5 py-0.5 font-mono text-[10px] text-[#7ee787]">
            {envelope ? envelope.frozenPrefixHash.slice(0, 12) : '—'}
          </code>
          <span className="font-mono text-[9px] text-[#8b949e]">(KV-Cache Aligned)</span>
        </div>
      </DagNode>

      <DagNode
        title="2. Context Pack (U-Curve + CCR)"
        titleColor="text-[#79c0ff]"
        icon={<PackageCheck className="h-3.5 w-3.5" />}
      >
        <div className="font-mono text-[10px] text-[#8b949e]">
          Tokens:{' '}
          <span className="text-[#e6edf3]">
            {envelope?.estimatedTotalTokens ?? '—'} / {envelope?.tokenBudgetCeiling ?? '—'}
          </span>{' '}
          • Byte Ceiling:{' '}
          <span className="text-[#e6edf3]">{envelope?.byteCeiling ?? '—'} B</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(envelope?.includedCcrIds ?? []).map((ccrId) => (
            <button
              key={ccrId}
              type="button"
              onClick={() => onReInflateCcr(ccrId)}
              className="rounded border border-[#79c0ff]/40 bg-[#79c0ff]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#79c0ff] hover:bg-[#79c0ff]/20"
            >
              Re-inflate {ccrId}
            </button>
          ))}
          {(envelope?.includedCcrIds ?? []).length === 0 ? (
            <span className="text-[10px] text-[#8b949e]">no CCR stubs in pack</span>
          ) : null}
        </div>
      </DagNode>

      <DagNode
        title="3. Planner (CrewAI) → DAG Engine (LangGraph)"
        titleColor="text-[#d2a8ff]"
        icon={<Network className="h-3.5 w-3.5" />}
        highlight={dagState?.status === 'running'}
      >
        <div className="font-mono text-[10px] text-[#8b949e]">
          Research Agent (
          <span className="text-[#e6edf3]">{envelope?.includedObservationIds.length ?? 0}</span>{' '}
          obs) ⇄ Architect Agent (
          <span className="text-[#e6edf3]">{envelope?.includedSymbolIds.length ?? 0}</span> AST
          nodes)
        </div>
        {dagState ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip className="font-mono">run: {dagState.runId.slice(0, 10)}</Chip>
            <Chip className="text-[#c9d1d9]">{dagState.currentNode}</Chip>
            <Chip title={dagState.userGoal} className="max-w-full text-[#d2a8ff]">
              goal: {truncate(dagState.userGoal, 40)}
            </Chip>
          </div>
        ) : null}
      </DagNode>

      <DagNode
        title="4. Artifact Staging → Human Approval"
        titleColor="text-[#e6edf3]"
        icon={<ShieldCheck className="h-3.5 w-3.5" />}
        highlight={stagedCount > 0 || dagState?.status === 'awaiting_human_approval'}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip>
            <Layers className="h-2.5 w-2.5" />
            {stagedCount} staged / {stagedArtifacts.length} total
          </Chip>
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase',
              stagedCount > 0
                ? 'border-[#d29922]/50 bg-[#d29922]/15 text-[#d29922]'
                : 'border-[#3fb950]/40 bg-[#3fb950]/10 text-[#3fb950]',
            )}
          >
            {stagedCount > 0 ? 'awaiting human approval' : 'gate clear'}
          </span>
        </div>
      </DagNode>

      <EventFeed events={events} />
    </div>
  )
}

/* ------------------------------ context pack ------------------------------ */

function ContextPackTab({ envelope }: { envelope: PackedContextEnvelope | null }) {
  const [prefixOpen, setPrefixOpen] = React.useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <TinyLabel>Live U-Curve Packed XML Payload</TinyLabel>
        <CopyButton text={envelope?.liveZoneXml ?? ''} label="Copy XML" />
      </div>

      <pre
        className={cn(
          'max-h-[420px] overflow-auto whitespace-pre-wrap rounded-md border border-[#30363d] bg-[#0d1117] p-3 font-mono text-[10px] leading-relaxed text-[#a5d6ff]',
          THIN_SCROLL,
        )}
      >
        {envelope?.liveZoneXml || 'Context pack will stream here once the workbench initializes.'}
      </pre>

      {envelope && envelope.truncationDisclosures.length > 0 ? (
        <div className="space-y-1.5">
          {envelope.truncationDisclosures.map((disclosure, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-md border border-[#d29922]/40 bg-[#d29922]/10 px-2 py-1.5 text-[10px] text-[#d29922]"
            >
              <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{disclosure}</span>
            </div>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setPrefixOpen(true)}
        className={cn(
          'inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium lg:min-h-0',
          BTN_SECONDARY,
        )}
      >
        <FileDiff className="h-3.5 w-3.5" />
        View Frozen Prefix
      </button>

      <FrozenPrefixDialog
        open={prefixOpen}
        onOpenChange={setPrefixOpen}
        frozenPrefix={envelope?.frozenPrefix ?? null}
        frozenPrefixHash={envelope?.frozenPrefixHash ?? null}
      />
    </div>
  )
}

/* --------------------------- spec contract (Task 2) --------------------------- */

const AGENT_ROLE_STYLE: Record<AtomicSubtaskNode['assignedAgent'], string> = {
  researcher: 'border-[#3fb950]/50 bg-[#3fb950]/15 text-[#3fb950]',
  architect: 'border-[#d2a8ff]/50 bg-[#d2a8ff]/15 text-[#d2a8ff]',
  verifier: 'border-[#d29922]/50 bg-[#d29922]/15 text-[#d29922]',
}

const COMPLEXITY_STYLE: Record<StructuredSpecContract['estimatedReasoningComplexity'], string> = {
  low: 'border-[#3fb950]/50 bg-[#3fb950]/15 text-[#3fb950]',
  medium: 'border-[#d29922]/50 bg-[#d29922]/15 text-[#d29922]',
  high: 'border-[#f85149]/50 bg-[#f85149]/15 text-[#f85149]',
}

function SubtaskNodeCard({ subtask }: { subtask: AtomicSubtaskNode }) {
  return (
    <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[10px] font-bold text-[#e6edf3]">
            #{subtask.orderIndex}
          </span>
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase',
              AGENT_ROLE_STYLE[subtask.assignedAgent],
            )}
          >
            {subtask.assignedAgent}
          </span>
        </div>
        <code className="rounded border border-[#30363d] bg-[#161b22] px-1.5 py-0.5 font-mono text-[9px] text-[#8b949e]">
          {subtask.verificationCommand}
        </code>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-[#c9d1d9]">{subtask.title}</p>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {subtask.targetFiles.map((file) => (
          <Chip key={file} className="font-mono text-[#79c0ff]">
            <FileText className="h-2.5 w-2.5" />
            {truncate(file, 34)}
          </Chip>
        ))}
        {subtask.targetSymbols.slice(0, 4).map((symbol) => (
          <Chip key={symbol} className="font-mono text-[#7ee787]">
            {symbol}
          </Chip>
        ))}
      </div>

      {subtask.explicitConstraints.length > 0 ? (
        <p className="mt-1.5 font-mono text-[9px] text-[#8b949e]">
          {subtask.explicitConstraints.length} explicit constraint(s) attached
        </p>
      ) : null}

      {subtask.dependsOnSubtaskIds.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="font-mono text-[9px] text-[#8b949e]">depends on:</span>
          {subtask.dependsOnSubtaskIds.map((dep) => (
            <code
              key={dep}
              className="rounded border border-[#30363d] bg-[#161b22] px-1 py-0.5 font-mono text-[9px] text-[#d2a8ff]"
            >
              {dep.split('_sub_')[1] ? `sub_${dep.split('_sub_')[1]}` : dep}
            </code>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function SpecContractTab({ spec }: { spec: StructuredSpecContract | null }) {
  if (!spec) {
    return (
      <div className="space-y-3">
        <TinyLabel>Task 2 — Specification Structurer</TinyLabel>
        <div className="rounded-md border border-dashed border-[#30363d] p-4 text-center text-xs text-[#8b949e]">
          No Specification Contract compiled yet. Run an agent turn — every raw prompt is
          first compiled into a deterministic PRD with a Subtask DAG, injected Project DNA
          constraints, and acceptance criteria.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TinyLabel>Task 2 — Specification Structurer</TinyLabel>
        <CopyButton text={JSON.stringify(spec, null, 2)} label="Copy Contract" />
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <code className="rounded border border-[#30363d] bg-[#0d1117] px-1.5 py-0.5 font-mono text-[10px] text-[#79c0ff]">
          {spec.specId}
        </code>
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase',
            COMPLEXITY_STYLE[spec.estimatedReasoningComplexity],
          )}
        >
          complexity: {spec.estimatedReasoningComplexity}
        </span>
        {spec.isOverloadedPromptSplit ? (
          <span className="rounded border border-[#d2a8ff]/50 bg-[#d2a8ff]/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-[#d2a8ff]">
            overloaded → split into {spec.subtaskDag.length - 2} atomic edits
          </span>
        ) : null}
      </div>

      <Panel className="p-3">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3 text-[#8b949e]" />
          <TinyLabel>Raw User Prompt</TinyLabel>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-[#c9d1d9]">
          {spec.rawUserPrompt}
        </p>
      </Panel>

      <Panel className="p-3">
        <TinyLabel>Normalized Goal (Atomic Step Chain)</TinyLabel>
        <p className="mt-1.5 break-words font-mono text-[10px] leading-relaxed text-[#7ee787]">
          {spec.normalizedGoal}
        </p>
      </Panel>

      <Panel className="p-3">
        <div className="flex items-center gap-1.5">
          <TriangleAlert className="h-3 w-3 text-[#d29922]" />
          <TinyLabel>Detected Ambiguities ({spec.detectedAmbiguities.length})</TinyLabel>
        </div>
        {spec.detectedAmbiguities.length === 0 ? (
          <p className="mt-1.5 text-[10px] text-[#3fb950]">
            No ambiguities — prompt grounded cleanly to AST symbols.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {spec.detectedAmbiguities.map((ambiguity, i) => (
              <li
                key={i}
                className="rounded border border-[#d29922]/40 bg-[#d29922]/10 px-2 py-1 text-[10px] leading-snug text-[#d29922]"
              >
                {ambiguity}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="p-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-[#7ee787]" />
          <TinyLabel>
            Injected Implicit Constraints ({spec.injectedImplicitConstraints.length})
          </TinyLabel>
        </div>
        <ul className="mt-1.5 space-y-1">
          {spec.injectedImplicitConstraints.map((constraint, i) => (
            <li
              key={i}
              className={cn(
                'rounded border px-2 py-1 font-mono text-[9px] leading-snug',
                constraint.startsWith('PROJECT_DNA')
                  ? 'border-[#d2a8ff]/40 bg-[#d2a8ff]/10 text-[#d2a8ff]'
                  : 'border-[#30363d] bg-[#0d1117] text-[#c9d1d9]',
              )}
            >
              {constraint}
            </li>
          ))}
        </ul>
      </Panel>

      {spec.schemaAndSignatureContracts.length > 0 ? (
        <Panel className="p-3">
          <TinyLabel>
            Signature &amp; Schema Contracts ({spec.schemaAndSignatureContracts.length})
          </TinyLabel>
          <div
            className={cn(
              'mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-md border border-[#30363d] bg-[#0d1117] p-2',
              THIN_SCROLL,
            )}
          >
            {spec.schemaAndSignatureContracts.map((contract, i) => (
              <p
                key={i}
                className="break-all font-mono text-[9px] leading-relaxed text-[#a5d6ff]"
              >
                {contract}
              </p>
            ))}
          </div>
        </Panel>
      ) : null}

      <div>
        <TinyLabel className="mb-1.5">
          Subtask DAG ({spec.subtaskDag.length} atomic nodes)
        </TinyLabel>
        <div className="space-y-1.5">
          {spec.subtaskDag.map((subtask, idx) => (
            <div key={subtask.subtaskId}>
              <SubtaskNodeCard subtask={subtask} />
              {idx < spec.subtaskDag.length - 1 ? (
                <div className="mx-auto flex h-3 w-px items-center justify-center bg-[#30363d]">
                  <ArrowDown className="h-2.5 w-2.5 text-[#8b949e]" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <Panel className="p-3">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-[#3fb950]" />
          <TinyLabel>Acceptance Criteria ({spec.acceptanceCriteria.length})</TinyLabel>
        </div>
        <ul className="mt-1.5 space-y-1">
          {spec.acceptanceCriteria.map((criterion, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[10px] leading-snug text-[#c9d1d9]">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#3fb950]" />
              <span>{criterion}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  )
}

/* -------------------------------- staging -------------------------------- */

function ArtifactStatusBadge({ status }: { status: StagedArtifact['status'] }) {
  return (
    <span
      className={cn(
        'rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase',
        status === 'approved' && 'border-[#3fb950]/50 bg-[#3fb950]/15 text-[#3fb950]',
        status === 'staged' && 'border-[#d29922]/50 bg-[#d29922]/15 text-[#d29922]',
        status === 'rejected' && 'border-[#f85149]/50 bg-[#f85149]/15 text-[#f85149]',
      )}
    >
      {status}
    </span>
  )
}

function StagingTab({
  stagedArtifacts,
  busyArtifactId,
  onResolveApproval,
}: {
  stagedArtifacts: StagedArtifact[]
  busyArtifactId: string | null
  onResolveApproval: (artifactId: string, approved: boolean) => Promise<boolean>
}) {
  if (stagedArtifacts.length === 0) {
    return (
      <div className="space-y-3">
        <TinyLabel>Artifact Staging &amp; Human Approval Gate</TinyLabel>
        <div className="rounded-md border border-dashed border-[#30363d] p-4 text-center text-xs text-[#8b949e]">
          No staged artifacts yet. Edit the note and run{' '}
          <span className="font-mono text-[#79c0ff]">Stage as DAG Edit</span> to propose a
          change through the LangGraph gate.
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <TinyLabel>Artifact Staging &amp; Human Approval Gate</TinyLabel>
      {stagedArtifacts.map((artifact) => {
        const busy = busyArtifactId === artifact.artifactId
        return (
          <FadeIn key={artifact.artifactId}>
            <Panel className="p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all font-mono text-xs font-bold text-[#e6edf3]">
                  {artifact.targetFilePath}
                </span>
                <ArtifactStatusBadge status={artifact.status} />
              </div>

              <div className="mt-1 font-mono text-[10px] text-[#8b949e]">
                Direct Callers: {artifact.blastRadius.directCallers.length} • Transitive:{' '}
                {artifact.blastRadius.transitiveCallers.length} • CX Delta:{' '}
                <span
                  className={
                    artifact.blastRadius.cyclomaticDelta > 0
                      ? 'text-[#f85149]'
                      : 'text-[#3fb950]'
                  }
                >
                  {artifact.blastRadius.cyclomaticDelta >= 0 ? '+' : ''}
                  {artifact.blastRadius.cyclomaticDelta}
                </span>
              </div>

              {artifact.blastRadius.architectureViolations.length > 0 ? (
                <div className="mt-2 space-y-1">
                  {artifact.blastRadius.architectureViolations.map((violation, i) => (
                    <div
                      key={i}
                      className="rounded border border-[#f85149]/40 bg-[#f85149]/10 px-2 py-1 font-mono text-[10px] text-[#f85149]"
                    >
                      ⚠️ {violation}
                    </div>
                  ))}
                </div>
              ) : null}

              {artifact.blastRadius.requiredTests.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {artifact.blastRadius.requiredTests.map((test) => (
                    <Chip key={test} className="font-mono text-[#7ee787]">
                      {test}
                    </Chip>
                  ))}
                </div>
              ) : null}

              <DiffView diff={artifact.unifiedDiff} className="mt-2 max-h-52 overflow-y-auto" />

              {artifact.status === 'staged' ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onResolveApproval(artifact.artifactId, true)}
                    className={cn(
                      'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-60 lg:min-h-0',
                      BTN_PRIMARY,
                    )}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                    Approve &amp; Commit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onResolveApproval(artifact.artifactId, false)}
                    className={cn(
                      'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-60 lg:min-h-0',
                      BTN_DANGER,
                    )}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />}
                    Reject
                  </button>
                </div>
              ) : null}
            </Panel>
          </FadeIn>
        )
      })}
    </div>
  )
}

/* ------------------------------- the pane -------------------------------- */

export type RightPaneTab = 'dag' | 'spec' | 'pack' | 'staging' | 'verify'

export function RightPane({
  envelope,
  dagState,
  stagedArtifacts,
  events,
  spec,
  sessionId,
  tab,
  onTabChange,
  onReInflateCcr,
  onResolveApproval,
  busyArtifactId,
  onRefreshTelemetry,
}: {
  envelope: PackedContextEnvelope | null
  dagState: DagExecutionState | null
  stagedArtifacts: StagedArtifact[]
  events: UnattendedCaptureEvent[]
  spec: StructuredSpecContract | null
  sessionId: string
  tab: RightPaneTab
  onTabChange: (tab: RightPaneTab) => void
  onReInflateCcr: (ccrId: string) => void
  onResolveApproval: (artifactId: string, approved: boolean) => Promise<boolean>
  busyArtifactId: string | null
  onRefreshTelemetry: () => void
}) {
  const tabs: { id: RightPaneTab; label: string; count?: number }[] = [
    { id: 'dag', label: 'DAG' },
    { id: 'spec', label: 'Spec', count: spec?.subtaskDag.length },
    { id: 'pack', label: 'Context Pack' },
    { id: 'staging', label: 'Staging', count: stagedArtifacts.length },
    { id: 'verify', label: 'Verify' },
  ]

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22] lg:h-full">
      <div className="flex shrink-0 border-b border-[#30363d] bg-[#0d1117]">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={cn(
              'min-h-[44px] flex-1 border-b-2 px-2 py-2 text-[11px] font-medium transition-colors lg:min-h-0',
              tab === t.id
                ? 'border-[#58a6ff] bg-[#161b22] text-[#e6edf3]'
                : 'border-transparent text-[#8b949e] hover:bg-[#161b22]/60 hover:text-[#c9d1d9]',
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className="ml-1 font-mono text-[9px] text-[#8b949e]">
                ({t.count})
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto p-3', THIN_SCROLL)}>
        {tab === 'dag' ? (
          <FadeIn key="dag">
            <DagTab
              envelope={envelope}
              dagState={dagState}
              stagedArtifacts={stagedArtifacts}
              events={events}
              onReInflateCcr={onReInflateCcr}
            />
          </FadeIn>
        ) : null}
        {tab === 'spec' ? (
          <FadeIn key="spec">
            <SpecContractTab spec={spec} />
          </FadeIn>
        ) : null}
        {tab === 'pack' ? (
          <FadeIn key="pack">
            <ContextPackTab envelope={envelope} />
          </FadeIn>
        ) : null}
        {tab === 'staging' ? (
          <FadeIn key="staging">
            <StagingTab
              stagedArtifacts={stagedArtifacts}
              busyArtifactId={busyArtifactId}
              onResolveApproval={onResolveApproval}
            />
          </FadeIn>
        ) : null}
        {tab === 'verify' ? (
          <FadeIn key="verify">
            <VerificationPanel
              sessionId={sessionId}
              stagedArtifacts={stagedArtifacts}
              envelope={envelope}
              onReInflateCcr={onReInflateCcr}
              onRefreshTelemetry={onRefreshTelemetry}
            />
          </FadeIn>
        ) : null}
      </div>
    </section>
  )
}

