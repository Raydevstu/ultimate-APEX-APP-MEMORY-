'use client'

/**
 * src/components/apexpad/center-pane.tsx
 * Editor + minimap + line-jump flash + agent console + hook simulator.
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
  EDITOR_LINE_HEIGHT_PX,
  GITHUB,
} from './constants'
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
const MINIMAP_VISIBLE_LINES = 120

/* -------------------------------- minimap -------------------------------- */

function Minimap({
  lines,
  symbols,
  activeFilePath,
  scrollTop,
}: {
  lines: string[]
  symbols: AstSymbolNode[]
  activeFilePath: string
  scrollTop: number
}) {
  const lineColors = React.useMemo(() => {
    const colors = new Array<string>(lines.length).fill(GITHUB.border)
    const fileSymbols = symbols.filter((s) => s.filePath === activeFilePath)
    for (const symbol of fileSymbols) {
      const from = Math.max(0, symbol.startLine - 1)
      const to = Math.min(lines.length, symbol.endLine)
      for (let i = from; i < to; i++) colors[i] = GITHUB.blue
    }
    for (const symbol of fileSymbols) {
      if (symbol.cyclomaticComplexity <= 5) continue
      const from = Math.max(0, symbol.startLine - 1)
      const to = Math.min(lines.length, symbol.endLine)
      for (let i = from; i < to; i++) colors[i] = GITHUB.red
    }
    return colors
  }, [lines.length, symbols, activeFilePath])

  const maxStart = Math.max(0, lines.length - MINIMAP_VISIBLE_LINES)
  const start = Math.min(Math.max(0, Math.floor(scrollTop / EDITOR_LINE_HEIGHT_PX)), maxStart)
  const visible = lines.slice(start, start + MINIMAP_VISIBLE_LINES)

  return (
    <div className="hidden w-[72px] shrink-0 flex-col border-l border-[#30363d] bg-[#0d1117] md:flex">
      <TinyLabel className="py-1.5 text-center">Minimap</TinyLabel>
      <div className="min-h-0 flex-1 overflow-hidden px-1.5 pb-2">
        {visible.map((line, i) => {
          const width = Math.min(100, Math.max(12, (line.length / 80) * 100))
          return (
            <div
              key={start + i}
              className="mb-[2px] h-[3px] rounded-sm"
              style={{ width: `${width}%`, backgroundColor: lineColors[start + i] }}
            />
          )
        })}
      </div>
    </div>
  )
}

/* ----------------------------- agent console ----------------------------- */

