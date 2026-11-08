'use client'

/**
 * src/components/apexpad/dialogs.tsx
 * CCR re-inflate dialog, frozen-prefix dialog, Tier-2 full record dialog.
 */
import * as React from 'react'
import {
  Database,
  FileText,
  Gauge,
  Hash,
  Layers,
  Loader2,
  Repeat2,
  SearchX,
  Tag,
} from 'lucide-react'

import type {
  CcrRetrievalResult,
  ObservationRecord,
} from '@/lib/apexpad-types'
import { cn } from '@/lib/utils'
import { BTN_SECONDARY, Chip, CopyButton, THIN_SCROLL, TinyLabel } from './ui-kit'

/* --------------------------- generic dialog shell ------------------------- */

function DarkDialog({
  open,
  onOpenChange,
  children,
  wide,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
  wide?: boolean
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22] p-4 shadow-2xl',
          wide ? 'max-w-2xl' : 'max-w-lg',
        )}
      >
        {children}
      </div>
    </div>
  )
}

/* ------------------------------ CCR dialog ------------------------------- */

export function CcrDialog({
  open,
  ccrId,
  onClose,
}: {
  open: boolean
  ccrId: string | null
  onClose: () => void
}) {
  const [loading, setLoading] = React.useState(false)
  const [result, setResult] = React.useState<CcrRetrievalResult | null>(null)
  const [notFound, setNotFound] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open || !ccrId) return
    let cancelled = false
    setLoading(true)
    setNotFound(false)
    setError(null)
    setResult(null)

    const run = async () => {
      try {
        const res = await fetch('/api/apexpad/retrieve-ccr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ccrId }),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `HTTP ${res.status}`)
        }
        const data = (await res.json()) as CcrRetrievalResult | null
        if (cancelled) return
        if (data) setResult(data)
        else setNotFound(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [open, ccrId])

  return (
    <DarkDialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Repeat2 className="h-4 w-4 text-[#d29922]" />
          <span className="font-mono text-sm font-bold text-[#e6edf3]">
            CCR {ccrId ?? ''}
          </span>
        </div>
        <Chip className="font-mono text-[#d29922]">headroom compressed</Chip>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#8b949e]">
            <Loader2 className="h-4 w-4 animate-spin text-[#58a6ff]" />
            Re-inflating from CCR store…
          </div>
        ) : notFound ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-xs text-[#8b949e]">
            <SearchX className="h-5 w-5 text-[#d29922]" />
            CCR block not found — it may have been garbage-collected or never stored.
          </div>
        ) : error ? (
          <div className="rounded-md border border-[#f85149]/40 bg-[#f85149]/10 px-3 py-2 text-xs text-[#f85149]">
            {error}
          </div>
        ) : result ? (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              <Chip>
                <Hash className="h-2.5 w-2.5" />
                <span className="font-mono">{result.ccrId}</span>
              </Chip>
              <Chip>
                <Database className="h-2.5 w-2.5" />
                {result.sourceLabel}
              </Chip>
              <Chip>
                <Tag className="h-2.5 w-2.5" />
                {result.contentType}
              </Chip>
              <Chip>
                <Repeat2 className="h-2.5 w-2.5" />
                retrievals: {result.retrievalCount}
              </Chip>
              <Chip>
                <Gauge className="h-2.5 w-2.5" />
                TOIN score: {result.updatedValueScore.toFixed(2)}
              </Chip>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <TinyLabel>Uncompressed Slice</TinyLabel>
                <CopyButton text={result.uncompressedSlice} />
              </div>
              <pre
                className={cn(
                  'max-h-[40vh] overflow-auto whitespace-pre-wrap rounded-md border border-[#30363d] bg-[#0d1117] p-3 font-mono text-[11px] leading-relaxed text-[#c9d1d9]',
                  THIN_SCROLL,
                )}
              >
                {result.uncompressedSlice}
              </pre>
            </div>
          </div>
        ) : null}
      </div>

      <button
        type="button"
        onClick={onClose}
        className={cn('mt-3 shrink-0 rounded-md px-3 py-2 text-xs', BTN_SECONDARY)}
      >
        Close
      </button>
    </DarkDialog>
  )
}

/* --------------------------- frozen prefix dialog ------------------------- */

