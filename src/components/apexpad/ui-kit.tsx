'use client'

/**
 * src/components/apexpad/ui-kit.tsx
 * ApexPad building blocks — every class binds to the semantic tokens in
 * globals.css (@theme, DESIGN.md §3). No raw hex in components.
 */
import * as React from 'react'
import { motion } from 'framer-motion'
import { Check, Copy } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

/* ----------------------------- class strings ----------------------------- */

export const THIN_SCROLL =
  '[scrollbar-width:thin] [scrollbar-color:var(--color-receipt)_transparent] ' +
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-receipt ' +
  '[&::-webkit-scrollbar-track]:bg-transparent'

export const BTN_PRIMARY =
  'bg-action text-action-ink hover:bg-action-hover shadow-none'
export const BTN_SECONDARY =
  'border border-wire bg-receipt text-ink-strong hover:bg-receipt-hover shadow-none'
export const BTN_DANGER =
  'bg-danger-strong text-white hover:bg-signal-danger shadow-none'
export const BTN_GHOST =
  'text-ink-muted hover:bg-receipt hover:text-ink-strong shadow-none'

/** Inputs are wells: darker than their surroundings (DESIGN.md §3). */
export const INPUT_DARK =
  'bg-well border-wire text-ink-strong placeholder:text-ink-muted focus-visible:ring-wire-focus focus-visible:border-signal-info/60 font-mono text-xs'

export const TOAST_DARK = {
  className: 'bg-vault-1 border-wire text-ink-strong',
} as const

/* ------------------------------ tiny pieces ------------------------------ */

/**
 * Receipt-style meta label. Mono, tracked, uppercase — the ONLY place
 * uppercase+tracking is allowed (DESIGN.md §4). Renders a real heading
 * element when `as` is provided (Constitution AX06 heading ladder).
 */
export function TinyLabel({
  children,
  className,
  as,
}: {
  children: React.ReactNode
  className?: string
  as?: 'h1' | 'h2' | 'h3'
}) {
  const Tag = as ?? 'div'
  return (
    <Tag
      className={cn(
        'font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-ink-muted',
        className,
      )}
    >
      {children}
    </Tag>
  )
}

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-md border border-wire bg-vault-1',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Data chip (hashes, counts) — chips are DATA, never actions. */
export function Chip({
  children,
  className,
  title,
}: {
  children: React.ReactNode
  className?: string
  title?: string
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded border border-wire bg-vault-1 px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-ink-muted tabular-nums whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  )
}

/**
 * Receipt chip (DESIGN.md §6 signature): sha prefix + provenance voice.
 * Violet on memory wash — the CCR/memory identity color.
 */
export function HashChip({
  hash,
  className,
  title,
}: {
  hash: string
  className?: string
  title?: string
}) {
  return (
    <span
      title={title ?? `receipt ${hash}`}
      className={cn(
        'inline-flex items-center rounded border border-signal-memory/30 bg-memory-wash px-1.5 py-0.5 font-mono text-[11px] font-medium leading-none text-signal-memory tabular-nums',
        className,
      )}
    >
      {hash.length > 9 ? `${hash.slice(0, 7)}…` : hash}
    </span>
  )
}

export function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5" aria-hidden>
      {connected && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal-live opacity-60" />
      )}
      <span
        className={cn(
          'relative inline-flex h-2.5 w-2.5 rounded-full',
          connected ? 'bg-signal-live' : 'bg-signal-danger',
        )}
      />
    </span>
  )
}

export function CopyButton({
  text,
  className,
  label = 'Copy',
}: {
  text: string
  className?: string
  label?: string
}) {
  const { toast } = useToast()
  const [copied, setCopied] = React.useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      toast({
        title: 'Copy failed',
        description: 'Clipboard unavailable in this browser context.',
        variant: 'destructive',
        className: TOAST_DARK.className,
      })
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? 'Copied' : label}
      className={cn(
        'relative inline-flex items-center gap-1 rounded border border-wire bg-receipt px-2 py-1 font-mono text-[11px] font-medium text-ink-muted hover:bg-receipt-hover hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus',
        /* extend the hit area to ~44px without inflating the visual */
        'after:absolute after:-inset-2 after:content-[""]',
        className,
      )}
    >
      {copied ? (
        <Check className="h-3 w-3 text-signal-live" aria-hidden />
      ) : (
        <Copy className="h-3 w-3" aria-hidden />
      )}
      {copied ? 'Copied' : label}
    </button>
  )
}

/* ------------------------- accessible tab strip --------------------------- */

export interface TabItem {
  id: string
  label: React.ReactNode
}

/**
 * The ONE tab pattern (DESIGN.md §6): full tablist semantics, roving
 * tabIndex, arrow-key navigation. All pane tab strips use this.
 */
export function TabStrip({
  items,
  active,
  onChange,
  idPrefix,
  ariaLabel,
  className,
}: {
  items: TabItem[]
  active: string
  onChange: (id: string) => void
  idPrefix: string
  ariaLabel: string
  className?: string
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next: number | null = null
    if (event.key === 'ArrowRight') next = (index + 1) % items.length
    if (event.key === 'ArrowLeft') next = (index - 1 + items.length) % items.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = items.length - 1
    if (next !== null) {
      event.preventDefault()
      onChange(items[next].id)
      refs.current[next]?.focus()
    }
  }

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('flex items-stretch gap-0.5', className)}
    >
      {items.map((item, index) => {
        const selected = item.id === active
        return (
          <button
            key={item.id}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${item.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${item.id}`}
            tabIndex={selected ? 0 : -1}
            onKeyDown={(e) => onKeyDown(e, index)}
            onClick={() => onChange(item.id)}
            className={cn(
              'min-h-[36px] rounded-t-md border-b-2 px-2.5 py-1.5 text-xs font-medium transition-[color,background-color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus',
              selected
                ? 'border-signal-info bg-vault-1 text-ink-strong'
                : 'border-transparent text-ink-muted hover:bg-vault-hover hover:text-ink',
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------ diff viewer ------------------------------ */

function diffLineClass(line: string): string {
  /* V05: color always paired with the +/-/@ glyph itself */
  if (line.startsWith('+')) return 'text-signal-live bg-signal-live/10'
  if (line.startsWith('-')) return 'text-signal-danger bg-signal-danger/10'
  if (line.startsWith('@@')) return 'text-signal-info'
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'text-ink-muted'
  return 'text-ink-muted'
}

export function DiffView({ diff, className }: { diff: string; className?: string }) {
  const lines = React.useMemo(() => diff.split('\n'), [diff])
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md border border-wire bg-vault p-2 font-mono text-[11px] leading-[1.55] tabular-nums',
        THIN_SCROLL,
        className,
      )}
    >
      {lines.map((line, i) => (
        <div key={i} className={cn('whitespace-pre px-1', diffLineClass(line))}>
          {line || ' '}
        </div>
      ))}
    </pre>
  )
}

/* --------------------------- animated reveal ----------------------------- */
/* Durations within the 150–300ms budget (DESIGN.md §10); reduced motion
   is handled globally (globals.css block + MotionConfig in page.tsx). */

export function FadeIn({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode
  className?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function SlideInItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
