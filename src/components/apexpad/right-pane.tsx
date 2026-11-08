'use client'

/**
 * src/components/apexpad/right-pane.tsx
 * DAG Control Plane + SSE event feed + Context Pack + Staging approval gate.
 */
import * as React from 'react'
import { AnimatePresence } from 'framer-motion'
import {
  ArrowDown,
  Ban,
  Bot,
  CheckCircle2,
  FileCode,
  FileDiff,
  FileText,
  GitBranch,
  HardDrive,
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
  Undo2,
  Wrench,
} from 'lucide-react'

import type {
  AtomicSubtaskNode,
  StructuredSpecContract,
} from '@/lib/apexpad-guardrails-types'
import type {
  CaptureEventType,
  DagExecutionState,
  DiskCommitRecord,
  DiskRollbackReceipt,
  PackedContextEnvelope,
  StagedArtifact,
  UnattendedCaptureEvent,
} from '@/lib/apexpad-types'
import type { QuarantinedEditSummary } from '@/lib/apexpad-client'
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
  TabStrip,
  THIN_SCROLL,
  TinyLabel,
} from './ui-kit'
import { FrozenPrefixDialog } from './dialogs'

/** Locale-correct stamps via Intl (never hardcoded formats). */
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
})
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })

/* ------------------------------ event feed ------------------------------- */

