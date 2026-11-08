'use client'

/**
 * src/components/apexpad/center-pane.tsx
 * Editor + PHASE 10 interactive canvas minimap + line-jump flash + agent
 * console + hook simulator.
 */
import * as React from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Eye,
  FlaskConical,
  Loader2,
  Play,
  Terminal,
  Wrench,
} from 'lucide-react'

import type {
  AgentTurnResponse,
  AstSymbolNode,
  ModelToolCallResult,
} from '@/lib/apexpad-types'
import { cn } from '@/lib/utils'
import { prettyJson } from '@/lib/apexpad-client'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  EDITOR_LINE_HEIGHT_PX,
} from './constants'
import { InteractiveCodeMinimap } from './minimap'
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Chip,
  CopyButton,
  DiffView,
  INPUT_DARK,
  Panel,
  THIN_SCROLL,
  TinyLabel,
} from './ui-kit'

const EDITOR_PADDING_Y = 12 // py-3 on the textarea

/* ----------------------------- agent console ----------------------------- */

function ToolOutputDialog({
  result,
  onClose,
}: {
  result: ModelToolCallResult | null
  onClose: () => void
}) {
  return (
    <Dialog open={result !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="max-h-[70vh] overflow-hidden border-wire bg-vault-1 p-4">
        <DialogHeader className="space-y-0">
          <DialogTitle className="flex items-center justify-between gap-2 font-mono text-xs font-bold text-ink-strong">
            <span className="text-signal-info">{result?.toolName}</span>
            <Chip className="font-mono tabular-nums">{result?.tokensConsumed} tok</Chip>
          </DialogTitle>
        </DialogHeader>
        <DiffView
          diff={result ? prettyJson(result.outputJson) : ''}
          className="max-h-[45vh] overflow-y-auto"
        />
        <button
          type="button"
          onClick={onClose}
          className={cn('mt-3 w-full rounded-md px-3 py-2 text-xs', BTN_SECONDARY)}
        >
          Close
        </button>
      </DialogContent>
    </Dialog>
  )
}

function AgentConsole({
  agentLoading,
  agentResult,
  onRunAgent,
  onStageDag,
}: {
  agentLoading: boolean
  agentResult: AgentTurnResponse | null
  onRunAgent: (prompt: string) => void
  onStageDag: (userGoal: string) => Promise<boolean>
}) {
  const [prompt, setPrompt] = React.useState('')
  const [elapsed, setElapsed] = React.useState(0)
  const [stageOpen, setStageOpen] = React.useState(false)
  const [userGoal, setUserGoal] = React.useState('')
  const [staging, setStaging] = React.useState(false)
  const [toolDialog, setToolDialog] = React.useState<ModelToolCallResult | null>(null)

  React.useEffect(() => {
    if (!agentLoading) {
      setElapsed(0)
      return
    }
    const startedAt = Date.now()
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [agentLoading])

  const submitStage = async () => {
    if (!userGoal.trim()) return
    setStaging(true)
    const ok = await onStageDag(userGoal.trim())
    setStaging(false)
    if (ok) {
      setStageOpen(false)
      setUserGoal('')
    }
  }

  return (
    <Panel className="p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Bot className="h-3.5 w-3.5 text-signal-live" />
          <TinyLabel>Agent Console</TinyLabel>
        </div>
        {agentResult ? (
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase',
              agentResult.llmMode === 'sdk'
                ? 'border-signal-memory/50 bg-signal-memory/15 text-signal-memory'
                : 'border-signal-gate/50 bg-signal-gate/15 text-signal-gate',
            )}
          >
            {agentResult.llmMode === 'sdk' ? 'Z.ai SDK' : 'Offline Synthesizer'}
          </span>
        ) : null}
      </div>

      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        rows={2}
        aria-label="Agent prompt"
        autoComplete="off"
        spellCheck={false}
        placeholder="Ask the agent to refactor, analyze, or extend this note…"
        className={cn(
          'w-full resize-none rounded-md border border-wire bg-vault px-3 py-2 text-[13px] text-ink-strong placeholder:text-ink-muted outline-none focus-visible:border-signal-info/60 focus-visible:ring-2 focus-visible:ring-signal-info/30',
          THIN_SCROLL,
        )}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={agentLoading || !prompt.trim()}
          onClick={() => onRunAgent(prompt.trim())}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold disabled:opacity-50 lg:min-h-0',
            BTN_PRIMARY,
          )}
        >
          {agentLoading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Running… <span className="tabular-nums">{elapsed}s</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" aria-hidden />
              Run Agent Turn (SPEC → CONTEXT PACK → LLM)
            </>
          )}
        </button>

        <button
          type="button"
          disabled={agentLoading}
          onClick={() => setStageOpen((v) => !v)}
          className={cn(
            'inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50 lg:min-h-0',
            BTN_SECONDARY,
          )}
        >
          {stageOpen ? (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          )}
          Stage as DAG Edit
        </button>
      </div>

      <AnimatePresence initial={false}>
        {stageOpen ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 flex gap-2 rounded-md border border-wire bg-vault p-2">
              <input
                value={userGoal}
                onChange={(e) => setUserGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitStage()
                }}
                aria-label="User goal for the DAG stage run"
                name="apexpad-user-goal"
                autoComplete="off"
                spellCheck={false}
                placeholder="userGoal for the DAG run, e.g. tighten the budget invariants…"
                className={cn(INPUT_DARK, 'h-9 flex-1 rounded-md border px-2 text-[11px]')}
              />
              <button
                type="button"
                disabled={staging || !userGoal.trim()}
                onClick={() => void submitStage()}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50',
                  BTN_PRIMARY,
                )}
              >
                {staging ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Stage
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {agentResult ? (
        <div className="mt-3 space-y-2">
          <div className="relative">
            <div className="absolute right-2 top-2 z-10">
              <CopyButton text={agentResult.cleanedResponse} />
            </div>
            <pre
              className={cn(
                'max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-wire bg-vault p-3 pr-16 font-mono text-[11px] leading-relaxed text-ink',
                THIN_SCROLL,
              )}
            >
              {agentResult.cleanedResponse}
            </pre>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {agentResult.executedToolCalls.map((call, i) => (
              <button
                key={`${call.toolName}-${i}`}
                type="button"
                onClick={() => setToolDialog(call)}
                aria-label={`Show tool output JSON for ${call.toolName}`}
                className="inline-flex min-h-[28px] items-center gap-1 rounded border border-signal-info/40 bg-signal-info/10 px-1.5 font-mono text-[11px] text-signal-info hover:bg-signal-info/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus"
              >
                <Wrench className="h-2.5 w-2.5" aria-hidden />
                {call.toolName} ({call.tokensConsumed} tok)
              </button>
            ))}
            <Chip className="border-signal-live/40 bg-signal-live/10 text-signal-live">
              <Eye className="h-2.5 w-2.5" />
              {agentResult.storedInlineObservations.length} inline obs stored
            </Chip>
          </div>
        </div>
      ) : null}

      <ToolOutputDialog result={toolDialog} onClose={() => setToolDialog(null)} />
    </Panel>
  )
}

