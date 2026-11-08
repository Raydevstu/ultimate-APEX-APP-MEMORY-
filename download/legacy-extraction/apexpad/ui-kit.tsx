'use client'

/**
 * src/components/apexpad/ui-kit.tsx
 * Shared GitHub-dark building blocks: class strings, tiny labels, chips,
 * status dot, thin-scrollbar wrapper, diff viewer, copy button.
 */
import * as React from 'react'
import { motion } from 'framer-motion'
import { Check, Copy } from 'lucide-react'

import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

/* ----------------------------- class strings ----------------------------- */

export const THIN_SCROLL =
  '[scrollbar-width:thin] [scrollbar-color:#30363d_transparent] ' +
  '[&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar]:h-1.5 ' +
  '[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#30363d] ' +
  '[&::-webkit-scrollbar-track]:bg-transparent'

export const BTN_PRIMARY =
  'bg-[#238636] text-white hover:bg-[#2ea043] shadow-none'
export const BTN_SECONDARY =
  'border border-[#30363d] bg-[#21262d] text-[#e6edf3] hover:bg-[#30363d] shadow-none'
export const BTN_DANGER =
  'bg-[#da3633] text-white hover:bg-[#f85149] shadow-none'
export const BTN_GHOST =
  'text-[#8b949e] hover:bg-[#21262d] hover:text-[#e6edf3] shadow-none'
export const INPUT_DARK =
  'bg-[#0d1117] border-[#30363d] text-[#e6edf3] placeholder:text-[#8b949e] focus-visible:ring-[#58a6ff]/40 focus-visible:border-[#58a6ff]/60 font-mono text-xs'

export const TOAST_DARK = {
  className: 'bg-[#161b22] border-[#30363d] text-[#e6edf3]',
} as const

/* ------------------------------ tiny pieces ------------------------------ */

export function TinyLabel({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8b949e]',
        className,
      )}
    >
      {children}
    </div>
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
        'rounded-lg border border-[#30363d] bg-[#161b22]',
        className,
      )}
    >
      {children}
    </div>
  )
}

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
        'inline-flex items-center gap-1 rounded-md border border-[#30363d] bg-[#161b22] px-1.5 py-0.5 text-[11px] leading-none text-[#8b949e] whitespace-nowrap',
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span className="relative inline-flex h-2.5 w-2.5" aria-hidden>
      {connected && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3fb950] opacity-60" />
      )}
      <span
        className={cn(
          'relative inline-flex h-2.5 w-2.5 rounded-full',
          connected ? 'bg-[#3fb950]' : 'bg-[#f85149]',
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
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-[#30363d] bg-[#21262d] px-1.5 py-0.5 text-[10px] text-[#8b949e] hover:bg-[#30363d] hover:text-[#e6edf3]',
        className,
      )}
    >
      {copied ? (
        <Check className="h-3 w-3 text-[#3fb950]" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
      {copied ? 'Copied' : label}
    </button>
  )
}

/* ------------------------------ diff viewer ------------------------------ */

function diffLineClass(line: string): string {
  if (line.startsWith('+')) return 'text-[#3fb950] bg-[#3fb950]/10'
  if (line.startsWith('-')) return 'text-[#f85149] bg-[#f85149]/10'
  if (line.startsWith('@@')) return 'text-[#79c0ff]'
  if (line.startsWith('diff ') || line.startsWith('index ')) return 'text-[#8b949e]'
  return 'text-[#8b949e]'
}

export function DiffView({ diff, className }: { diff: string; className?: string }) {
  const lines = React.useMemo(() => diff.split('\n'), [diff])
  return (
    <pre
      className={cn(
        'overflow-x-auto rounded-md border border-[#30363d] bg-[#0d1117] p-2 font-mono text-[10px] leading-[1.5]',
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