function ToolOutputDialog({
  result,
  onClose,
}: {
  result: ModelToolCallResult | null
  onClose: () => void
}) {
  if (!result) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close tool output"
        className="absolute inset-0 bg-black/60"
        onClick={onClose}
      />
      <Panel className="relative z-10 max-h-[70vh] w-full max-w-lg overflow-hidden p-4">
        <TinyLabel className="mb-2">Tool Call Output</TinyLabel>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="font-mono text-xs text-[#79c0ff]">{result.toolName}</span>
          <Chip className="font-mono">{result.tokensConsumed} tok</Chip>
        </div>
        <DiffView
          diff={prettyJson(result.outputJson)}
          className="max-h-[45vh] overflow-y-auto"
        />
        <button
          type="button"
          onClick={onClose}
          className={cn('mt-3 w-full rounded-md px-3 py-2 text-xs', BTN_SECONDARY)}
        >
          Close
        </button>
      </Panel>
    </div>
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
          <Bot className="h-3.5 w-3.5 text-[#7ee787]" />
          <TinyLabel>Agent Console</TinyLabel>
        </div>
        {agentResult ? (
          <span
            className={cn(
              'rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase',
              agentResult.llmMode === 'sdk'
                ? 'border-[#d2a8ff]/50 bg-[#d2a8ff]/15 text-[#d2a8ff]'
                : 'border-[#d29922]/50 bg-[#d29922]/15 text-[#d29922]',
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
        placeholder="Ask the agent to refactor, analyze, or extend this note…"
        className={cn(
          'w-full resize-none rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-[13px] text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#58a6ff]/60 focus:ring-2 focus:ring-[#58a6ff]/30',
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
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Running… {elapsed}s
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              Run Agent Turn (CONTEXT PACK → LLM)
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
            <ChevronDown className="h-3.5 w-3.5" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5" />
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
            <div className="mt-2 flex gap-2 rounded-md border border-[#30363d] bg-[#0d1117] p-2">
              <input
                value={userGoal}
                onChange={(e) => setUserGoal(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitStage()
                }}
                placeholder="userGoal for the DAG run (e.g. 'tighten the budget invariants')"
                className={cn(INPUT_DARK, 'h-9 flex-1 rounded-md border px-2 text-[11px] outline-none focus:ring-2')}
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
                'max-h-56 overflow-y-auto whitespace-pre-wrap rounded-md border border-[#30363d] bg-[#0d1117] p-3 pr-16 font-mono text-[11px] leading-relaxed text-[#c9d1d9]',
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
                title="Show tool output JSON"
                className="inline-flex items-center gap-1 rounded border border-[#58a6ff]/40 bg-[#58a6ff]/10 px-1.5 py-0.5 font-mono text-[10px] text-[#79c0ff] hover:bg-[#58a6ff]/20"
              >
                <Wrench className="h-2.5 w-2.5" />
                {call.toolName} ({call.tokensConsumed} tok)
              </button>
            ))}
            <Chip className="border-[#3fb950]/40 bg-[#3fb950]/10 text-[#3fb950]">
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
          <ChevronDown className="h-3.5 w-3.5 text-[#8b949e]" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-[#8b949e]" />
        )}
        <FlaskConical className="h-3.5 w-3.5 text-[#d29922]" />
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
                placeholder="tool name"
                className={cn(INPUT_DARK, 'h-9 w-full rounded-md border px-2 text-[11px] outline-none focus:ring-2')}
              />
              <textarea
                value={toolOutput}
                onChange={(e) => setToolOutput(e.target.value)}
                rows={3}
                placeholder="raw tool output to compress…"
                className={cn(
                  'w-full resize-none rounded-md border border-[#30363d] bg-[#0d1117] px-2 py-2 font-mono text-[11px] text-[#e6edf3] placeholder:text-[#8b949e] outline-none focus:border-[#58a6ff]/60 focus:ring-2 focus:ring-[#58a6ff]/30',
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
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Terminal className="h-3.5 w-3.5" />
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
  const [flash, setFlash] = React.useState<{ nonce: number; top: number } | null>(null)

  const lines = React.useMemo(() => editorContent.split('\n'), [editorContent])
  const stats = React.useMemo(() => {
    const words = editorContent.split(/\s+/).filter(Boolean).length
    return { lines: lines.length, words, chars: editorContent.length }
  }, [editorContent, lines.length])

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

  return (
    <section className="flex min-h-0 flex-col gap-3 lg:h-full lg:overflow-hidden">
      {/* editor panel */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-[#30363d] bg-[#161b22]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[#30363d] px-3 py-2">
          <span className="truncate font-mono text-xs text-[#58a6ff]">
            {activeFilePath}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            {indexing ? (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-[#d29922]">
                <Loader2 className="h-3 w-3 animate-spin" />
                indexing…
              </span>
            ) : null}
            <span className="hidden font-mono text-[10px] text-[#8b949e] sm:inline">
              Lines: {stats.lines} · Words: {stats.words} · Chars: {stats.chars}
            </span>
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1">
          <textarea
            ref={textareaRef}
            value={editorContent}
            onChange={(e) => onEditorChange(e.target.value)}
            onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
            spellCheck={false}
            className={cn(
              'min-h-[320px] w-full flex-1 resize-none bg-transparent py-3 pl-4 pr-3 font-mono text-[13px] leading-[1.6] text-[#e6edf3] outline-none lg:min-h-0',
              THIN_SCROLL,
            )}
          />
          {/* line flash overlay on symbol click */}
          <AnimatePresence>
            {flash ? (
              <motion.div
                key={flash.nonce}
                initial={{ opacity: 0.85 }}
                animate={{ opacity: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1.0, ease: 'easeOut' }}
                className="pointer-events-none absolute left-0 right-0 h-[21px] rounded-sm border-y border-[#58a6ff]/50 bg-[#58a6ff]/15"
                style={{ top: flash.top }}
              />
            ) : null}
          </AnimatePresence>
          <Minimap
            lines={lines}
            symbols={symbols}
            activeFilePath={activeFilePath}
            scrollTop={scrollTop}
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
