'use client'

/**
 * src/components/apexpad/verification-panel.tsx
 * VERIFIER panel — the Slice 3 control surface (blueprint §7.6 / §7.7):
 *   GUARD    — Task 3 Model Generation Guardrails inspector (anti-truncation
 *              AST splicer, hallucinated-import blocker, version-skew scanner,
 *              anti-sycophancy premise critic).
 *   BROWSER  — Task 4 Agent-Browser console (live DOM registry seeding,
 *              snapshot -i -> @e1 RefMap -> action loop with loud failures,
 *              CSPRNG content boundaries, domain allowlist).
 *   RUNTIME  — Task 4 artifact verification (compiler/type-check gate,
 *              Ripwire test gate, Agent-Browser loop) over staged artifacts.
 *   PIPELINE — §7.6 unified 4-stage pipeline runner (spec -> guardrails ->
 *              DAG staging -> runtime verification).
 *   SUITE    — §7.7 End-to-End Verification Suite for Tasks 2, 3 and 4 with
 *              per-assertion evidence.
 *
 * All calls flow through the /api/apexpad contract (apexpadApi client).
 */

import * as React from 'react'
import {
  AlertTriangle,
  Check,
  ChevronRight,
  FlaskConical,
  Globe,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  ShieldCheck,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react'

import type {
  AgentBrowserActionCommand,
  AgentBrowserActionExecutionResult,
  E2eSuiteRunReport,
  FullApexPipelineResult,
  GuardrailInspectionReport,
  RuntimeVerificationReport,
} from '@/lib/apexpad-guardrails-types'
import type { PackedContextEnvelope, StagedArtifact } from '@/lib/apexpad-types'
import { apexpadApi } from '@/lib/apexpad-client'
import { useToast } from '@/hooks/use-toast'
import { cn } from '@/lib/utils'

import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  INPUT_DARK,
  Panel,
  TabStrip,
  CopyButton,
  THIN_SCROLL,
  TinyLabel,
  TOAST_DARK,
} from './ui-kit'

/** Locale-correct stamps via Intl (never hardcoded formats). */
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'medium',
})

/* ------------------------------------------------------------------ */
/* §7.7 scenario fixtures (prefilled demo inputs)                      */
/* ------------------------------------------------------------------ */

const GUARD_DEMO_FILE = 'src/security/sessionAuth.ts'

const GUARD_DEMO_PREVIOUS = `import Database from 'better-sqlite3';

export function verifySessionToken(token: string): boolean {
  if (!token) throw new Error("Missing token");
  return token.startsWith("valid_");
}

export function revokeSessionToken(token: string): string {
  return "revoked:" + token;
}

export function auditSecurityLog(entry: string): string {
  return "[AUDIT] " + entry;
}
`

const GUARD_DEMO_PROPOSED = `import Database from 'better-sqlite3';
import { magicVerify } from '@nonexistent-hallucinated/magic-auth';

export function verifySessionToken(token: string): boolean {
  if (!token) throw new Error("Missing token");
  return token.startsWith("valid_v2_");
}
// ... rest of existing code remains unchanged ...
`

const GUARD_DEMO_PROMPT = 'Is it crashing because of redisClusterConfig?'

const BROWSER_DEMO_URL = 'http://127.0.0.1:3000/checkout'

const BROWSER_DEMO_ELEMENTS = JSON.stringify(
  [
    {
      role: 'button',
      name: 'Accept Cookies',
      tagName: 'BUTTON',
      isInteractive: true,
      domPathSelector: '#accept-cookies-btn',
    },
    {
      role: 'button',
      name: 'Submit Order',
      tagName: 'BUTTON',
      isInteractive: true,
      coveredByOverlaySelector: '#cookie-consent-banner',
      domPathSelector: '#submit-order-btn',
    },
    {
      role: 'textbox',
      name: 'Promo code',
      tagName: 'INPUT',
      isInteractive: true,
      domPathSelector: '#promo-input',
    },
  ],
  null,
  2,
)

const SERVICE_DEMO_PREVIOUS = `import { executeRawQuery } from '../db/query';

/**
 * Account service layer. Reads flow db -> service -> renderer, never sideways.
 */
export function fetchUserAccount(id: string): { id: string; plan: string; seats: number } {
  const { rows } = executeRawQuery(\`SELECT id, plan, seats FROM accounts WHERE id = '\${id}'\`);
  if (rows.length === 0) {
    throw new Error(\`Account \${id} not found\`);
  }
  return rows[0] as { id: string; plan: string; seats: number };
}

export function listAllAccounts() {
  return executeRawQuery('SELECT id, plan FROM accounts ORDER BY created_at DESC').rows;
}
`

const SERVICE_DEMO_PROPOSED = `${SERVICE_DEMO_PREVIOUS}
export function fetchAccountPlan(id: string): string {
  return fetchUserAccount(id).plan;
}
`

const PIPELINE_DEMO_PROMPT =
  'Add a fetchAccountPlan helper to the account service and harden verifySessionToken against v2 tokens; also connect the audit trail'

/* ------------------------------------------------------------------ */
/* Shared micro pieces                                                 */
/* ------------------------------------------------------------------ */

function GateBadge({
  ok,
  label,
  warn,
}: {
  ok: boolean
  label: string
  warn?: boolean
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        ok
          ? 'border-signal-live/40 bg-signal-live/10 text-signal-live'
          : warn
            ? 'border-signal-gate/40 bg-signal-gate/10 text-signal-gate'
            : 'border-signal-danger/40 bg-signal-danger/10 text-signal-danger',
      )}
    >
      {ok ? <Check className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
      {label}
    </span>
  )
}

