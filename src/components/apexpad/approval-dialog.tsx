'use client'

/**
 * src/components/apexpad/approval-dialog.tsx
 * The human decision moment (DESIGN_AUDIT P1-4): Approve & Commit and
 * Reject now pass through a confirmation sheet that shows the blast
 * radius, diff stats, the .bak safety net — and collects an optional
 * reviewer note (required on reject), which the pipeline already stores.
 */

import * as React from 'react'
import { CheckCircle2, Loader2, ShieldAlert, Square, Undo2 } from 'lucide-react'

import type { StagedArtifact } from '@/lib/apexpad-types'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { BTN_DANGER, BTN_PRIMARY, THIN_SCROLL, TinyLabel } from './ui-kit'
import { DiffView } from './ui-kit'
import { cn } from '@/lib/utils'

/** Additions/deletions from a unified diff (ignoring +++/--- headers). */
function diffStats(diff: string): { additions: number; deletions: number } {
  let additions = 0
  let deletions = 0
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue
    if (line.startsWith('+')) additions += 1
    else if (line.startsWith('-')) deletions += 1
  }
  return { additions, deletions }
}

export function ApprovalDialog({
  open,
  onOpenChange,
  artifact,
  mode,
  busy,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  artifact: StagedArtifact | null
  mode: 'approve' | 'reject'
  busy: boolean
  onConfirm: (artifactId: string, approved: boolean, reviewerNote?: string) => void
}) {
  const [note, setNote] = React.useState('')
  const [noteError, setNoteError] = React.useState<string | null>(null)

  /* Fresh decision → fresh form. */
  React.useEffect(() => {
    if (open) {
      setNote('')
      setNoteError(null)
    }
  }, [open, artifact?.artifactId, mode])

  if (!artifact) return null
  const approving = mode === 'approve'
  const stats = diffStats(artifact.unifiedDiff)

  const submit = () => {
    if (!approving && !note.trim()) {
      setNoteError('A rejection reason is required — the pipeline stores it with the verdict.')
      return
    }
    setNoteError(null)
    onConfirm(artifact.artifactId, approving, note.trim() || undefined)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (busy ? undefined : onOpenChange(next))}>
      <DialogContent
        className="flex max-h-[85vh] flex-col gap-0 overflow-hidden border-wire bg-vault-1 p-4"
        aria-describedby={undefined}
      >
        <DialogHeader className="mb-3 space-y-0">
          <DialogTitle className="flex items-center gap-2 font-mono text-sm font-bold text-ink-strong">
            {approving ? (
              <CheckCircle2 className="h-4 w-4 text-signal-live" aria-hidden />
            ) : (
              <Square className="h-4 w-4 text-signal-danger" aria-hidden />
            )}
            {approving ? 'Approve & Commit to disk' : 'Reject staged artifact'}
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {/* What */}
          <div>
            <TinyLabel>Target file</TinyLabel>
            <p className="mt-1 break-all font-mono text-xs font-bold text-ink-strong">
              {artifact.targetFilePath}
            </p>
          </div>

          {/* Diff stats */}
          <div className="flex flex-wrap items-center gap-3 font-mono text-xs tabular-nums">
            <span className="text-signal-live">+{stats.additions} added</span>
            <span className="text-signal-danger">−{stats.deletions} removed</span>
            <span className="text-ink-muted">
              {stats.additions + stats.deletions} changed lines
            </span>
          </div>

          {/* Blast radius */}
          <div>
            <TinyLabel>Blast radius</TinyLabel>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-ink tabular-nums">
              <span>
                direct callers:{' '}
                <span className="text-ink-strong">{artifact.blastRadius.directCallers.length}</span>
              </span>
              <span>
                transitive:{' '}
                <span className="text-ink-strong">
                  {artifact.blastRadius.transitiveCallers.length}
                </span>
              </span>
              <span>
                CX delta:{' '}
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
              </span>
            </div>
            {artifact.blastRadius.architectureViolations.length > 0 ? (
              <div className="mt-2 space-y-1">
                {artifact.blastRadius.architectureViolations.map((violation, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1.5 rounded border border-signal-danger/40 bg-signal-danger/10 px-2 py-1 font-mono text-[11px] text-signal-danger"
                  >
                    <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                    <span>{violation}</span>
                  </div>
                ))}
              </div>
            ) : null}
            {artifact.blastRadius.requiredTests.length > 0 ? (
              <p className="mt-1.5 font-mono text-[11px] text-ink-muted">
                required tests: {artifact.blastRadius.requiredTests.join(', ')}
              </p>
            ) : null}
          </div>

          {/* The diff */}
          <div>
            <TinyLabel className="mb-1">Unified diff</TinyLabel>
            <DiffView
              diff={artifact.unifiedDiff}
              className="max-h-56 overflow-y-auto"
            />
          </div>

          {/* Reviewer note */}
          <div>
            <label
              htmlFor="reviewer-note"
              className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted"
            >
              Reviewer note{' '}
              {approving ? (
                <span className="normal-case tracking-normal text-ink-ghost">(optional)</span>
              ) : (
                <span className="normal-case tracking-normal text-signal-danger">(required)</span>
              )}
            </label>
            <textarea
              id="reviewer-note"
              name="apexpad-reviewer-note"
              value={note}
              onChange={(e) => {
                setNote(e.target.value)
                if (noteError) setNoteError(null)
              }}
              rows={2}
              aria-invalid={noteError ? true : undefined}
              aria-describedby={noteError ? 'reviewer-note-error' : undefined}
              placeholder={
                approving
                  ? 'Why this edit is safe to commit…'
                  : 'Why this edit is being rejected…'
              }
              className={cn(
                'mt-1 w-full resize-none rounded-md border bg-well px-2 py-2 font-mono text-xs text-ink-strong placeholder:text-ink-muted focus-visible:ring-2 focus-visible:ring-wire-focus',
                noteError ? 'border-signal-danger/60' : 'border-wire',
                THIN_SCROLL,
              )}
            />
            {noteError ? (
              <p id="reviewer-note-error" className="mt-1 text-[11px] text-signal-danger">
                {noteError}
              </p>
            ) : null}
          </div>

          {/* Safety net — advertised BEFORE the write, not after */}
          {approving ? (
            <div className="flex items-start gap-2 rounded-md border border-action-hover/40 bg-action/10 px-2.5 py-2">
              <Undo2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-live" aria-hidden />
              <p className="font-mono text-[11px] leading-relaxed text-ink">
                A backup is written to{' '}
                <span className="text-signal-live">.apexpad-backups/{artifact.artifactId}.bak</span>{' '}
                before the atomic commit — 1-click rollback stays available afterwards.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-wire bg-vault px-2.5 py-2">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
              <p className="font-mono text-[11px] leading-relaxed text-ink-muted">
                Disk is untouched on reject — the artifact returns to staging history with your
                note attached.
              </p>
            </div>
          )}
        </div>

        <div className="mt-3 flex shrink-0 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={submit}
            className={cn(
              'inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus disabled:opacity-60',
              approving ? BTN_PRIMARY : BTN_DANGER,
            )}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : approving ? (
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <Square className="h-3.5 w-3.5" aria-hidden />
            )}
            {approving ? 'Confirm — Approve & Commit' : 'Confirm — Reject'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className={cn(
              'inline-flex min-h-[44px] items-center justify-center rounded-md border border-wire bg-receipt px-4 py-2 text-xs font-medium text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus hover:bg-receipt-hover hover:text-ink-strong disabled:opacity-60',
            )}
          >
            Cancel
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
