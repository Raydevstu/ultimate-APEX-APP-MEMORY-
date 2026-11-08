'use client'

/**
 * src/components/apexpad/header.tsx
 * Top bar: logo mark, project slug, PHASE 10 "Saved locally" disk persistence
 * button, live telemetry chips, SSE status.
 */
import {
  Zap,
  Settings2,
  ArrowLeftRight,
  Save,
  HardDriveDownload,
  Dna,
  Database,
  Eye,
  Loader2,
} from 'lucide-react'

import type { DashboardTelemetrySnapshot, SdkSession } from '@/lib/apexpad-types'
import { cn } from '@/lib/utils'
import { APEXPAD_PROJECT_SLUG, APEXPAD_VERSION } from './constants'
import { Chip, StatusDot, TinyLabel } from './ui-kit'

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
      <span className={cn('inline-flex', iconClass)}>{icon}</span>
      <span className="font-mono text-[#e6edf3]">{value ?? '—'}</span>
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
}: {
  telemetry: DashboardTelemetrySnapshot | null
  session: SdkSession | null
  sseConnected: boolean
  booting: boolean
  /** PHASE 10 (GAP #4): receipt of the last real disk write, null when never saved. */
  savedLocally: { savedAt: string; byteLength: number; sha256: string } | null
  savingToDisk: boolean
  onSaveToDisk: () => void
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-[#30363d] bg-[#161b22] px-4 py-2.5">
      {/* left: brand */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-[#30363d] bg-[#0d1117] shadow-[0_0_12px_rgba(88,166,255,0.15)]">
          <Zap className="h-4 w-4 text-[#58a6ff]" />
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-sm font-bold tracking-tight text-[#e6edf3]">
            ApexPad
          </span>
          <span className="rounded border border-[#1f6feb]/40 bg-[#1f6feb]/15 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#79c0ff]">
            {APEXPAD_VERSION}
          </span>
          <span className="hidden font-mono text-[11px] text-[#8b949e] md:inline">
            {APEXPAD_PROJECT_SLUG}
          </span>
        </div>
        {session ? (
          <Chip
            title={`Session started ${session.startedAt}`}
            className="hidden font-mono lg:inline-flex"
          >
            {session.sessionId}
          </Chip>
        ) : null}
      </div>

      {/* right: telemetry + sse */}
      <div className="flex flex-wrap items-center gap-1.5">
        {/* PHASE 10 (GAP #4): real disk persistence — "Saved locally" */}
        <button
          type="button"
          onClick={onSaveToDisk}
          disabled={savingToDisk || booting}
          title={
            savedLocally
              ? `Last disk write: ${new Date(savedLocally.savedAt).toLocaleTimeString()} • ${savedLocally.byteLength} B • sha ${savedLocally.sha256.slice(0, 10)}…`
              : 'Persist the active document to the workspace disk (.apexpad-workspace)'
          }
          className={cn(
            'inline-flex min-h-[32px] items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold transition-colors disabled:opacity-60',
            savedLocally
              ? 'border-[#2ea043]/60 bg-[#238636]/20 text-[#7ee787] hover:bg-[#238636]/30'
              : 'border-[#30363d] bg-[#21262d] text-[#8b949e] hover:text-[#e6edf3]',
          )}
        >
          {savingToDisk ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <HardDriveDownload className="h-3 w-3" />
          )}
          {savedLocally
            ? `Saved locally ${new Date(savedLocally.savedAt).toLocaleTimeString()}`
            : 'Save locally'}
        </button>

        {booting ? (
          <Chip className="px-2 py-1">
            <Loader2 className="h-3 w-3 animate-spin text-[#58a6ff]" />
            <span>booting…</span>
          </Chip>
        ) : (
          <>
            <TelemetryChip
              icon={<Settings2 className="h-3 w-3" />}
              iconClass="text-[#8b949e]"
              value={telemetry?.indexedAstSymbolsCount ?? null}
              label="symbols"
            />
            <TelemetryChip
              icon={<ArrowLeftRight className="h-3 w-3" />}
              iconClass="text-[#79c0ff]"
              value={telemetry?.indexedAstEdgesCount ?? null}
              label="edges"
            />
            <TelemetryChip
              icon={<Save className="h-3 w-3" />}
              iconClass="text-[#3fb950]"
              value={
                telemetry ? `${telemetry.netTokenSavingsPct}%` : null
              }
              label="tokens saved"
            />
            <TelemetryChip
              icon={<Dna className="h-3 w-3" />}
              iconClass="text-[#d2a8ff]"
              value={telemetry?.confirmedDnaRulesCount ?? null}
              label="DNA"
            />
            <TelemetryChip
              icon={<Database className="h-3 w-3" />}
              iconClass="text-[#d29922]"
              value={telemetry?.ccrBlocksStored ?? null}
              label="CCR"
            />
            <TelemetryChip
              icon={<Eye className="h-3 w-3" />}
              iconClass="text-[#f85149]"
              value={telemetry?.staleObservationsCount ?? null}
              label="stale"
            />
          </>
        )}

        <div className="ml-1 flex items-center gap-1.5 rounded-md border border-[#30363d] bg-[#161b22] px-2 py-1">
          <StatusDot connected={sseConnected} />
          <TinyLabel className="text-[#8b949e]">
            {sseConnected ? 'SSE live' : 'SSE off'}
          </TinyLabel>
        </div>
      </div>
    </header>
  )
}
