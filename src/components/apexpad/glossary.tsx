'use client'

/**
 * src/components/apexpad/glossary.tsx
 * "Tier 0 for concepts" (DESIGN.md §13): every blueprint term gets a
 * one-line definition on hover/focus, and the full glossary dialog is one
 * click away. Jordan's on-ramp — jargon never appears unexplained.
 */
import * as React from 'react'
import { HelpCircle } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card'
import { GLOSSARY } from './constants'
import { TinyLabel } from './ui-kit'
import { cn } from '@/lib/utils'

/** Inline term with hover/focus definition card. */
export function Term({
  term,
  className,
  children,
}: {
  term: keyof typeof GLOSSARY | string
  className?: string
  /** Optional custom trigger text (defaults to the term itself). */
  children?: React.ReactNode
}) {
  const definition = GLOSSARY[term]
  if (!definition) return <>{children ?? term}</>
  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger
        type="button"
        aria-label={`${term} — show definition`}
        className={cn(
          'inline-flex cursor-help items-baseline gap-0.5 border-b border-dotted border-current/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus',
          className,
        )}
      >
        {children ?? term}
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-80 border-wire bg-vault-1 p-3 text-ink"
      >
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.14em] text-signal-memory">
          {term}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-ink">{definition}</p>
      </HoverCardContent>
    </HoverCard>
  )
}

/** Full glossary dialog — every term, alphabetized. */
export function GlossaryDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const entries = React.useMemo(
    () => Object.entries(GLOSSARY).sort(([a], [b]) => a.localeCompare(b)),
    [],
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden border-wire bg-vault-1">
        <DialogHeader className="space-y-0">
          <DialogTitle className="font-mono text-sm font-bold text-ink-strong">
            Blueprint Glossary
          </DialogTitle>
        </DialogHeader>
        <p className="mb-3 text-xs text-ink-muted">
          Every domain term the workbench uses, in one place. Hover any dotted-underlined
          term in the UI for its definition inline.
        </p>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 [scrollbar-width:thin]">
          {entries.map(([term, definition]) => (
            <div key={term} className="rounded-md border border-wire bg-vault p-3">
              <TinyLabel as="h3" className="text-signal-memory">
                {term}
              </TinyLabel>
              <p className="mt-1.5 text-xs leading-relaxed text-ink">{definition}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Header help button — opens the glossary. */
export function GlossaryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open blueprint glossary"
      title="Blueprint glossary — what do CCR, TOIN, Ripwire mean?"
      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-wire bg-receipt px-2 py-1 font-mono text-[11px] text-ink-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus hover:bg-receipt-hover hover:text-ink-strong lg:min-h-0"
    >
      <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      Glossary
    </button>
  )
}
