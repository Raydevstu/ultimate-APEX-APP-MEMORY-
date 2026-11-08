'use client'

/**
 * src/components/apexpad/header.tsx
 * Top bar: logo mark, project identity, real disk persistence ("Save
 * locally"), live telemetry, SSE status. Telemetry values are tabular-num
 * mono so live counters never jitter.
 */
import {
  ArrowLeftRight,
  BadgePercent,
  Braces,
  Dna,
  Database,
  Eye,
  HardDriveDownload,
  Loader2,
  Zap,
} from 'lucide-react'

import type { DashboardTelemetrySnapshot, SdkSession } from '@/lib/apexpad-types'
import { cn } from '@/lib/utils'
import { APEXPAD_PROJECT_SLUG, APEXPAD_VERSION } from './constants'
import { Chip, StatusDot, TinyLabel } from './ui-kit'

/** Locale-correct time via Intl (never hardcoded formats). */
const timeFmt = new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' })

function TelemetryChip({
  icon,
  value,
  label,
  iconClass,
}: {
  icon: React.ReactNode
  value: string | number | null
  label: string
  iconClass?: string
}) {
  return (
    <Chip className="px-2 py-1">
      <span className={cn('inline-flex', iconClass)} aria-hidden>
        {icon}
      </span>
      <span className="font-mono text-ink-strong">{value ?? '—'}</span>
      <span>{label}</span>
    </Chip>
  )
}

export function WorkbenchHeader({
  telemetry,
  session,
  sseConnected,
  booting,
  savedLocally,
  savingToDisk,
  onSaveToDisk,
  onOpenPalette,
}: {
  telemetry: DashboardTelemetrySnapshot | null
  session: SdkSession | null
  sseConnected: boolean
  booting: boolean
  /** PHASE 10 (GAP #4): receipt of the last real disk write, null when never saved. */
  savedLocally: { savedAt: string; byteLength: number; sha256: string } | null
  savingToDisk: boolean
  onSaveToDisk: () => void
  onOpenPalette: () => void
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-wire bg-vault-1 px-4 py-2.5">
      {/* left: brand — the single h1 of the app */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-wire bg-vault">
          <Zap className="h-4 w-4 text-signal-info" aria-hidden />
        </div>
        <h1 className="flex min-w-0 items-center gap-2 text-sm font-bold tracking-tight text-ink-strong">
          <span>ApexPad</span>
          <span className="rounded border border-signal-info/40 bg-signal-info/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-signal-info" translate="no">
            {APEXPAD_VERSION}
          </span>
          <span className="hidden font-mono text-[11px] font-normal text-ink-muted md:inline" translate="no">
            {APEXPAD_PROJECT_SLUG}
          </span>
        </h1>
        {session ? (
          <Chip
            title={`Session started ${session.startedAt}`}
            className="hidden font-mono lg:inline-flex"
          >
            {session.sessionId}
          </Chip>
        ) : null}
      </div>

      {/* right: command palette + telemetry + sse */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* ⌘K — keyboard layer discoverability */}
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Open command palette (Command K)"
          title="Command palette — ⌘K / Ctrl+K"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-wire bg-receipt px-2 py-1 font-mono text-[11px] text-ink-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus hover:bg-receipt-hover hover:text-ink-strong lg:min-h-0"
        >
          <span aria-hidden>⌘</span>
          <span>K</span>
        </button>

        {/* PHASE 10 (GAP #4): real disk persistence — "Save locally" */}
        <button
          type="button"
          onClick={onSaveToDisk}
          disabled={savingToDisk || booting}
          aria-label={
            savedLocally
              ? `Save locally — last disk write ${timeFmt.format(new Date(savedLocally.savedAt))}, ${savedLocally.byteLength} bytes, sha ${savedLocally.sha256.slice(0, 10)}`
              : 'Save locally — persist the active document to the workspace disk'
          }
          title={
            savedLocally
              ? `Last disk write: ${timeFmt.format(new Date(savedLocally.savedAt))} • ${savedLocally.byteLength} B • sha ${savedLocally.sha256.slice(0, 10)}…`
              : 'Persist the active document to the workspace disk (.apexpad-workspace)'
          }
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus disabled:opacity-60 lg:min-h-0',
            savedLocally
              ? 'border-action-hover/60 bg-action/20 text-signal-live hover:bg-action/30'
              : 'border-wire bg-receipt text-ink-muted hover:text-ink-strong',
          )}
        >
          {savingToDisk ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
          ) : (
            <HardDriveDownload className="h-3 w-3" aria-hidden />
          )}
          {savedLocally
            ? `Saved locally ${timeFmt.format(new Date(savedLocally.savedAt))}`
            : 'Save locally'}
        </button>

        {booting ? (
          <Chip className="px-2 py-1" role="status">
            <Loader2 className="h-3 w-3 animate-spin text-signal-info" aria-hidden />
            <span>Booting…</span>
          </Chip>
        ) : (
          <>
            <TelemetryChip
              icon={<Braces className="h-3 w-3" />}
              iconClass="text-ink-muted"
              value={telemetry?.indexedAstSymbolsCount ?? null}
              label="symbols"
            />
            <TelemetryChip
              icon={<ArrowLeftRight className="h-3 w-3" />}
              iconClass="text-signal-info"
              value={telemetry?.indexedAstEdgesCount ?? null}
              label="edges"
            />
            <TelemetryChip
              icon={<BadgePercent className="h-3 w-3" />}
              iconClass="text-signal-live"
              value={
                telemetry ? `${telemetry.netTokenSavingsPct}%` : null
              }
              label="tokens saved"
            />
            <TelemetryChip
              icon={<Dna className="h-3 w-3" />}
              iconClass="text-signal-memory"
              value={telemetry?.confirmedDnaRulesCount ?? null}
              label="DNA"
            />
            <TelemetryChip
              icon={<Database className="h-3 w-3" />}
              iconClass="text-signal-gate"
              value={telemetry?.ccrBlocksStored ?? null}
              label="CCR"
            />
            <TelemetryChip
              icon={<Eye className="h-3 w-3" />}
              iconClass="text-signal-danger"
              value={telemetry?.staleObservationsCount ?? null}
              label="stale"
            />
          </>
        )}

        <div
          className="ml-1 flex items-center gap-1.5 rounded-md border border-wire bg-vault-1 px-2 py-1"
          role="status"
          aria-live="polite"
          aria-label={sseConnected ? 'SSE live — realtime event stream connected' : 'SSE off — realtime event stream disconnected'}
        >
          <StatusDot connected={sseConnected} />
          <TinyLabel className="text-ink-muted">
            {sseConnected ? 'SSE live' : 'SSE off'}
          </TinyLabel>
        </div>
      </div>
    </header>
  )
}