export function FrozenPrefixDialog({
  open,
  onOpenChange,
  frozenPrefix,
  frozenPrefixHash,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  frozenPrefix: string | null
  frozenPrefixHash: string | null
}) {
  return (
    <DarkDialog open={open} onOpenChange={onOpenChange} wide>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-[#7ee787]" />
          <span className="text-sm font-bold text-[#e6edf3]">Frozen Prefix</span>
        </div>
        {frozenPrefixHash ? (
          <Chip className="font-mono text-[#7ee787]">
            {frozenPrefixHash.slice(0, 12)} · KV-Cache Aligned
          </Chip>
        ) : null}
      </div>
      <pre
        className={cn(
          'min-h-0 flex-1 overflow-auto whitespace-pre-wrap rounded-md border border-[#30363d] bg-[#0d1117] p-3 font-mono text-[11px] leading-relaxed text-[#7ee787]',
          THIN_SCROLL,
        )}
      >
        {frozenPrefix || 'No frozen prefix available.'}
      </pre>
      <button
        type="button"
        onClick={() => onOpenChange(false)}
        className={cn('mt-3 shrink-0 rounded-md px-3 py-2 text-xs', BTN_SECONDARY)}
      >
        Close
      </button>
    </DarkDialog>
  )
}

/* ------------------------ tier-2 full record dialog ----------------------- */

function FullRecordCard({ record }: { record: ObservationRecord }) {
  return (
    <div className="rounded-md border border-[#30363d] bg-[#0d1117] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[#79c0ff]">{record.title}</span>
        <span className="font-mono text-[9px] text-[#8b949e]">
          ~{record.tokenEstimate} tok · {record.confirmationCount}x confirmed
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-[#8b949e]">{record.subtitle}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Chip className="font-mono text-[#3fb950]">scope: {record.scope}</Chip>
        <Chip className="font-mono text-[#3fb950]">category: {record.category}</Chip>
        {record.isStale ? (
          <Chip className="border-[#d29922]/50 bg-[#d29922]/10 text-[#d29922]">stale</Chip>
        ) : null}
      </div>

      <TinyLabel className="mt-3 mb-1">Narrative</TinyLabel>
      <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-[#c9d1d9]">
        {record.narrative}
      </p>

      {record.factsJson.length > 0 ? (
        <>
          <TinyLabel className="mt-3 mb-1">Facts</TinyLabel>
          <ul className="space-y-1">
            {record.factsJson.map((fact, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 font-mono text-[10px] leading-relaxed text-[#c9d1d9]"
              >
                <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-[#58a6ff]" />
                {fact}
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {record.referencedFiles.length > 0 || record.referencedSymbols.length > 0 ? (
        <>
          <TinyLabel className="mt-3 mb-1">References</TinyLabel>
          <div className="flex flex-wrap gap-1">
            {record.referencedFiles.map((file) => (
              <Chip key={file} className="font-mono text-[#79c0ff]">
                <FileText className="h-2.5 w-2.5" />
                {file}
              </Chip>
            ))}
            {record.referencedSymbols.map((symbol) => (
              <Chip key={symbol} className="font-mono text-[#d2a8ff]">
                ƒ {symbol}
              </Chip>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export function ObservationFullRecordDialog({
  open,
  records,
  loading,
  onClose,
}: {
  open: boolean
  records: ObservationRecord[]
  loading: boolean
  onClose: () => void
}) {
  return (
    <DarkDialog open={open} onOpenChange={(next) => (next ? undefined : onClose())} wide>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 text-[#d2a8ff]" />
          <span className="text-sm font-bold text-[#e6edf3]">
            Tier 2 — Full Observation Records
          </span>
        </div>
        {records.length > 0 ? (
          <Chip className="font-mono">{records.length} records</Chip>
        ) : null}
      </div>

      <div className={cn('min-h-0 flex-1 space-y-3 overflow-y-auto pr-1', THIN_SCROLL)}>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-[#8b949e]">
            <Loader2 className="h-4 w-4 animate-spin text-[#58a6ff]" />
            Loading full records…
          </div>
        ) : records.length === 0 ? (
          <div className="py-8 text-center text-xs text-[#8b949e]">
            No observation records returned for this timeline.
          </div>
        ) : (
          records.map((record) => <FullRecordCard key={record.id} record={record} />)
        )}
      </div>

      <button
        type="button"
        onClick={onClose}
        className={cn('mt-3 shrink-0 rounded-md px-3 py-2 text-xs', BTN_SECONDARY)}
      >
        Close
      </button>
    </DarkDialog>
  )
}
