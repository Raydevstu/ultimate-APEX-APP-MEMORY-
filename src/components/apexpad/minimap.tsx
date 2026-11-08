'use client'

/**
 * src/components/apexpad/minimap.tsx
 * PHASE 10 (GAP #4 / blueprint ITEM 4C): Real interactive HTML5 Canvas Code
 * Minimap.
 *
 * Rendering contract (blueprint §ITEM 4C):
 *   • high-DPI (`devicePixelRatio`-scaled) `<canvas>` — never blurred,
 *   • per-line syntax/heading density bars, color-coded:
 *       markdown headings → info, [[wiki backlinks]] → memory, pipeline
 *       architecture keywords → live, code symbol declarations → gate,
 *       high-cyclomatic symbol spans → danger, prose → wire,
 *   • LIVE viewport lens overlay tracking the editor scroll position,
 *   • click OR drag anywhere on the canvas to jump/scroll the editor to the
 *     corresponding line (1..N),
 *   • fully keyboard-navigable (↑/↓ step, PgUp/PgDn page, Home/End).
 *
 * Colors derive from CANVAS_PALETTE (constants.ts) — the canvas mirror of
 * the CSS design tokens. No raw hex outside that mirror.
 */

import * as React from 'react'

import type { AstSymbolNode } from '@/lib/apexpad-types'
import { cn } from '@/lib/utils'
import { CANVAS_PALETTE, EDITOR_LINE_HEIGHT_PX } from './constants'

const MINIMAP_WIDTH_CSS = 76
const MIN_LINE_BAR_PX = 1.5

/** Build `rgb(r g b / a)` from a #rrggbb hex (canvas-safe). */
function alpha(hex: string, a: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16)
  const g = parseInt(value.slice(2, 4), 16)
  const b = parseInt(value.slice(4, 6), 16)
  return `rgb(${r} ${g} ${b} / ${a})`
}

const MINIMAP_COLORS = {
  heading: CANVAS_PALETTE.signalInfo, // info — headings
  backlink: CANVAS_PALETTE.signalMemory, // memory — [[wiki backlinks]]
  pipeline: CANVAS_PALETTE.signalLive, // live — pipeline architecture keywords
  symbol: CANVAS_PALETTE.signalGate, // gate — code symbol declarations
  hot: CANVAS_PALETTE.signalDanger, // danger — high cyclomatic complexity spans
  prose: CANVAS_PALETTE.wire, // wire — standard prose/code
  lensFill: alpha(CANVAS_PALETTE.signalInfo, 0.14),
  lensStroke: CANVAS_PALETTE.signalInfo,
  background: CANVAS_PALETTE.vault,
} as const

const PIPELINE_KEYWORDS =
  /\b(PROJECT DNA|MEMORY|CONTEXT PACK|PLANNER|DAG ENGINE|ARTIFACT STAGING|HUMAN APPROVAL|CREWAI|LANGGRAPH|FROZEN PREFIX|U-CURVE|RIPWIRE|HEADROOM|CCR)\b/i
const CODE_SYMBOL_PATTERN = /\b(export|function|class|interface|const|import)\b/

function classifyLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) return MINIMAP_COLORS.prose
  if (/^#{1,4}\s/.test(trimmed) || /^\/\/\s*#{1,4}\s/.test(trimmed)) {
    return MINIMAP_COLORS.heading
  }
  if (trimmed.includes('[[') && trimmed.includes(']]')) return MINIMAP_COLORS.backlink
  if (PIPELINE_KEYWORDS.test(trimmed)) return MINIMAP_COLORS.pipeline
  if (CODE_SYMBOL_PATTERN.test(trimmed)) return MINIMAP_COLORS.symbol
  return MINIMAP_COLORS.prose
}

export interface InteractiveCodeMinimapProps {
  lines: string[]
  /** AST symbols of the active file — powers symbol-aware color + hot spans. */
  symbols: AstSymbolNode[]
  activeFilePath: string
  /** Live editor scrollTop (px) — drives the viewport lens. */
  scrollTop: number
  /** Live editor viewport height (px) — drives the lens size. */
  viewportHeightPx: number
  onSelectLine: (lineIndex: number) => void
}