function EvidenceList({
  items,
  tone,
  emptyText,
}: {
  items: string[]
  tone: 'red' | 'yellow' | 'blue' | 'green'
  emptyText?: string
}) {
  if (items.length === 0) {
    return emptyText ? (
      <p className="text-[11px] italic text-ink-muted">{emptyText}</p>
    ) : null
  }
  const color =
    tone === 'red'
      ? 'text-signal-danger'
      : tone === 'yellow'
        ? 'text-signal-gate'
        : tone === 'green'
          ? 'text-signal-live'
          : 'text-signal-info'
  return (
    <ul className={cn('space-y-1 font-mono text-[11px] leading-relaxed', color)}>
      {items.map((item, i) => (
        <li key={i} className="whitespace-pre-wrap break-words">
          • {item}
        </li>
      ))}
    </ul>
  )
}

function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-[11px] font-medium text-ink-muted">
      {children}
    </label>
  )
}

function DarkTextarea({
  value,
  onChange,
  rows = 5,
  ariaLabel,
  mono = true,
}: {
  value: string
  onChange: (v: string) => void
  rows?: number
  ariaLabel: string
  mono?: boolean
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      aria-label={ariaLabel}
      spellCheck={false}
      className={cn(
        INPUT_DARK,
        'w-full resize-y rounded-md border p-2 leading-relaxed',
        mono ? 'font-mono text-[11px]' : 'text-xs',
        THIN_SCROLL,
      )}
    />
  )
}

function SectionCard({
  title,
  children,
  action,
}: {
  title: string
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <Panel className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <TinyLabel>{title}</TinyLabel>
        {action}
      </div>
      {children}
    </Panel>
  )
}

/* ------------------------------------------------------------------ */
/* GUARD — Task 3 inspector                                            */
/* ------------------------------------------------------------------ */