/* ---------------------------- hook simulator ----------------------------- */

function HookSimulator({
  onSendHook,
}: {
  onSendHook: (toolName: string, toolOutput: string) => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [toolName, setToolName] = React.useState('bash_test_runner')
  const [toolOutput, setToolOutput] = React.useState(
    'npm test\n✓ 42 passing (1.2s)\n✗ 1 failing — calculateContextBudget ceiling guard\n  expected disclosures.length === 1, got 2',
  )
  const [sending, setSending] = React.useState(false)

  const send = async () => {
    if (!toolOutput.trim() || !toolName.trim()) return
    setSending(true)
    try {
      await onSendHook(toolName.trim(), toolOutput)
    } finally {
      setSending(false)
    }
  }

  return (
    <Panel className="p-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 text-left"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-ink-muted" />
        )}
        <FlaskConical className="h-3.5 w-3.5 text-signal-gate" />
        <TinyLabel>Simulate PostToolUse Hook</TinyLabel>
      </button>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="mt-2 space-y-2">
              <input
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
                aria-label="Tool name to simulate"
                name="apexpad-hook-tool-name"
                autoComplete="off"
                spellCheck={false}
                placeholder="tool name…"
                className={cn(INPUT_DARK, 'h-9 w-full rounded-md border px-2 text-[11px]')}
              />
              <textarea
                value={toolOutput}
                onChange={(e) => setToolOutput(e.target.value)}
                rows={3}
                aria-label="Raw tool output to compress"
                name="apexpad-hook-tool-output"
                autoComplete="off"
                spellCheck={false}
                placeholder="raw tool output to compress…"
                className={cn(
                  'w-full resize-none rounded-md border border-wire bg-vault px-2 py-2 font-mono text-[11px] text-ink-strong placeholder:text-ink-muted outline-none focus-visible:border-signal-info/60 focus-visible:ring-2 focus-visible:ring-signal-info/30',
                  THIN_SCROLL,
                )}
              />
              <button
                type="button"
                disabled={sending || !toolOutput.trim()}
                onClick={() => void send()}
                className={cn(
                  'inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50 lg:min-h-0',
                  BTN_SECONDARY,
                )}
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Terminal className="h-3.5 w-3.5" aria-hidden />
                )}
                Send Hook → CCR Compress
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Panel>
  )
}

/* ------------------------------ center pane ------------------------------ */