export function InteractiveCodeMinimap({
  lines,
  symbols,
  activeFilePath,
  scrollTop,
  viewportHeightPx,
  onSelectLine,
}: InteractiveCodeMinimapProps) {
  const wrapRef = React.useRef<HTMLDivElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const [wrapHeight, setWrapHeight] = React.useState(320)
  const isDraggingRef = React.useRef(false)

  // Track container height so the canvas always fills the pane (responsive).
  React.useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const h = Math.round(entry.contentRect.height)
        if (h > 40) setWrapHeight(h)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Per-line color classification (memoized on content identity).
  const lineColors = React.useMemo(() => {
    const colors = new Array<string>(lines.length).fill(MINIMAP_COLORS.prose)
    for (let i = 0; i < lines.length; i++) colors[i] = classifyLine(lines[i])
    const fileSymbols = symbols.filter((s) => s.filePath === activeFilePath)
    for (const symbol of fileSymbols) {
      const color =
        symbol.cyclomaticComplexity > 5 ? MINIMAP_COLORS.hot : MINIMAP_COLORS.symbol
      const from = Math.max(0, symbol.startLine - 1)
      const to = Math.min(lines.length, symbol.endLine)
      for (let i = from; i < to; i++) {
        // Structural colors (heading/backlink/pipeline) win over symbol colors.
        if (colors[i] === MINIMAP_COLORS.prose) colors[i] = color
      }
    }
    return colors
  }, [lines, symbols, activeFilePath])

  // Canvas paint effect — DPR-aware, redraws on any relevant change.
  React.useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
    const cssWidth = MINIMAP_WIDTH_CSS
    const cssHeight = wrapHeight
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(cssHeight * dpr)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // Background
    ctx.fillStyle = MINIMAP_COLORS.background
    ctx.fillRect(0, 0, cssWidth, cssHeight)

    const totalLines = Math.max(lines.length, 1)
    const rowHeight = Math.max(MIN_LINE_BAR_PX, Math.min(5, cssHeight / totalLines - 0.5))

    lines.forEach((line, idx) => {
      const y = (idx / totalLines) * cssHeight
      const trimmed = line.trim()
      if (!trimmed) return

      ctx.fillStyle = lineColors[idx]
      const indentOffset = Math.min(18, (line.length - trimmed.length) * 1.4)
      const barWidth = Math.min(
        cssWidth - indentOffset - 6,
        Math.max(7, Math.min(72, trimmed.length * 1.1))
      )
      ctx.fillRect(4 + indentOffset, y, barWidth, rowHeight)
    })

    // LIVE viewport lens overlay.
    const visibleLineCount = Math.max(
      1,
      Math.round(viewportHeightPx / EDITOR_LINE_HEIGHT_PX)
    )
    const lensTop = (Math.floor(scrollTop / EDITOR_LINE_HEIGHT_PX) / totalLines) * cssHeight
    const lensHeight = Math.max(
      18,
      (Math.min(visibleLineCount, totalLines) / totalLines) * cssHeight
    )
    ctx.fillStyle = MINIMAP_COLORS.lensFill
    ctx.fillRect(0, lensTop, cssWidth, lensHeight)
    ctx.strokeStyle = MINIMAP_COLORS.lensStroke
    ctx.lineWidth = 1.25
    ctx.strokeRect(0.75, lensTop, cssWidth - 1.5, lensHeight)
  }, [lines, lineColors, scrollTop, viewportHeightPx, wrapHeight])

  const mapPointerToLine = React.useCallback(
    (clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top) / Math.max(1, rect.height)))
      const targetLine = Math.min(lines.length - 1, Math.floor(ratio * lines.length))
      onSelectLine(Math.max(0, targetLine))
    },
    [lines.length, onSelectLine],
  )

  const currentLine = Math.floor(scrollTop / EDITOR_LINE_HEIGHT_PX)

  const onKeyDown = (event: React.KeyboardEvent) => {
    const stepLines = Math.max(1, Math.round(viewportHeightPx / EDITOR_LINE_HEIGHT_PX) - 1)
    let target: number | null = null
    if (event.key === 'ArrowDown') target = currentLine + 1
    if (event.key === 'ArrowUp') target = currentLine - 1
    if (event.key === 'PageDown') target = currentLine + stepLines
    if (event.key === 'PageUp') target = currentLine - stepLines
    if (event.key === 'Home') target = 0
    if (event.key === 'End') target = lines.length - 1
    if (target !== null) {
      event.preventDefault()
      onSelectLine(Math.max(0, Math.min(lines.length - 1, target)))
    }
  }

  return (
    <div
      ref={wrapRef}
      className="hidden w-[76px] shrink-0 flex-col border-l border-wire bg-vault md:flex"
    >
      <div
        className="py-1.5 text-center font-mono text-[11px] font-medium uppercase tracking-wide text-ink-muted"
        title="Interactive canvas minimap — click, drag, or use arrow keys to navigate"
      >
        Minimap ({lines.length}
        L)
      </div>
      <div className="min-h-0 flex-1 px-1 pb-2">
        <div
          tabIndex={0}
          role="group"
          aria-label={`Code minimap, ${lines.length} lines. Arrow keys step, Page Up and Page Down page, Home and End jump.`}
          onKeyDown={onKeyDown}
          className="h-full rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-wire-focus"
        >
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`Interactive code minimap with ${lines.length} lines. Click or drag to navigate.`}
            className={cn(
              'block h-full w-full cursor-pointer touch-none rounded-sm border border-receipt select-none',
            )}
            onMouseDown={(e) => {
              isDraggingRef.current = true
              mapPointerToLine(e.clientY)
            }}
            onMouseMove={(e) => {
              if (isDraggingRef.current) mapPointerToLine(e.clientY)
            }}
            onMouseUp={() => {
              isDraggingRef.current = false
            }}
            onMouseLeave={() => {
              isDraggingRef.current = false
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0]
              if (touch) mapPointerToLine(touch.clientY)
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0]
              if (touch) mapPointerToLine(touch.clientY)
            }}
            onTouchEnd={() => {
              isDraggingRef.current = false
            }}
          />
        </div>
      </div>
    </div>
  )
}