function GuardrailsInspector({
  sessionId,
  onDone,
}: {
  sessionId: string
  onDone: () => void
}) {
  const { toast } = useToast()
  const [filePath, setFilePath] = React.useState(GUARD_DEMO_FILE)
  const [previousContent, setPreviousContent] = React.useState(GUARD_DEMO_PREVIOUS)
  const [proposedContent, setProposedContent] = React.useState(GUARD_DEMO_PROPOSED)
  const [userPrompt, setUserPrompt] = React.useState(GUARD_DEMO_PROMPT)
  const [allowedDeletions, setAllowedDeletions] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [report, setReport] = React.useState<GuardrailInspectionReport | null>(null)

  const run = async () => {
    if (!filePath.trim() || !proposedContent.trim()) {
      toast({
        title: 'Guardrails need input',
        description: 'Target file path and proposed content are required.',
        variant: 'destructive',
        ...TOAST_DARK,
      })
      return
    }
    setRunning(true)
    setReport(null)
    try {
      const res = await apexpadApi.inspectGuardrails({
        sessionId,
        targetFilePath: filePath.trim(),
        previousContent,
        proposedContent,
        userPrompt,
        allowedSymbolDeletions: allowedDeletions
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      })
      setReport(res.report)
      onDone()
      toast({
        title: res.report.passedAllGates ? 'All guardrail gates passed' : 'Guardrail gate violations',
        description: `${res.report.guardId} • healed: ${res.report.wasAutoHealed ? 'yes' : 'no'} • hallucinated imports: ${res.report.hallucinatedImports.length}`,
        variant: res.report.passedAllGates ? 'default' : 'destructive',
        ...TOAST_DARK,
      })
    } catch (err) {
      toast({
        title: 'Guardrails run failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
        ...TOAST_DARK,
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard
        title="Task 3 — candidate edit inspection"
        action={
          <button
            type="button"
            onClick={() => {
              setFilePath(GUARD_DEMO_FILE)
              setPreviousContent(GUARD_DEMO_PREVIOUS)
              setProposedContent(GUARD_DEMO_PROPOSED)
              setUserPrompt(GUARD_DEMO_PROMPT)
              setAllowedDeletions('')
              setReport(null)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-wire bg-receipt px-2 py-1 text-[11px] text-ink-muted hover:text-ink-strong"
          >
            <RotateCcw className="h-3 w-3" /> §7.7 demo
          </button>
        }
      >
        <div className="space-y-2">
          <div>
            <FieldLabel htmlFor="guard-file">Target file path</FieldLabel>
            <input
              id="guard-file"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5')}
              placeholder="src/security/sessionAuth.ts"
            />
          </div>
          <div>
            <FieldLabel htmlFor="guard-prev">Previous file version (AST splice source)</FieldLabel>
            <DarkTextarea
              value={previousContent}
              onChange={setPreviousContent}
              rows={7}
              ariaLabel="Previous file version"
            />
          </div>
          <div>
            <FieldLabel htmlFor="guard-prop">Proposed (LLM) content — try lazy truncation</FieldLabel>
            <DarkTextarea
              value={proposedContent}
              onChange={setProposedContent}
              rows={7}
              ariaLabel="Proposed content"
            />
          </div>
          <div>
            <FieldLabel htmlFor="guard-prompt">User prompt (premise critic input)</FieldLabel>
            <input
              id="guard-prompt"
              value={userPrompt}
              onChange={(e) => setUserPrompt(e.target.value)}
              className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="guard-allowed-deletions">
              Approved deletions — symbols the healer must NOT restore (comma-separated, optional)
            </FieldLabel>
            <input
              id="guard-allowed-deletions"
              value={allowedDeletions}
              onChange={(e) => setAllowedDeletions(e.target.value)}
              className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5')}
              placeholder="e.g. revokeAll, SessionAuth.revokeSessionToken"
            />
          </div>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className={cn(
              BTN_PRIMARY,
              'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-60',
            )}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {running ? 'Running 4 gates…' : 'Run Guardrails'}
          </button>
        </div>
      </SectionCard>

      {report ? (
        <SectionCard title={`Report ${report.guardId}`}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <GateBadge ok={report.passedAllGates} label={report.passedAllGates ? 'All gates passed' : 'Gates failed'} />
            <GateBadge ok={report.wasAutoHealed} label={report.wasAutoHealed ? 'Auto-healed' : 'No healing needed'} warn />
          </div>

          <div className="space-y-3">
            <div>
              <TinyLabel className="mb-1">Truncation placeholders (recovered via AST splice)</TinyLabel>
              {report.truncationMatches.length === 0 ? (
                <p className="text-[11px] italic text-ink-muted">None detected.</p>
              ) : (
                <ul className="space-y-1 font-mono text-[11px] text-signal-info">
                  {report.truncationMatches.map((m, i) => (
                    <li key={i}>
                      line {m.lineNumber}: “{m.rawLine.trim()}” → spliced {m.recoveredSymbolNames.join(', ') || '—'}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <TinyLabel className="mb-1">Hallucinated imports</TinyLabel>
              <EvidenceList
                items={report.hallucinatedImports}
                tone="red"
                emptyText="Every import resolved cleanly."
              />
            </div>

            <div>
              <TinyLabel className="mb-1">Version-skew warnings</TinyLabel>
              <EvidenceList
                items={report.versionSkewWarnings}
                tone="yellow"
                emptyText="No mixed framework conventions."
              />
            </div>

            <div>
              <TinyLabel className="mb-1">Anti-sycophancy premise warnings</TinyLabel>
              <EvidenceList
                items={report.sycophancyWarnings}
                tone="yellow"
                emptyText="All user premises verified against the file/workspace."
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <TinyLabel>Healed content (downstream staging input)</TinyLabel>
                <CopyButton text={report.healedContent} label="Copy" />
              </div>
              <pre
                className={cn(
                  'max-h-64 overflow-auto rounded-md border border-wire bg-vault p-2 font-mono text-[11px] leading-relaxed text-ink',
                  THIN_SCROLL,
                )}
              >
                {report.healedContent}
              </pre>
            </div>
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* BROWSER — Task 4 agent-browser console                              */
/* ------------------------------------------------------------------ */

type BrowserLogEntry = {
  command: AgentBrowserActionCommand
  result: AgentBrowserActionExecutionResult
}

function BrowserConsole({ sessionId }: { sessionId: string }) {
  const { toast } = useToast()
  const [url, setUrl] = React.useState(BROWSER_DEMO_URL)
  const [elementsJson, setElementsJson] = React.useState(BROWSER_DEMO_ELEMENTS)
  const [commandType, setCommandType] = React.useState<AgentBrowserActionCommand['commandType']>('snapshot')
  const [targetRef, setTargetRef] = React.useState('@e2')
  const [inputValue, setInputValue] = React.useState('')
  const [busy, setBusy] = React.useState<string | null>(null)
  const [log, setLog] = React.useState<BrowserLogEntry[]>([])
  const [state, setState] = React.useState<{
    livePageRevision: number
    refIds: string[]
    actionLog: string[]
  } | null>(null)

  const parseElements = (): unknown[] | null => {
    try {
      const parsed: unknown = JSON.parse(elementsJson)
      if (!Array.isArray(parsed)) throw new Error('elements must be a JSON array')
      return parsed
    } catch (err) {
      toast({
        title: 'Invalid DOM state JSON',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
        ...TOAST_DARK,
      })
      return null
    }
  }

  const refreshState = React.useCallback(async () => {
    try {
      const res = await apexpadApi.getBrowserSessionState(sessionId)
      setState({
        livePageRevision: res.state.livePage?.revision ?? 0,
        refIds: res.state.activeRefMap?.refIds ?? [],
        actionLog: res.state.actionLog,
      })
    } catch {
      /* state probe is best-effort */
    }
  }, [sessionId])

  React.useEffect(() => {
    void refreshState()
  }, [refreshState])

  const seed = async () => {
    const elements = parseElements()
    if (!elements) return
    setBusy('seed')
    try {
      const res = await apexpadApi.setLiveDomState({ sessionId, url: url.trim(), elements: elements as never })
      toast({
        title: 'Live DOM state seeded',
        description: `revision ${res.livePage.revision} • ${res.livePage.elementCount} interactive element(s)`,
        ...TOAST_DARK,
      })
      await refreshState()
    } catch (err) {
      toast({
        title: 'Seeding failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
        ...TOAST_DARK,
      })
    } finally {
      setBusy(null)
    }
  }

  const execute = async () => {
    setBusy('exec')
    const command: AgentBrowserActionCommand =
      commandType === 'fill'
        ? { commandType: 'fill', targetRefOrUrl: targetRef, inputValue }
        : { commandType, targetRefOrUrl: commandType === 'snapshot' || commandType === 'get_url' || commandType === 'close' ? undefined : targetRef }
    try {
      const res = await apexpadApi.executeAgentBrowserCommand({ sessionId, command })
      setLog((prev) => [{ command, result: res.result }, ...prev].slice(0, 12))
      if (!res.result.success) {
        toast({
          title: 'Loud failure (by design)',
          description: res.result.loudFailureReason ?? 'Action blocked by the verification policy.',
          variant: 'destructive',
          ...TOAST_DARK,
        })
      }
      await refreshState()
    } catch (err) {
      toast({
        title: 'Agent-browser command failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
        ...TOAST_DARK,
      })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard
        title="Live page DOM registry (capture daemon)"
        action={
          <button
            type="button"
            onClick={() => {
              setUrl(BROWSER_DEMO_URL)
              setElementsJson(BROWSER_DEMO_ELEMENTS)
              setTargetRef('@e2')
            }}
            className="inline-flex items-center gap-1 rounded-md border border-wire bg-receipt px-2 py-1 text-[11px] text-ink-muted hover:text-ink-strong"
          >
            <RotateCcw className="h-3 w-3" /> §7.7 demo
          </button>
        }
      >
        <div className="space-y-2">
          <div>
            <FieldLabel htmlFor="browser-url">Page URL (allowlist: 127.0.0.1 / localhost)</FieldLabel>
            <input
              id="browser-url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5')}
            />
          </div>
          <div>
            <FieldLabel htmlFor="browser-elements">Interactive accessibility elements (JSON array)</FieldLabel>
            <DarkTextarea value={elementsJson} onChange={setElementsJson} rows={8} ariaLabel="DOM elements JSON" />
          </div>
          <button
            type="button"
            onClick={() => void seed()}
            disabled={busy === 'seed'}
            className={cn(
              BTN_SECONDARY,
              'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-60',
            )}
          >
            {busy === 'seed' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
            Seed DOM state (revision++)
          </button>
          {state ? (
            <p className="font-mono text-[11px] text-ink-muted">
              live revision {state.livePageRevision} • active refs: {state.refIds.join(' ') || 'none'}
            </p>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard title="Agent-browser command loop">
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <FieldLabel htmlFor="browser-cmd">Command</FieldLabel>
              <select
                id="browser-cmd"
                value={commandType}
                onChange={(e) => setCommandType(e.target.value as AgentBrowserActionCommand['commandType'])}
                className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5')}
              >
                <option value="snapshot">snapshot -i</option>
                <option value="click">click</option>
                <option value="fill">fill</option>
                <option value="get_url">get_url</option>
                <option value="open">open</option>
                <option value="close">close</option>
              </select>
            </div>
            <div>
              <FieldLabel htmlFor="browser-ref">Target ref / URL</FieldLabel>
              <input
                id="browser-ref"
                value={targetRef}
                onChange={(e) => setTargetRef(e.target.value)}
                disabled={commandType === 'snapshot' || commandType === 'get_url' || commandType === 'close'}
                className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5 disabled:opacity-50')}
                placeholder="@e1"
              />
            </div>
          </div>
          {commandType === 'fill' ? (
            <div>
              <FieldLabel htmlFor="browser-value">Input value</FieldLabel>
              <input
                id="browser-value"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5')}
              />
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => void execute()}
            disabled={busy === 'exec'}
            className={cn(
              BTN_PRIMARY,
              'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-60',
            )}
          >
            {busy === 'exec' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
            Execute command
          </button>
        </div>
      </SectionCard>

      {log.length > 0 ? (
        <SectionCard title="Execution results (CSPRNG-wrapped output)">
          <div className="space-y-2">
            {log.map((entry, i) => (
              <div
                key={`${entry.result.csprngBoundaryNonce}-${i}`}
                className={cn(
                  'rounded-md border p-2',
                  entry.result.success ? 'border-signal-live/30 bg-signal-live/5' : 'border-signal-danger/30 bg-signal-danger/5',
                )}
              >
                <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold">
                  {entry.result.success ? (
                    <Check className="h-3 w-3 text-signal-live" />
                  ) : (
                    <X className="h-3 w-3 text-signal-danger" />
                  )}
                  <span className={entry.result.success ? 'text-signal-live' : 'text-signal-danger'}>
                    {entry.command.commandType}
                    {entry.command.targetRefOrUrl ? ` ${entry.command.targetRefOrUrl}` : ''}
                  </span>
                  <span className="ml-auto font-mono text-[11px] text-ink-muted">
                    {entry.result.executionLatencyMs}ms • nonce {entry.result.csprngBoundaryNonce.slice(0, 8)}…
                  </span>
                </div>
                {entry.result.loudFailureReason ? (
                  <p className="mb-1 text-[11px] font-medium text-signal-danger">{entry.result.loudFailureReason}</p>
                ) : null}
                <pre
                  className={cn(
                    'max-h-32 overflow-auto whitespace-pre-wrap rounded border border-wire bg-vault p-1.5 font-mono text-[11px] leading-relaxed text-ink-muted',
                    THIN_SCROLL,
                  )}
                >
                  {entry.result.wrappedSafeOutput}
                </pre>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* RUNTIME — Task 4 artifact verification                              */
/* ------------------------------------------------------------------ */

function RuntimeVerifier({
  sessionId,
  stagedArtifacts,
  onReInflateCcr,
  onDone,
}: {
  sessionId: string
  stagedArtifacts: StagedArtifact[]
  onReInflateCcr: (ccrId: string) => void
  onDone: () => void
}) {
  const { toast } = useToast()
  const [artifactId, setArtifactId] = React.useState('')
  const [running, setRunning] = React.useState(false)
  const [report, setReport] = React.useState<RuntimeVerificationReport | null>(null)

  React.useEffect(() => {
    if (!artifactId && stagedArtifacts.length > 0) {
      setArtifactId(stagedArtifacts[0].artifactId)
    }
  }, [stagedArtifacts, artifactId])

  const run = async () => {
    if (!artifactId) {
      toast({
        title: 'No staged artifact selected',
        description: 'Stage a DAG run first (Agent panel → Stage as DAG Edit), then verify it here.',
        variant: 'destructive',
        ...TOAST_DARK,
      })
      return
    }
    setRunning(true)
    setReport(null)
    try {
      const res = await apexpadApi.runRuntimeVerification({ sessionId, artifactId })
      setReport(res.report)
      onDone()
      toast({
        title: res.report.overallStatus === 'verified_ready_for_approval' ? 'Artifact verified' : 'Verification failed',
        description: `${res.report.verificationId} • type-check: ${res.report.typeCheckPassed ? 'pass' : 'fail'} • test gate: ${res.report.testGatePassed ? 'pass' : 'fail'}`,
        variant: res.report.overallStatus === 'verified_ready_for_approval' ? 'default' : 'destructive',
        ...TOAST_DARK,
      })
    } catch (err) {
      toast({
        title: 'Runtime verification failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
        ...TOAST_DARK,
      })
    } finally {
      setRunning(false)
    }
  }

  const selected = stagedArtifacts.find((a) => a.artifactId === artifactId)

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="Task 4 — staged artifact verification">
        <div className="space-y-2">
          <div>
            <FieldLabel htmlFor="verify-artifact">Staged artifact</FieldLabel>
            <select
              id="verify-artifact"
              value={artifactId}
              onChange={(e) => setArtifactId(e.target.value)}
              className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5')}
            >
              {stagedArtifacts.length === 0 ? (
                <option value="">— no staged artifacts yet —</option>
              ) : null}
              {stagedArtifacts.map((a) => (
                <option key={a.artifactId} value={a.artifactId}>
                  {a.artifactId} • {a.targetFilePath} • {a.status}
                </option>
              ))}
            </select>
          </div>
          {selected ? (
            <p className="font-mono text-[11px] text-ink-muted">
              required tests from blast radius: {selected.blastRadius.requiredTests.join(', ') || 'none'}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className={cn(
              BTN_PRIMARY,
              'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-60',
            )}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {running ? 'Running gates…' : 'Run Verification'}
          </button>
        </div>
      </SectionCard>

      {report ? (
        <SectionCard title={`Verification ${report.verificationId}`}>
          <div className="mb-3 flex flex-wrap gap-1.5">
            <GateBadge
              ok={report.overallStatus === 'verified_ready_for_approval'}
              label={report.overallStatus === 'verified_ready_for_approval' ? 'Verified — ready for approval' : 'Failed verification'}
            />
            <GateBadge ok={report.typeCheckPassed} label={report.typeCheckPassed ? 'tsc gate pass' : 'tsc gate fail'} />
            <GateBadge ok={report.testGatePassed} label={report.testGatePassed ? 'test gate pass' : 'test gate fail'} />
          </div>

          <div className="space-y-3">
            <div>
              <TinyLabel className="mb-1">Type-check diagnostics (real tsc engine)</TinyLabel>
              <EvidenceList
                items={report.typeCheckDiagnostics}
                tone={report.typeCheckPassed ? 'green' : 'red'}
                emptyText="No diagnostics — the candidate type-checks cleanly in the sandbox program."
              />
            </div>
            <div>
              <TinyLabel className="mb-1">Test gate (existence • syntax • imports • symbol binding)</TinyLabel>
              <p className="font-mono text-[11px] text-ink-muted">
                executed: {report.executedTestFiles.join(', ') || 'none required by blast radius'}
              </p>
              {report.testRunnerOutputCcrId ? (
                <button
                  type="button"
                  onClick={() => onReInflateCcr(report.testRunnerOutputCcrId as string)}
                  className="mt-1 rounded-md border border-wire bg-receipt px-2 py-0.5 text-[11px] text-signal-info hover:bg-wire"
                >
                  Re-inflate gate log {report.testRunnerOutputCcrId}
                </button>
              ) : null}
            </div>
            {report.agentBrowserResults.length > 0 ? (
              <div>
                <TinyLabel className="mb-1">Agent-browser loop ({report.agentBrowserResults.length} commands)</TinyLabel>
                <ul className="space-y-1">
                  {report.agentBrowserResults.map((r, i) => (
                    <li key={i} className="flex items-center gap-1.5 text-[11px]">
                      {r.success ? (
                        <Check className="h-3 w-3 shrink-0 text-signal-live" />
                      ) : (
                        <X className="h-3 w-3 shrink-0 text-signal-danger" />
                      )}
                      <span className="font-mono text-ink-muted">
                        {r.command.commandType}
                        {r.command.targetRefOrUrl ? ` ${r.command.targetRefOrUrl}` : ''}
                        {r.loudFailureReason ? ` — ${r.loudFailureReason}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {/* PHASE 10 (GAP #3): real subprocess + CDP telemetry */}
            {report.compilerTrace || report.testRunnerTrace || report.cdpProbe ? (
              <div className="rounded-md border border-wire bg-vault p-2">
                <TinyLabel className="mb-1.5">
                  Phase 10 subprocess telemetry (real child_process + CDP)
                </TinyLabel>
                <div className="space-y-2">
                  {report.compilerTrace ? (
                    <div className="flex items-start gap-1.5">
                      <TerminalSquare className="mt-0.5 h-3 w-3 shrink-0 text-signal-info" />
                      <div className="min-w-0 font-mono text-[11px] leading-relaxed text-ink-muted">
                        <p className="break-all">
                          compiler: <span className="text-signal-info">{report.compilerTrace.command}</span>
                        </p>
                        <p>
                          exitCode:{' '}
                          <span className={report.compilerTrace.exitCode === 0 ? 'text-signal-live' : 'text-signal-danger'}>
                            {report.compilerTrace.exitCode}
                          </span>{' '}
                          • {report.compilerTrace.durationMs}ms
                          {report.compilerTrace.ccrId ? ` • CCR ${report.compilerTrace.ccrId}` : ''}
                        </p>
                        {report.compilerTrace.stderrTail ? (
                          <p className="whitespace-pre-wrap break-all text-signal-gate">
                            {report.compilerTrace.stderrTail.slice(0, 300)}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {report.testRunnerTrace ? (
                    <div className="flex items-start gap-1.5">
                      <TerminalSquare className="mt-0.5 h-3 w-3 shrink-0 text-signal-live" />
                      <div className="min-w-0 font-mono text-[11px] leading-relaxed text-ink-muted">
                        <p className="break-all">
                          test runner: <span className="text-signal-live">{report.testRunnerTrace.command}</span>
                        </p>
                        <p>
                          exitCode:{' '}
                          <span className={report.testRunnerTrace.exitCode === 0 ? 'text-signal-live' : 'text-signal-danger'}>
                            {report.testRunnerTrace.exitCode}
                          </span>{' '}
                          • {report.testRunnerTrace.durationMs}ms
                          {report.testRunnerTrace.ccrId ? ` • CCR ${report.testRunnerTrace.ccrId}` : ''}
                        </p>
                        {report.testRunnerTrace.stdoutTail ? (
                          <p className="whitespace-pre-wrap break-all">{report.testRunnerTrace.stdoutTail.slice(0, 300)}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="font-mono text-[11px] text-ink-muted">
                      test runner: deterministic ripwire gate (no workspace-indexed test files to execute)
                    </p>
                  )}
                  {report.cdpProbe ? (
                    <div className="flex items-start gap-1.5">
                      <Globe className="mt-0.5 h-3 w-3 shrink-0 text-signal-memory" />
                      <div className="min-w-0 font-mono text-[11px] leading-relaxed text-ink-muted">
                        <p>
                          CDP probe: <span className="text-signal-memory">{report.cdpProbe.endpoint}</span> —{' '}
                          <span className={report.cdpProbe.reachable ? 'text-signal-live' : 'text-signal-gate'}>
                            {report.cdpProbe.reachable ? `reachable, ${report.cdpProbe.targetCount} target(s)` : 'unreachable (deterministic RefMap fallback)'}
                          </span>
                          {report.cdpProbe.error ? ` • ${report.cdpProbe.error}` : ''}
                        </p>
                        {report.cdpProbe.activePageUrl ? (
                          <p className="break-all">active page: {report.cdpProbe.activePageUrl}</p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* PIPELINE — §7.6 unified runner                                      */
/* ------------------------------------------------------------------ */

interface EditableEdit {
  targetFilePath: string
  previousContent: string
  proposedContent: string
}

function PipelineRunner({
  sessionId,
  envelope,
  onDone,
}: {
  sessionId: string
  envelope: PackedContextEnvelope | null
  onDone: () => void
}) {
  const { toast } = useToast()
  const [prompt, setPrompt] = React.useState(PIPELINE_DEMO_PROMPT)
  const [budget, setBudget] = React.useState(12000)
  const [strictQuarantine, setStrictQuarantine] = React.useState(true)
  const [edits, setEdits] = React.useState<EditableEdit[]>([
    {
      targetFilePath: 'src/service/user.ts',
      previousContent: SERVICE_DEMO_PREVIOUS,
      proposedContent: SERVICE_DEMO_PROPOSED,
    },
    {
      targetFilePath: GUARD_DEMO_FILE,
      previousContent: GUARD_DEMO_PREVIOUS,
      proposedContent: GUARD_DEMO_PROPOSED,
    },
  ])
  const [running, setRunning] = React.useState(false)
  const [result, setResult] = React.useState<FullApexPipelineResult | null>(null)

  React.useEffect(() => {
    if (envelope?.tokenBudgetCeiling) {
      setBudget((prev) => (prev === 12000 ? envelope.tokenBudgetCeiling : prev))
    }
  }, [envelope])

  const updateEdit = (idx: number, patch: Partial<EditableEdit>) => {
    setEdits((prev) => prev.map((e, i) => (i === idx ? { ...e, ...patch } : e)))
  }

  const run = async () => {
    if (!prompt.trim()) {
      toast({
        title: 'Prompt required',
        description: 'The pipeline compiles the raw prompt into the Spec Contract.',
        variant: 'destructive',
        ...TOAST_DARK,
      })
      return
    }
    setRunning(true)
    setResult(null)
    try {
      const res = await apexpadApi.runFullPipeline({
        sessionId,
        rawUserPrompt: prompt,
        tokenBudgetCeiling: budget,
        candidateEdits: edits,
        strictQuarantineGate: strictQuarantine,
      })
      setResult(res.result)
      onDone()
      toast({
        title: res.result.pipelineBlockedByQuarantine
          ? `Quarantine gate blocked ${res.result.quarantinedEdits.length} edit(s)`
          : '4-stage pipeline complete',
        description: res.result.pipelineBlockedByQuarantine
          ? `${res.result.quarantinedEdits.map((q) => q.targetFilePath).join(', ')} never reached staging — blocking reasons recorded.`
          : `${res.result.specContract.specId} • ${res.result.guardrailReports.length} guardrail report(s) • ${res.result.dagState.status} • ${res.result.verificationReports.filter((v) => v.overallStatus === 'verified_ready_for_approval').length}/${res.result.verificationReports.length} verified`,
        variant: res.result.pipelineBlockedByQuarantine || res.result.dagState.status === 'halted_on_violation' ? 'destructive' : 'default',
        ...TOAST_DARK,
      })
    } catch (err) {
      toast({
        title: 'Pipeline run failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
        ...TOAST_DARK,
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard
        title="§7.6 — unified 4-stage engineering pipeline"
        action={
          <button
            type="button"
            onClick={() => {
              setPrompt(PIPELINE_DEMO_PROMPT)
              setEdits([
                {
                  targetFilePath: 'src/service/user.ts',
                  previousContent: SERVICE_DEMO_PREVIOUS,
                  proposedContent: SERVICE_DEMO_PROPOSED,
                },
                {
                  targetFilePath: GUARD_DEMO_FILE,
                  previousContent: GUARD_DEMO_PREVIOUS,
                  proposedContent: GUARD_DEMO_PROPOSED,
                },
              ])
              setResult(null)
            }}
            className="inline-flex items-center gap-1 rounded-md border border-wire bg-receipt px-2 py-1 text-[11px] text-ink-muted hover:text-ink-strong"
          >
            <RotateCcw className="h-3 w-3" /> Demo
          </button>
        }
      >
        <div className="space-y-2">
          <div>
            <FieldLabel htmlFor="pipeline-prompt">Raw user prompt (Task 2 input)</FieldLabel>
            <DarkTextarea value={prompt} onChange={setPrompt} rows={3} ariaLabel="Pipeline prompt" mono={false} />
          </div>
          <div>
            <FieldLabel htmlFor="pipeline-budget">Token budget ceiling</FieldLabel>
            <input
              id="pipeline-budget"
              type="number"
              min={1000}
              max={100000}
              value={budget}
              name="apexpad-pipeline-budget"
              onChange={(e) => setBudget(Number(e.target.value) || 12000)}
              className={cn(INPUT_DARK, 'w-full rounded-md border px-2 py-1.5 tabular-nums')}
            />
          </div>
          {/* PHASE 10 (GAP #2): strict pre-staging quarantine gate toggle */}
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-wire bg-vault px-2 py-2">
            <input
              type="checkbox"
              checked={strictQuarantine}
              onChange={(e) => setStrictQuarantine(e.target.checked)}
              className="h-3.5 w-3.5 accent-signal-danger"
            />
            <span className="font-mono text-[11px] text-ink">
              Strict quarantine gate — failing edits are hard-blocked before staging
            </span>
          </label>
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className={cn(
              BTN_PRIMARY,
              'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-60',
            )}
          >
            {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Running 4 stages…' : 'Run Full Pipeline'}
          </button>
        </div>
      </SectionCard>

      <SectionCard title={`Candidate edits (${edits.length})`}>
        <div className="space-y-3">
          {edits.map((edit, idx) => (
            <div key={idx} className="rounded-md border border-wire bg-vault p-2">
              <div className="mb-1.5 flex items-center gap-2">
                <span className="font-mono text-[11px] text-signal-info">edit #{idx + 1}</span>
                <input
                  value={edit.targetFilePath}
                  onChange={(e) => updateEdit(idx, { targetFilePath: e.target.value })}
                  aria-label={`Edit ${idx + 1} target file path`}
                  className={cn(INPUT_DARK, 'flex-1 rounded border px-2 py-1 text-[11px]')}
                />
                {edits.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove edit ${idx + 1}`}
                    onClick={() => setEdits((prev) => prev.filter((_, i) => i !== idx))}
                    className="rounded p-1 text-ink-muted hover:text-signal-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <FieldLabel>previous</FieldLabel>
              <DarkTextarea
                value={edit.previousContent}
                onChange={(v) => updateEdit(idx, { previousContent: v })}
                rows={4}
                ariaLabel={`Edit ${idx + 1} previous content`}
              />
              <div className="mt-1.5">
                <FieldLabel>proposed</FieldLabel>
                <DarkTextarea
                  value={edit.proposedContent}
                  onChange={(v) => updateEdit(idx, { proposedContent: v })}
                  rows={4}
                  ariaLabel={`Edit ${idx + 1} proposed content`}
                />
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setEdits((prev) => [...prev, { targetFilePath: '', previousContent: '', proposedContent: '' }])
            }
            className={cn(
              BTN_SECONDARY,
              'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 text-xs',
            )}
          >
            <Plus className="h-3.5 w-3.5" /> Add candidate edit
          </button>
        </div>
      </SectionCard>

      {result ? (
        <>
          {result.pipelineBlockedByQuarantine ? (
            <SectionCard title="PHASE 10 — HARD QUARANTINE GATE (blocked before staging)">
              <div className="space-y-2">
                {result.quarantinedEdits.map((q) => (
                  <div
                    key={q.quarantineId}
                    className="rounded-md border border-signal-danger/50 bg-signal-danger/5 p-2"
                  >
                    <div className="mb-1 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-signal-danger" />
                      <span className="break-all font-mono text-[11px] font-bold text-signal-danger">
                        {q.targetFilePath}
                      </span>
                    </div>
                    <ul className="space-y-0.5">
                      {q.blockingReasons.map((reason, i) => (
                        <li key={i} className="font-mono text-[11px] leading-relaxed text-signal-danger/90">
                          ⚠ {reason}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 font-mono text-[11px] text-ink-muted">
                      quarantined {dateTimeFmt.format(new Date(q.quarantinedAt))} — persisted to
                      quarantined_edits; NEVER staged.
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title="Stage 1 — Specification Contract (Task 2)">
            <div className="space-y-1 font-mono text-[11px] text-ink-muted">
              <p>
                <span className="text-signal-info">{result.specContract.specId}</span> • split:{' '}
                {String(result.specContract.isOverloadedPromptSplit)} • complexity:{' '}
                {result.specContract.estimatedReasoningComplexity} • subtasks:{' '}
                {result.specContract.subtaskDag.length}
              </p>
              <p className="whitespace-pre-wrap break-words">{result.specContract.normalizedGoal}</p>
              <div className="mt-1">
                <TinyLabel className="mb-1">Injected implicit constraints</TinyLabel>
                <EvidenceList items={result.specContract.injectedImplicitConstraints} tone="blue" />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Stage 2 — Guardrails (Task 3)">
            <div className="space-y-2">
              {result.guardrailReports.map((g) => (
                <div key={g.guardId} className="rounded-md border border-wire p-2">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-signal-info">{g.targetFilePath}</span>
                    <GateBadge ok={g.passedAllGates} label={g.passedAllGates ? 'pass' : 'fail'} />
                    {g.wasAutoHealed ? <GateBadge ok label={`healed (+${g.missingSymbolsRecovered.length})`} warn /> : null}
                  </div>
                  <EvidenceList items={g.hallucinatedImports} tone="red" />
                  <EvidenceList items={g.sycophancyWarnings} tone="yellow" />
                </div>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Stage 3 — DAG Staging (Task 1)">
            <div className="space-y-1 font-mono text-[11px] text-ink-muted">
              <p>
                <span className="text-signal-info">{result.dagState.runId}</span> • status:{' '}
                <span
                  className={
                    result.dagState.status === 'halted_on_violation' ? 'text-signal-danger' : 'text-signal-live'
                  }
                >
                  {result.dagState.status}
                </span>{' '}
                • staged artifacts: {result.dagState.stagedArtifacts.length}
              </p>
              <p>planner subtasks: {result.dagState.plannerSubtasks.length} • research findings: {result.dagState.researchFindings.length}</p>
            </div>
          </SectionCard>

          <SectionCard title="Stage 4 — Runtime Verification (Task 4)">
            <div className="space-y-2">
              {result.verificationReports.map((v) => (
                <div key={v.verificationId} className="rounded-md border border-wire p-2">
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-signal-info">{v.targetFilePath}</span>
                    <GateBadge
                      ok={v.overallStatus === 'verified_ready_for_approval'}
                      label={v.overallStatus === 'verified_ready_for_approval' ? 'verified' : 'failed'}
                    />
                    <GateBadge ok={v.typeCheckPassed} label={v.typeCheckPassed ? 'tsc ✓' : 'tsc ✗'} />
                    <GateBadge ok={v.testGatePassed} label={v.testGatePassed ? 'tests ✓' : 'tests ✗'} />
                  </div>
                  <EvidenceList items={v.typeCheckDiagnostics} tone={v.typeCheckPassed ? 'green' : 'red'} />
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* SUITE — §7.7 verification suite                                     */
/* ------------------------------------------------------------------ */

function SuiteRunner() {
  const { toast } = useToast()
  const [running, setRunning] = React.useState(false)
  const [run, setRun] = React.useState<E2eSuiteRunReport | null>(null)

  const execute = async () => {
    setRunning(true)
    setRun(null)
    try {
      const res = await apexpadApi.runE2eSuite()
      setRun(res.run)
      toast({
        title: res.run.allPassed ? 'E2E suite: ALL GREEN' : 'E2E suite: failures detected',
        description: `${res.run.runId} • ${res.run.scenarios.length} scenarios • ${res.run.durationMs}ms`,
        variant: res.run.allPassed ? 'default' : 'destructive',
        ...TOAST_DARK,
      })
    } catch (err) {
      toast({
        title: 'Suite execution failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
        ...TOAST_DARK,
      })
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <SectionCard title="§7.7 — End-to-End Verification Suite (Tasks 2, 3, 4)">
        <p className="mb-3 text-[11px] leading-relaxed text-ink-muted">
          Executes the blueprint’s three behavioral invariants live against the engine, inside the
          isolated <span className="font-mono text-signal-info">apexpad-tasks-234-test</span> project:
          overloaded prompt decomposition + DNA injection, anti-truncation splicing + hallucinated
          import blocking + premise critique, and the Agent-Browser @e1 RefMap loop with loud
          failures and CSPRNG boundaries.
        </p>
        <button
          type="button"
          onClick={() => void execute()}
          disabled={running}
          className={cn(
            BTN_PRIMARY,
            'inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 text-xs font-semibold disabled:opacity-60',
          )}
        >
          {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
          {running ? 'Running suite…' : 'Run E2E Verification Suite'}
        </button>
      </SectionCard>

      {run ? (
        <>
          <div className="flex items-center justify-between rounded-md border border-wire bg-vault px-3 py-2">
            <span className="font-mono text-[11px] text-ink-muted">
              run {run.runId} • {run.durationMs}ms
            </span>
            <GateBadge ok={run.allPassed} label={run.allPassed ? 'all scenarios green' : 'failures present'} />
          </div>
          {run.scenarios.map((scenario) => (
            <SectionCard key={scenario.scenarioId} title={scenario.scenarioId}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium text-ink">{scenario.title}</p>
                <GateBadge ok={scenario.passed} label={scenario.passed ? 'pass' : 'fail'} />
              </div>
              <ul className="space-y-1.5">
                {scenario.assertions.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    {a.passed ? (
                      <Check className="mt-0.5 h-3 w-3 shrink-0 text-signal-live" />
                    ) : (
                      <X className="mt-0.5 h-3 w-3 shrink-0 text-signal-danger" />
                    )}
                    <div className="min-w-0">
                      <p className="text-[11px] text-ink">{a.name}</p>
                      <p className="break-words font-mono text-[11px] leading-relaxed text-ink-muted">
                        {a.evidence}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 font-mono text-[11px] text-ink-muted">
                {scenario.assertions.filter((a) => a.passed).length}/{scenario.assertions.length} assertions •{' '}
                {scenario.durationMs}ms
              </p>
            </SectionCard>
          ))}
        </>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

export type VerifierSubTab = 'suite' | 'guard' | 'browser' | 'runtime' | 'pipeline'

export function VerificationPanel({
  sessionId,
  stagedArtifacts,
  envelope,
  onReInflateCcr,
  onRefreshTelemetry,
}: {
  sessionId: string
  stagedArtifacts: StagedArtifact[]
  envelope: PackedContextEnvelope | null
  onReInflateCcr: (ccrId: string) => void
  onRefreshTelemetry: () => void
}) {
  const [subTab, setSubTab] = React.useState<VerifierSubTab>('suite')

  const subTabs: { id: VerifierSubTab; label: string }[] = [
    { id: 'suite', label: 'Suite' },
    { id: 'guard', label: 'Guard' },
    { id: 'browser', label: 'Browser' },
    { id: 'runtime', label: 'Runtime' },
    { id: 'pipeline', label: 'Pipeline' },
  ]

  return (
    <div className="flex flex-col gap-3" role="region" aria-label="Verifier panel">
      <TabStrip
        idPrefix="verifier"
        ariaLabel="Verifier sub-tabs"
        items={subTabs.map((t) => ({ id: t.id, label: t.label }))}
        active={subTab}
        onChange={(id) => setSubTab(id as typeof subTab)}
        className="rounded-md border border-wire bg-vault p-1 [&>button]:flex-1 [&>button]:rounded-md [&>button]:border-b-0"
      />
      <div
        role="tabpanel"
        id={`verifier-panel-${subTab}`}
        aria-labelledby={`verifier-tab-${subTab}`}
        className="flex flex-col gap-3"
      >

      {subTab === 'suite' ? <SuiteRunner /> : null}
      {subTab === 'guard' ? (
        <GuardrailsInspector sessionId={sessionId} onDone={onRefreshTelemetry} />
      ) : null}
      {subTab === 'browser' ? <BrowserConsole sessionId={sessionId} /> : null}
      {subTab === 'runtime' ? (
        <RuntimeVerifier
          sessionId={sessionId}
          stagedArtifacts={stagedArtifacts}
          onReInflateCcr={onReInflateCcr}
          onDone={onRefreshTelemetry}
        />
      ) : null}
      {subTab === 'pipeline' ? (
        <PipelineRunner sessionId={sessionId} envelope={envelope} onDone={onRefreshTelemetry} />
      ) : null}
      </div>
    </div>
  )
}