export function CenterPane({
  activeFilePath,
  editorContent,
  onEditorChange,
  indexing,
  textareaRef,
  scrollTarget,
  symbols,
  agentLoading,
  agentResult,
  onRunAgent,
  onStageDag,
  onSendHook,
}: {
  activeFilePath: string
  editorContent: string
  onEditorChange: (value: string) => void
  indexing: boolean
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  scrollTarget: { line: number; nonce: number } | null
  symbols: AstSymbolNode[]
  agentLoading: boolean
  agentResult: AgentTurnResponse | null
  onRunAgent: (prompt: string) => void
  onStageDag: (userGoal: string) => Promise<boolean>
  onSendHook: (toolName: string, toolOutput: string) => Promise<void>
}) {
  const [scrollTop, setScrollTop] = React.useState(0)
  const [viewportHeightPx, setViewportHeightPx] = React.useState(340)
  const [flash, setFlash] = React.useState<{ nonce: number; top: number } | null>(null)
  const editorWrapRef = React.useRef<HTMLDivElement | null>(null)
  const scrollRafRef = React.useRef<number | null>(null)

  /* rAF-throttled scroll sync: one update per frame instead of one
     setState per scroll event (perf finding, DESIGN_AUDIT §11). */
  const handleEditorScroll = React.useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    const next = e.currentTarget.scrollTop
    if (scrollRafRef.current !== null) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      setScrollTop(next)
    })
  }, [])

  React.useEffect(
    () => () => {
      if (scrollRafRef.current !== null) cancelAnimationFrame(scrollRafRef.current)
    },
    [],
  )

  const lines = React.useMemo(() => editorContent.split('\n'), [editorContent])
  const stats = React.useMemo(() => {
    const words = editorContent.split(/\s+/).filter(Boolean).length
    return { lines: lines.length, words, chars: editorContent.length }
  }, [editorContent, lines.length])

  // Track the live editor viewport height for the minimap lens.
  React.useEffect(() => {
    const el = editorWrapRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height)
        if (h > 60) setViewportHeightPx(h)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Jump-to-line + flash when requested by the outline pane.
  React.useEffect(() => {
    const ta = textareaRef.current
    if (!scrollTarget || !ta) return
    const targetY = EDITOR_PADDING_Y + (scrollTarget.line - 1) * EDITOR_LINE_HEIGHT_PX
    ta.scrollTop = Math.max(0, targetY - 100)
    setScrollTop(ta.scrollTop)
    setFlash({ nonce: scrollTarget.nonce, top: targetY - ta.scrollTop })
    const timer = setTimeout(() => setFlash(null), 1100)
    return () => clearTimeout(timer)
  }, [scrollTarget, textareaRef])

  /** PHASE 10: minimap click/drag navigation — jumps the editor to a line. */
  const handleMinimapSelect = React.useCallback(
    (lineIndex: number) => {
      const ta = textareaRef.current
      if (!ta) return
      const targetY = EDITOR_PADDING_Y + lineIndex * EDITOR_LINE_HEIGHT_PX
      ta.scrollTop = Math.max(0, targetY - 40)
      setScrollTop(ta.scrollTop)
      setFlash({ nonce: Date.now(), top: targetY - ta.scrollTop })
      const timer = setTimeout(() => setFlash(null), 1100)
      return () => clearTimeout(timer)
    },
    [textareaRef],
  )

  return (
    <section className="flex min-h-0 flex-col gap-3 lg:h-full lg:overflow-hidden">
      {/* editor panel */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-wire bg-vault-1">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-wire px-3 py-2">
          <span className="truncate font-mono text-xs text-signal-info">
            {activeFilePath}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {indexing ? (
              <span className="inline-flex items-center gap-1 font-mono text-[11px] text-signal-gate" role="status">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                indexing…
              </span>
            ) : null}
            <span className="hidden font-mono text-[11px] text-ink-muted tabular-nums sm:inline">
              Lines: {stats.lines} · Words: {stats.words} · Chars: {stats.chars}
            </span>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1">
          <div ref={editorWrapRef} className="relative min-h-0 flex-1">
            <textarea
              ref={textareaRef}
              value={editorContent}
              onChange={(e) => onEditorChange(e.target.value)}
              onScroll={handleEditorScroll}
              spellCheck={false}
              aria-label="Note editor — active file content"
              className={cn(
                'min-h-[320px] w-full resize-none bg-transparent py-3 pl-4 pr-3 font-mono text-[13px] leading-[1.6] text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-wire-focus lg:min-h-0 lg:h-full',
                THIN_SCROLL,
              )}
            />
            {/* line flash overlay on symbol/minimap navigation */}
            <AnimatePresence>
              {flash ? (
                <motion.div
                  key={flash.nonce}
                  initial={{ opacity: 0.85 }}
                  animate={{ opacity: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.32, ease: 'easeOut' }}
                  className="pointer-events-none absolute left-0 right-0 h-[21px] rounded-sm border-y border-signal-info/50 bg-signal-info/15"
                  style={{ top: flash.top }}
                />
              ) : null}
            </AnimatePresence>
          </div>
          {/* PHASE 10: real interactive HTML5 canvas minimap (click/drag) */}
          <InteractiveCodeMinimap
            lines={lines}
            symbols={symbols}
            activeFilePath={activeFilePath}
            scrollTop={scrollTop}
            viewportHeightPx={viewportHeightPx}
            onSelectLine={handleMinimapSelect}
          />
        </div>
      </div>

      {/* console + hook simulator */}
      <div className="shrink-0 space-y-3 lg:max-h-[52%] lg:overflow-y-auto lg:pr-0.5">
        <AgentConsole
          agentLoading={agentLoading}
          agentResult={agentResult}
          onRunAgent={onRunAgent}
          onStageDag={onStageDag}
        />
        <HookSimulator onSendHook={onSendHook} />
      </div>
    </section>
  )
}
