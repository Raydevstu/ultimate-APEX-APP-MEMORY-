'use client'

/**
 * src/components/apexpad/minimap.tsx
 * PHASE 10 (GAP #4 / blueprint ITEM 4C): Real interactive HTML5 Canvas Code
 * Minimap — completely replaces the previous DOM-bar `Minimap (stub)`.
 *
 * Rendering contract (blueprint §ITEM 4C):
 *   • high-DPI (`devicePixelRatio`-scaled) `<canvas>` — never blurred,
 *   • per-line syntax/heading density bars, color-coded:
 *       markdown headings → cyan, [[wiki backlinks]] → purple, pipeline
 *       architecture keywords → emerald, code symbol declarations → amber,
 *       high-cyclomatic symbol spans → red, prose → slate,
 *   • LIVE viewport lens overlay tracking the editor scroll position,
 *   • click OR drag anywhere on the canvas to jump/scroll the editor to the
 *     corresponding line (1..N) — fully pointer-interactive.
 */

import * as React from 'react'

import type { AstSymbolNode } from '@/lib/apexpad-types'
import { cn } from '@/lib/utils'
import { EDITOR_LINE_HEIGHT_PX } from './constants'

const MINIMAP_WIDTH_CSS = 76
const MIN_LINE_BAR_PX = 1.5

const MINIMAP_COLORS = {
  heading: '#58a6ff', // cyan — headings
  backlink: '#d2a8ff', // purple — [[wiki backlinks]]
  pipeline: '#7ee787', // emerald — pipeline architecture keywords
  symbol: '#d29922', // amber — code symbol declarations
  hot: '#f85149', // red — high cyclomatic complexity spans
  prose: '#30363d', // slate — standard prose/code
  lensFill: 'rgba(88, 166, 255, 0.14)',
  lensStroke: '#58a6ff',
  background: '#0d1117',
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

  return (
    <div
      ref={wrapRef}
      className="hidden w-[76px] shrink-0 flex-col border-l border-[#30363d] bg-[#0d1117] md:flex"
    >
      <div
        className="py-1.5 text-center font-mono text-[9px] uppercase tracking-wide text-[#8b949e]"
        title="Interactive canvas minimap — click or drag to navigate"
      >
        Minimap ({lines.length}L)
      </div>
      <div className="min-h-0 flex-1 px-1 pb-2">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Interactive code minimap with ${lines.length} lines. Click or drag to navigate.`}
          className={cn('block cursor-pointer rounded-sm border border-[#21262d]')}
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
        />
      </div>
    </div>
  )
}