const EVENT_ICON: Record<CaptureEventType, { icon: React.ReactNode; color: string }> = {
  'hook:session_start': { icon: <Play className="h-3 w-3" />, color: 'text-signal-live' },
  'hook:user_prompt': { icon: <MessageSquare className="h-3 w-3" />, color: 'text-signal-info' },
  'hook:post_tool_use': { icon: <Wrench className="h-3 w-3" />, color: 'text-signal-gate' },
  'hook:session_end': { icon: <Square className="h-3 w-3" />, color: 'text-signal-danger' },
  'fs:file_indexed': { icon: <FileCode className="h-3 w-3" />, color: 'text-signal-info' },
  'fs:file_rekeyed': { icon: <RefreshCw className="h-3 w-3" />, color: 'text-signal-memory' },
  'spec:structured': { icon: <ScrollText className="h-3 w-3" />, color: 'text-signal-info' },
  'agent:turn_complete': { icon: <Bot className="h-3 w-3" />, color: 'text-signal-live' },
  'dag:staged': { icon: <GitBranch className="h-3 w-3" />, color: 'text-signal-memory' },
  'artifact:resolved': { icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-signal-live' },
  'artifact:committed': { icon: <HardDrive className="h-3 w-3" />, color: 'text-signal-live' },
  'artifact:rolled_back': { icon: <Undo2 className="h-3 w-3" />, color: 'text-signal-gate' },
  'quarantine:blocked': { icon: <Ban className="h-3 w-3" />, color: 'text-signal-danger' },
  'guardrail:report': { icon: <TriangleAlert className="h-3 w-3" />, color: 'text-signal-gate' },
  'verify:report': { icon: <ShieldCheck className="h-3 w-3" />, color: 'text-signal-info' },
  'pipeline:complete': { icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-signal-live' },
  'browser:command': { icon: <Wrench className="h-3 w-3" />, color: 'text-signal-memory' },
  'e2e:suite': { icon: <ShieldCheck className="h-3 w-3" />, color: 'text-signal-live' },
}

function EventFeed({
  events,
  sseConnected,
}: {
  events: UnattendedCaptureEvent[]
  sseConnected: boolean
}) {
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
        role="log"
        aria-live="polite"
        aria-label="Live capture event feed"
        className={cn(
          'max-h-64 space-y-1 overflow-y-auto rounded-md border border-wire bg-vault p-1.5',
          THIN_SCROLL,
        )}
      >
        {events.length === 0 ? (
          <div className="p-3 text-center text-[11px] text-ink-muted" role="status">
            {sseConnected
              ? 'Connected — no capture events yet. Run an agent turn or a hook to generate some.'
              : 'Event stream disconnected — events will appear here once the SSE channel reconnects.'}
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {events.map((event, i) => {
              const meta = EVENT_ICON[event.eventType] ?? {
                icon: <Wrench className="h-3 w-3" />,
                color: 'text-ink-muted',
              }
              const payloadJson = JSON.stringify(event.payload ?? {})
              return (
                <SlideInItem
                  key={`${event.timestamp}-${event.eventType}-${i}`}
                  className="flex items-start gap-2 rounded px-1.5 py-1 hover:bg-vault-1"
                >
                  <span className={cn('mt-0.5 shrink-0', meta.color)} aria-hidden>
                    {meta.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn('font-mono text-[11px] font-semibold', meta.color)}>
                        {event.eventType}
                      </span>
                      <time
                        dateTime={event.timestamp}
                        className="shrink-0 font-mono text-[11px] text-ink-muted tabular-nums"
                      >
                        {formatRelativeTime(event.timestamp)}
                      </time>
                    </div>
                    {/* Fold, never truncate: full payload on demand (DESIGN.md §6) */}
                    <details className="group mt-0.5">
                      <summary className="cursor-pointer select-none break-all font-mono text-[11px] leading-relaxed text-ink-muted transition-colors hover:text-ink">
                        {truncate(payloadJson, 80)}
                        <span className="ml-1 text-signal-info group-open:hidden">[expand]</span>
                        <span className="ml-1 hidden text-ink-ghost group-open:inline">[collapse]</span>
                      </summary>
                      <pre className="mt-1 break-all whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-ink">
                        {payloadJson}
                      </pre>
                    </details>
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
          highlight && 'border-signal-gate/70 bg-signal-gate/5',
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
      <div className="mx-auto h-2.5 w-px bg-wire" aria-hidden />
    </>
  )
}

function DagTab({
  envelope,
  dagState,
  stagedArtifacts,
  events,
  diskCommits,
  quarantinedEdits,
  sseConnected,
  onReInflateCcr,
}: {
  envelope: PackedContextEnvelope | null
  dagState: DagExecutionState | null
  stagedArtifacts: StagedArtifact[]
  events: UnattendedCaptureEvent[]
  diskCommits: DiskCommitRecord[]
  quarantinedEdits: QuarantinedEditSummary[]
  sseConnected: boolean
  onReInflateCcr: (ccrId: string) => void
}) {
  const stagedCount = stagedArtifacts.filter((a) => a.status === 'staged').length

  return (
    <div className="space-y-3">
      <TinyLabel>DAG Control Plane</TinyLabel>

      <DagNode
        title="1. Project DNA + MEM0 Router"
        titleColor="text-signal-live"
        icon={<Route className="h-3.5 w-3.5" />}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-ink-muted">Frozen Prefix Hash:</span>
          <code className="rounded border border-wire bg-vault px-1.5 py-0.5 font-mono text-[11px] text-signal-live">
            {envelope ? envelope.frozenPrefixHash.slice(0, 12) : '—'}
          </code>
          <span className="font-mono text-[11px] text-ink-muted">(KV-Cache Aligned)</span>
        </div>
      </DagNode>

      <DagNode
        title="2. Context Pack (U-Curve + CCR)"
        titleColor="text-signal-info"
        icon={<PackageCheck className="h-3.5 w-3.5" />}
      >
        <div className="font-mono text-[11px] text-ink-muted">
          Tokens:{' '}
          <span className="text-ink-strong">
            {envelope?.estimatedTotalTokens ?? '—'} / {envelope?.tokenBudgetCeiling ?? '—'}
          </span>{' '}
          • Byte Ceiling:{' '}
          <span className="text-ink-strong">{envelope?.byteCeiling ?? '—'} B</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {(envelope?.includedCcrIds ?? []).map((ccrId) => (
            <button
              key={ccrId}
              type="button"
              onClick={() => onReInflateCcr(ccrId)}
              aria-label={`Re-inflate CCR block ${ccrId} — rebuild from source observations`}
              className="inline-flex min-h-[28px] items-center rounded border border-signal-info/40 bg-signal-info/10 px-1.5 font-mono text-[11px] text-signal-info hover:bg-signal-info/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus"
            >
              Re-inflate {ccrId}
            </button>
          ))}
          {(envelope?.includedCcrIds ?? []).length === 0 ? (
            <span className="text-[11px] text-ink-muted">no CCR stubs in pack</span>
          ) : null}
        </div>
      </DagNode>

      <DagNode
        title="3. Planner (CrewAI) → DAG Engine (LangGraph)"
        titleColor="text-signal-memory"
        icon={<Network className="h-3.5 w-3.5" />}
        highlight={dagState?.status === 'running'}
      >
        <div className="font-mono text-[11px] text-ink-muted">
          Research Agent (
          <span className="text-ink-strong">{envelope?.includedObservationIds.length ?? 0}</span>{' '}
          obs) ⇄ Architect Agent (
          <span className="text-ink-strong">{envelope?.includedSymbolIds.length ?? 0}</span> AST
          nodes)
        </div>
        {dagState ? (
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip className="font-mono">run: {dagState.runId.slice(0, 10)}</Chip>
            <Chip className="text-ink">{dagState.currentNode}</Chip>
            <Chip title={dagState.userGoal} className="max-w-full text-signal-memory">
              goal: {truncate(dagState.userGoal, 40)}
            </Chip>
          </div>
        ) : null}
      </DagNode>

      <DagNode
        title="4. Artifact Staging → Human Approval"
        titleColor="text-ink-strong"
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
              'rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase',
              stagedCount > 0
                ? 'border-signal-gate/50 bg-signal-gate/15 text-signal-gate'
                : 'border-signal-live/40 bg-signal-live/10 text-signal-live',
            )}
          >
            {stagedCount > 0 ? 'awaiting human approval' : 'gate clear'}
          </span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-ink-muted tabular-nums">
          <span className="inline-flex items-center gap-1 text-signal-live">
            <HardDrive className="h-2.5 w-2.5" aria-hidden />
            {diskCommits.filter((c) => !c.rolledBack).length} on-disk commit(s)
          </span>
          <span className="inline-flex items-center gap-1 text-signal-gate">
            <Undo2 className="h-2.5 w-2.5" aria-hidden />
            {diskCommits.filter((c) => c.rolledBack).length} rolled back
          </span>
        </div>
      </DagNode>

      {quarantinedEdits.length > 0 ? (
        <Panel className="border-signal-danger/60 bg-signal-danger/5 p-3">
          <div className="flex items-center gap-1.5">
            <Ban className="h-3.5 w-3.5 text-signal-danger" />
            <span className="text-[11px] font-bold uppercase tracking-wide text-signal-danger">
              Hard Quarantine Gate — {quarantinedEdits.length} edit(s) blocked
            </span>
          </div>
          <div className="mt-2 space-y-2">
            {quarantinedEdits.slice(0, 5).map((q) => (
              <div key={q.quarantineId} className="rounded-md border border-signal-danger/40 bg-vault p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="break-all font-mono text-[11px] font-bold text-signal-danger">
                    {q.targetFilePath}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-ink-muted">
                    {formatRelativeTime(q.quarantinedAt)}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {q.blockingReasons.map((reason, i) => (
                    <li key={i} className="flex items-start gap-1 font-mono text-[11px] leading-relaxed text-signal-danger/90">
                      <TriangleAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {quarantinedEdits.length > 5 ? (
              <p className="font-mono text-[11px] text-ink-muted">
                +{quarantinedEdits.length - 5} more quarantined edit(s) — never staged.
              </p>
            ) : null}
          </div>
        </Panel>
      ) : null}

      <EventFeed events={events} sseConnected={sseConnected} />
    </div>
  )
}

/* ------------------------------ context pack ------------------------------ */

/** Readable (13px) payload viewer — collapsed by default, expands on demand. */
function PackPayload({ xml }: { xml: string }) {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <div>
      <pre
        className={cn(
          'overflow-auto whitespace-pre-wrap rounded-md border border-wire bg-vault p-3 font-mono text-[13px] leading-relaxed text-signal-info transition-[max-height] duration-200',
          expanded ? 'max-h-[560px]' : 'max-h-56',
          THIN_SCROLL,
        )}
        aria-expanded={expanded}
      >
        {xml || 'Context pack will stream here once the workbench initializes.'}
      </pre>
      {xml ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(
            'mt-1.5 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus lg:min-h-0',
            BTN_SECONDARY,
          )}
        >
          {expanded ? 'Collapse payload' : 'Show full payload'}
        </button>
      ) : null}
    </div>
  )
}

function ContextPackTab({ envelope }: { envelope: PackedContextEnvelope | null }) {
  const [prefixOpen, setPrefixOpen] = React.useState(false)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <TinyLabel>Live U-Curve Packed XML Payload</TinyLabel>
        <CopyButton text={envelope?.liveZoneXml ?? ''} label="Copy XML" />
      </div>

      {/* 13px readable payload with progressive disclosure — fold, never shrink */}
      <PackPayload xml={envelope?.liveZoneXml ?? ''} />

      {envelope && envelope.truncationDisclosures.length > 0 ? (
        <div className="space-y-1.5">
          {envelope.truncationDisclosures.map((disclosure, i) => (
            <div
              key={i}
              className="flex items-start gap-1.5 rounded-md border border-signal-gate/40 bg-signal-gate/10 px-2 py-1.5 text-[11px] text-signal-gate"
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
  researcher: 'border-signal-live/50 bg-signal-live/15 text-signal-live',
  architect: 'border-signal-memory/50 bg-signal-memory/15 text-signal-memory',
  verifier: 'border-signal-gate/50 bg-signal-gate/15 text-signal-gate',
}

const COMPLEXITY_STYLE: Record<StructuredSpecContract['estimatedReasoningComplexity'], string> = {
  low: 'border-signal-live/50 bg-signal-live/15 text-signal-live',
  medium: 'border-signal-gate/50 bg-signal-gate/15 text-signal-gate',
  high: 'border-signal-danger/50 bg-signal-danger/15 text-signal-danger',
}

function SubtaskNodeCard({ subtask }: { subtask: AtomicSubtaskNode }) {
  return (
    <div className="rounded-md border border-wire bg-vault p-2.5">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-bold text-ink-strong">
            #{subtask.orderIndex}
          </span>
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase',
              AGENT_ROLE_STYLE[subtask.assignedAgent],
            )}
          >
            {subtask.assignedAgent}
          </span>
        </div>
        <code className="rounded border border-wire bg-vault-1 px-1.5 py-0.5 font-mono text-[11px] text-ink-muted">
          {subtask.verificationCommand}
        </code>
      </div>

      <p className="mt-1.5 text-[11px] leading-snug text-ink">{subtask.title}</p>

      <div className="mt-1.5 flex flex-wrap gap-1">
        {subtask.targetFiles.map((file) => (
          <Chip key={file} className="font-mono text-signal-info">
            <FileText className="h-2.5 w-2.5" />
            {truncate(file, 34)}
          </Chip>
        ))}
        {subtask.targetSymbols.slice(0, 4).map((symbol) => (
          <Chip key={symbol} className="font-mono text-signal-live">
            {symbol}
          </Chip>
        ))}
      </div>

      {subtask.explicitConstraints.length > 0 ? (
        <p className="mt-1.5 font-mono text-[11px] text-ink-muted">
          {subtask.explicitConstraints.length} explicit constraint(s) attached
        </p>
      ) : null}

      {subtask.dependsOnSubtaskIds.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          <span className="font-mono text-[11px] text-ink-muted">depends on:</span>
          {subtask.dependsOnSubtaskIds.map((dep) => (
            <code
              key={dep}
              className="rounded border border-wire bg-vault-1 px-1 py-0.5 font-mono text-[11px] text-signal-memory"
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
        <div className="rounded-md border border-dashed border-wire p-4 text-center text-xs text-ink-muted">
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
        <code className="rounded border border-wire bg-vault px-1.5 py-0.5 font-mono text-[11px] text-signal-info">
          {spec.specId}
        </code>
        <span
          className={cn(
            'rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase',
            COMPLEXITY_STYLE[spec.estimatedReasoningComplexity],
          )}
        >
          complexity: {spec.estimatedReasoningComplexity}
        </span>
        {spec.isOverloadedPromptSplit ? (
          <span className="rounded border border-signal-memory/50 bg-signal-memory/15 px-1.5 py-0.5 font-mono text-[11px] uppercase text-signal-memory">
            overloaded → split into {spec.subtaskDag.length - 2} atomic edits
          </span>
        ) : null}
      </div>

      <Panel className="p-3">
        <div className="flex items-center gap-1.5">
          <MessageSquare className="h-3 w-3 text-ink-muted" />
          <TinyLabel>Raw User Prompt</TinyLabel>
        </div>
        <p className="mt-1.5 whitespace-pre-wrap text-[11px] leading-relaxed text-ink">
          {spec.rawUserPrompt}
        </p>
      </Panel>

      <Panel className="p-3">
        <TinyLabel>Normalized Goal (Atomic Step Chain)</TinyLabel>
        <p className="mt-1.5 break-words font-mono text-[11px] leading-relaxed text-signal-live">
          {spec.normalizedGoal}
        </p>
      </Panel>

      <Panel className="p-3">
        <div className="flex items-center gap-1.5">
          <TriangleAlert className="h-3 w-3 text-signal-gate" />
          <TinyLabel>Detected Ambiguities ({spec.detectedAmbiguities.length})</TinyLabel>
        </div>
        {spec.detectedAmbiguities.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-signal-live">
            No ambiguities — prompt grounded cleanly to AST symbols.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {spec.detectedAmbiguities.map((ambiguity, i) => (
              <li
                key={i}
                className="rounded border border-signal-gate/40 bg-signal-gate/10 px-2 py-1 text-[11px] leading-snug text-signal-gate"
              >
                {ambiguity}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="p-3">
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 text-signal-live" />
          <TinyLabel>
            Injected Implicit Constraints ({spec.injectedImplicitConstraints.length})
          </TinyLabel>
        </div>
        <ul className="mt-1.5 space-y-1">
          {spec.injectedImplicitConstraints.map((constraint, i) => (
            <li
              key={i}
              className={cn(
                'rounded border px-2 py-1 font-mono text-[11px] leading-snug',
                constraint.startsWith('PROJECT_DNA')
                  ? 'border-signal-memory/40 bg-signal-memory/10 text-signal-memory'
                  : 'border-wire bg-vault text-ink',
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
              'mt-1.5 max-h-40 space-y-1 overflow-y-auto rounded-md border border-wire bg-vault p-2',
              THIN_SCROLL,
            )}
          >
            {spec.schemaAndSignatureContracts.map((contract, i) => (
              <p
                key={i}
                className="break-all font-mono text-[11px] leading-relaxed text-signal-info"
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
                <div className="mx-auto flex h-3 w-px items-center justify-center bg-wire">
                  <ArrowDown className="h-2.5 w-2.5 text-ink-muted" />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <Panel className="p-3">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3 text-signal-live" />
          <TinyLabel>Acceptance Criteria ({spec.acceptanceCriteria.length})</TinyLabel>
        </div>
        <ul className="mt-1.5 space-y-1">
          {spec.acceptanceCriteria.map((criterion, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px] leading-snug text-ink">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-signal-live" />
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
        'rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase',
        status === 'approved' && 'border-signal-live/50 bg-signal-live/15 text-signal-live',
        status === 'staged' && 'border-signal-gate/50 bg-signal-gate/15 text-signal-gate',
        status === 'rejected' && 'border-signal-danger/50 bg-signal-danger/15 text-signal-danger',
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
  diskCommits,
  rollbackReceipts,
  busyRollbackArtifactId,
  onRollbackArtifact,
}: {
  stagedArtifacts: StagedArtifact[]
  busyArtifactId: string | null
  onResolveApproval: (artifactId: string, approved: boolean) => Promise<boolean>
  diskCommits: DiskCommitRecord[]
  rollbackReceipts: Record<string, DiskRollbackReceipt>
  busyRollbackArtifactId: string | null
  onRollbackArtifact: (artifactId: string) => Promise<boolean>
}) {
  if (stagedArtifacts.length === 0) {
    return (
      <div className="space-y-3">
        <TinyLabel>Artifact Staging &amp; Human Approval Gate</TinyLabel>
        <div className="rounded-md border border-dashed border-wire p-4 text-center text-xs text-ink-muted">
          No staged artifacts yet. Edit the note and run{' '}
          <span className="font-mono text-signal-info">Stage as DAG Edit</span> to propose a
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
        const commit = diskCommits.find((c) => c.artifactId === artifact.artifactId)
        const rollback = rollbackReceipts[artifact.artifactId]
        const rollbackBusy = busyRollbackArtifactId === artifact.artifactId
        return (
          <FadeIn key={artifact.artifactId}>
            <Panel
              className="p-3 focus-within:border-wire-strong"
              tabIndex={0}
              aria-label={`Artifact ${artifact.targetFilePath}, status ${artifact.status}${artifact.status === 'staged' ? '. Press A to approve and commit, R to reject.' : ''}`}
              onKeyDown={(e) => {
                /* Keyboard approval gate (DESIGN.md §11): A approve, R reject */
                if (artifact.status !== 'staged' || busy) return
                if (e.target !== e.currentTarget) return
                const key = e.key.toLowerCase()
                if (key === 'a') {
                  e.preventDefault()
                  void onResolveApproval(artifact.artifactId, true)
                } else if (key === 'r') {
                  e.preventDefault()
                  void onResolveApproval(artifact.artifactId, false)
                }
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="break-all font-mono text-xs font-bold text-ink-strong">
                  {artifact.targetFilePath}
                </span>
                <ArtifactStatusBadge status={artifact.status} />
              </div>

              <div className="mt-1 font-mono text-[11px] text-ink-muted">
                Direct Callers: {artifact.blastRadius.directCallers.length} • Transitive:{' '}
                {artifact.blastRadius.transitiveCallers.length} • CX Delta:{' '}
                <span
                  className={
                    artifact.blastRadius.cyclomaticDelta > 0
                      ? 'text-signal-danger'
                      : 'text-signal-live'
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
                      className="rounded border border-signal-danger/40 bg-signal-danger/10 px-2 py-1 font-mono text-[11px] text-signal-danger"
                    >
                      <TriangleAlert className="mr-1 inline h-3 w-3" aria-hidden />
                      {violation}
                    </div>
                  ))}
                </div>
              ) : null}

              {artifact.blastRadius.requiredTests.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {artifact.blastRadius.requiredTests.map((test) => (
                    <Chip key={test} className="font-mono text-signal-live">
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
                      'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus disabled:opacity-60 lg:min-h-0',
                      BTN_PRIMARY,
                    )}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />}
                    Approve &amp; Commit
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void onResolveApproval(artifact.artifactId, false)}
                    className={cn(
                      'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus disabled:opacity-60 lg:min-h-0',
                      BTN_DANGER,
                    )}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Square className="h-3.5 w-3.5" aria-hidden />}
                    Reject
                  </button>
                </div>
              ) : null}

              {/* PHASE 10 (GAP #1): atomic disk commit receipt + 1-click rollback */}
              {commit && !rollback ? (
                <div
                  className={cn(
                    'mt-2 rounded-md border p-2',
                    commit.rolledBack
                      ? 'border-signal-gate/50 bg-signal-gate/5'
                      : 'border-action-hover/50 bg-action/10',
                  )}
                >
                  <div className="flex items-center gap-1.5">
                    {commit.rolledBack ? (
                      <Undo2 className="h-3 w-3 text-signal-gate" />
                    ) : (
                      <HardDrive className="h-3 w-3 text-signal-live" />
                    )}
                    <span
                      className={cn(
                        'font-mono text-[11px] font-bold uppercase tracking-wide',
                        commit.rolledBack ? 'text-signal-gate' : 'text-signal-live',
                      )}
                    >
                      {commit.rolledBack ? 'rolled back' : 'committed to disk'}
                    </span>
                  </div>
                  <div className="mt-1 space-y-0.5 font-mono text-[11px] leading-relaxed text-ink-muted">
                    <p className="break-all">
                      sha256:{' '}
                      <span className={commit.rolledBack ? 'text-signal-gate' : 'text-signal-live'}>
                        {commit.committedSha256.slice(0, 16)}…
                      </span>
                    </p>
                    <p className="break-all">
                      path: <span className="text-signal-info">{commit.absoluteFilePath}</span>
                    </p>
                    <p className="break-all">
                      backup: {commit.backupFilePath ? `.apexpad-backups/${artifact.artifactId}.bak` : 'none (new file)'} •
                      existed before: {String(commit.existedBeforeCommit)}
                    </p>
                    <p>committed: {dateTimeFmt.format(new Date(commit.committedAt))}</p>
                    {commit.rolledBack ? (
                      <p className="text-signal-gate">
                        rolled back {commit.rolledBackAt ? dateTimeFmt.format(new Date(commit.rolledBackAt)) : ''} —
                        reason: {commit.rollbackReason ?? '—'}
                      </p>
                    ) : null}
                  </div>
                  {!commit.rolledBack ? (
                    <button
                      type="button"
                      disabled={rollbackBusy}
                      onClick={() => void onRollbackArtifact(artifact.artifactId)}
                      className={cn(
                        'mt-2 inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md border border-signal-gate/60 bg-signal-gate/15 px-3 py-2 text-xs font-bold text-signal-gate transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus hover:bg-signal-gate/25 disabled:opacity-60 lg:min-h-0',
                      )}
                    >
                      {rollbackBusy ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      )}
                      Rollback to backup (.bak)
                    </button>
                  ) : null}
                </div>
              ) : null}

              {rollback ? (
                <div className="mt-2 rounded-md border border-signal-gate/50 bg-signal-gate/10 p-2 font-mono text-[11px] leading-relaxed text-signal-gate">
                  <p className="font-bold uppercase">rolled back on disk</p>
                  <p className="break-all">restored: {rollback.restoredFilePath}</p>
                  <p>
                    deleted-because-new: {String(rollback.wasDeletedBecauseNew)} • restored sha:{' '}
                    {rollback.restoredSha256?.slice(0, 12) ?? '—'}…
                  </p>
                  <p className="break-all">
                    at {timeFmt.format(new Date(rollback.rolledBackAt))} — {rollback.reason}
                  </p>
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
  sseConnected,
  tab,
  onTabChange,
  onReInflateCcr,
  onResolveApproval,
  busyArtifactId,
  onRefreshTelemetry,
  diskCommits,
  quarantinedEdits,
  rollbackReceipts,
  busyRollbackArtifactId,
  onRollbackArtifact,
}: {
  envelope: PackedContextEnvelope | null
  dagState: DagExecutionState | null
  stagedArtifacts: StagedArtifact[]
  events: UnattendedCaptureEvent[]
  spec: StructuredSpecContract | null
  sessionId: string
  sseConnected: boolean
  tab: RightPaneTab
  onTabChange: (tab: RightPaneTab) => void
  onReInflateCcr: (ccrId: string) => void
  onResolveApproval: (artifactId: string, approved: boolean) => Promise<boolean>
  busyArtifactId: string | null
  onRefreshTelemetry: () => void
  /** PHASE 10 (GAP #1): atomic disk commit ledger. */
  diskCommits: DiskCommitRecord[]
  /** PHASE 10 (GAP #2): hard-quarantined candidate edits. */
  quarantinedEdits: QuarantinedEditSummary[]
  /** PHASE 10 (GAP #1): rollback receipts keyed by artifact id. */
  rollbackReceipts: Record<string, DiskRollbackReceipt>
  busyRollbackArtifactId: string | null
  onRollbackArtifact: (artifactId: string) => Promise<boolean>
}) {
  const tabs: { id: RightPaneTab; label: string; count?: number }[] = [
    { id: 'dag', label: 'DAG' },
    { id: 'spec', label: 'Spec', count: spec?.subtaskDag.length },
    { id: 'pack', label: 'Context Pack' },
    { id: 'staging', label: 'Staging', count: stagedArtifacts.length },
    { id: 'verify', label: 'Verify' },
  ]

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-wire bg-vault-1 lg:h-full">
      <div className="shrink-0 border-b border-wire bg-vault px-1 pt-1">
        <TabStrip
          idPrefix="right-pane"
          ariaLabel="Right pane sections"
          items={tabs.map((t) => ({
            id: t.id,
            label: (
              <>
                {t.label}
                {t.count !== undefined ? (
                  <span className="ml-1 font-mono text-[11px] text-ink-muted tabular-nums">
                    ({t.count})
                  </span>
                ) : null}
              </>
            ),
          }))}
          active={tab}
          onChange={(id) => onTabChange(id as RightPaneTab)}
          className="w-full [&>button]:flex-1"
        />
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto p-3', THIN_SCROLL)}>
        <div
          role="tabpanel"
          id={`right-pane-panel-${tab}`}
          aria-labelledby={`right-pane-tab-${tab}`}
        >
        {tab === 'dag' ? (
          <FadeIn key="dag">
            <DagTab
              envelope={envelope}
              dagState={dagState}
              stagedArtifacts={stagedArtifacts}
              events={events}
              diskCommits={diskCommits}
              quarantinedEdits={quarantinedEdits}
              sseConnected={sseConnected}
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
              diskCommits={diskCommits}
              rollbackReceipts={rollbackReceipts}
              busyRollbackArtifactId={busyRollbackArtifactId}
              onRollbackArtifact={onRollbackArtifact}
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
      </div>
    </section>
  )
}

