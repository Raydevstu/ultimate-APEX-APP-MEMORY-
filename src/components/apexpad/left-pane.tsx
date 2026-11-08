'use client'

/**
 * src/components/apexpad/left-pane.tsx
 * Outline & AST / DNA / Memory (3-tier progressive disclosure) explorer.
 */
import * as React from 'react'
import {
  ChevronLeft,
  FileWarning,
  ListTree,
  Loader2,
  Search,
  ShieldAlert,
} from 'lucide-react'

import type {
  AstSymbolNode,
  MemorySearchIndexHit,
  MemoryTimelineEntry,
  ProjectDnaRule,
} from '@/lib/apexpad-types'
import { cn } from '@/lib/utils'
import {
  BTN_GHOST,
  BTN_SECONDARY,
  FadeIn,
  INPUT_DARK,
  Panel,
  TabStrip,
  THIN_SCROLL,
  TinyLabel,
} from './ui-kit'

/* ------------------------------- outline --------------------------------- */

function OutlineTab({
  symbols,
  activeFilePath,
  onJumpToLine,
}: {
  symbols: AstSymbolNode[]
  activeFilePath: string
  onJumpToLine: (line: number) => void
}) {
  const fileSymbols = React.useMemo(
    () =>
      symbols
        .filter((s) => s.filePath === activeFilePath)
        .sort((a, b) => a.startLine - b.startLine),
    [symbols, activeFilePath],
  )

  return (
    <div className="space-y-2">
      <TinyLabel>Headings • Backlinks • Ripwire PPR Rank</TinyLabel>
      {fileSymbols.length === 0 ? (
        <div className="rounded-md border border-dashed border-wire p-4 text-center text-xs text-ink-muted">
          No symbols indexed for this file yet.
        </div>
      ) : (
        <div className="space-y-1.5">
          {fileSymbols.map((symbol) => {
            const hot = symbol.cyclomaticComplexity > 5
            return (
              <button
                key={symbol.symbolId}
                type="button"
                onClick={() => onJumpToLine(symbol.startLine)}
                className={cn(
                  'block w-full rounded-md border border-transparent bg-vault-1 px-2.5 py-2 text-left transition-colors hover:border-wire hover:bg-vault-hover',
                  hot ? 'border-l-[3px] border-l-signal-danger' : 'border-l-[3px] border-l-signal-live',
                )}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-semibold text-ink-strong">
                    {symbol.symbolName}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-signal-info">
                    PPR: {symbol.pageRankScore.toFixed(1)}
                  </span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-ink-muted">
                  L{symbol.startLine}-L{symbol.endLine} • {symbol.kind} • CX:
                  {symbol.cyclomaticComplexity}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* --------------------------------- dna ----------------------------------- */

const DNA_CATEGORY_STYLE: Record<ProjectDnaRule['category'], string> = {
  architecture: 'border-signal-info/40 bg-signal-info/15 text-signal-info',
  convention: 'border-wire bg-receipt text-ink-muted',
  forbidden_pattern: 'border-signal-danger/40 bg-signal-danger/15 text-signal-danger',
  environment_fact: 'border-signal-gate/40 bg-signal-gate/15 text-signal-gate',
}

function DnaTab({ dnaRules }: { dnaRules: ProjectDnaRule[] }) {
  if (dnaRules.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-wire p-4 text-center text-xs text-ink-muted">
        No DNA rules confirmed yet. Run agent turns to distill rules.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {dnaRules.map((rule) => (
        <Panel key={rule.id} className="p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-xs font-bold text-signal-memory">
              {rule.ruleKey}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-ink-muted">
              {rule.confirmationSessions}x verified
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink">
            {rule.ruleStatement}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                'rounded border px-1.5 py-0.5 text-[11px] font-medium',
                DNA_CATEGORY_STYLE[rule.category],
              )}
            >
              {rule.category}
            </span>
            {rule.enforcedInCi ? (
              <span className="rounded border border-signal-live/40 bg-signal-live/10 px-1.5 py-0.5 text-[11px] text-signal-live">
                CI enforced
              </span>
            ) : null}
          </div>
          {rule.layerDenyRule ? (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-signal-danger">
              <ShieldAlert className="h-3 w-3" />
              Gate: {rule.layerDenyRule}
            </div>
          ) : null}
        </Panel>
      ))}
    </div>
  )
}

/* ------------------------ memory (progressive) --------------------------- */

type TierState = 'done' | 'active' | 'pending' | 'loading'

function TierBadge({ tier, label, state }: { tier: number; label: string; state: TierState }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[11px] uppercase tracking-wider',
        state === 'done' && 'border-signal-live/40 bg-signal-live/10 text-signal-live',
        state === 'active' && 'border-signal-info/60 bg-signal-info/15 text-signal-info',
        state === 'loading' && 'border-signal-info/60 bg-signal-info/10 text-signal-info',
        state === 'pending' && 'border-wire bg-vault-1 text-ink-muted',
      )}
    >
      {state === 'loading' ? (
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
      ) : null}
      TIER {tier} · {label}
    </span>
  )
}

function HitCard({
  hit,
  onClick,
}: {
  hit: MemorySearchIndexHit
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'block w-full rounded-md border bg-vault-1 px-3 py-2 text-left transition-colors hover:bg-vault-hover',
        hit.isStale
          ? 'border-signal-gate/60 hover:border-signal-gate'
          : 'border-wire hover:border-signal-info/50',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-signal-info">
          {hit.title}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-muted">
          ~{hit.tokenEstimate} tok
        </span>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-ink-muted">{hit.subtitle}</p>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-signal-live">
          Scope: {hit.scope} • Category: {hit.category}
        </span>
        {hit.isStale ? (
          <span className="inline-flex items-center gap-0.5 font-mono text-[11px] text-signal-gate">
            <FileWarning className="h-2.5 w-2.5" /> stale
          </span>
        ) : null}
      </div>
    </button>
  )
}

function TimelineNode({
  hit,
  anchor,
}: {
  hit: MemorySearchIndexHit
  anchor: boolean
}) {
  return (
    <div className="relative">
      <span
        className={cn(
          'absolute -left-[13px] top-1.5 h-2 w-2 rounded-full ring-2 ring-vault-1',
          anchor ? 'bg-signal-info' : 'bg-wire',
        )}
      />
      <div
        className={cn(
          'rounded-md border px-2.5 py-1.5',
          anchor
            ? 'border-signal-info/60 bg-signal-info/10'
            : 'border-wire bg-vault-1',
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'truncate text-[11px] font-medium',
              anchor ? 'text-signal-info' : 'text-ink',
            )}
          >
            {hit.title}
          </span>
          {anchor ? (
            <span className="shrink-0 rounded border border-signal-info/50 px-1 font-mono text-[11px] uppercase text-signal-info">
              anchor
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11px] text-ink-muted">{hit.subtitle}</p>
      </div>
    </div>
  )
}

function MemoryTab({
  memoryIndexHits,
  drill,
  timelineLoading,
  fullRecordLoading,
  fullRecordsOpen,
  onSearchMemory,
  onHitClick,
  onBackFromTimeline,
  onLoadFullRecord,
}: {
  memoryIndexHits: MemorySearchIndexHit[]
  drill: { hit: MemorySearchIndexHit; timeline: MemoryTimelineEntry } | null
  timelineLoading: boolean
  fullRecordLoading: boolean
  fullRecordsOpen: boolean
  onSearchMemory: (query: string) => Promise<MemorySearchIndexHit[] | null>
  onHitClick: (hit: MemorySearchIndexHit) => void
  onBackFromTimeline: () => void
  onLoadFullRecord: () => void
}) {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<MemorySearchIndexHit[] | null>(null)
  const [searching, setSearching] = React.useState(false)

  React.useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setResults(null)
      setSearching(false)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      const hits = await onSearchMemory(trimmed)
      setResults(hits)
      setSearching(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [query, onSearchMemory])

  const hits = results ?? memoryIndexHits
  const tier1State: TierState = timelineLoading
    ? 'loading'
    : drill
      ? 'done'
      : 'pending'
  const tier2State: TierState = fullRecordLoading
    ? 'loading'
    : fullRecordsOpen
      ? 'active'
      : 'pending'

  return (
    <div className="space-y-3">
      {/* progressive disclosure stepper */}
      <div className="flex flex-wrap items-center gap-1">
        <TierBadge tier={0} label="Index" state="done" />
        <span className="text-[11px] text-wire">→</span>
        <TierBadge tier={1} label="Timeline" state={tier1State} />
        <span className="text-[11px] text-wire">→</span>
        <TierBadge tier={2} label="Full" state={tier2State} />
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search memory index (BM25)…"
          aria-label="Search the Tier-0 memory index"
          name="apexpad-memory-search"
          type="search"
          autoComplete="off"
          spellCheck={false}
          aria-busy={searching}
          className={cn(INPUT_DARK, 'h-9 w-full rounded-md border pl-8 pr-8')}
        />
        {searching ? (
          <Loader2
            className="absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin text-signal-info"
            aria-hidden
          />
        ) : null}
      </div>

      {drill ? (
        <FadeIn className="space-y-3">
          <button
            type="button"
            onClick={onBackFromTimeline}
            className={cn('inline-flex items-center gap-1 text-[11px]', BTN_GHOST, 'px-1.5 py-1')}
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back to index (Tier 0)
          </button>

          <div>
            <TinyLabel className="mb-2">Memory Timeline — Tier 1</TinyLabel>
            <div className="relative ml-2 border-l border-wire pl-4">
              <div className="space-y-2">
                {drill.timeline.precedingObservations.map((h) => (
                  <TimelineNode key={h.id} hit={h} anchor={false} />
                ))}
                <TimelineNode hit={drill.timeline.anchorObservation} anchor />
                {drill.timeline.succeedingObservations.map((h) => (
                  <TimelineNode key={h.id} hit={h} anchor={false} />
                ))}
              </div>
            </div>
          </div>

          <div>
            <TinyLabel className="mb-1">Session Prompt Context</TinyLabel>
            <blockquote className="rounded-md border-l-2 border-wire bg-vault px-3 py-2 text-[11px] italic leading-relaxed text-ink-muted">
              {drill.timeline.sessionPromptContext || '—'}
            </blockquote>
          </div>

          <button
            type="button"
            onClick={onLoadFullRecord}
            disabled={fullRecordLoading}
            className={cn(
              'inline-flex w-full items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-60',
              BTN_SECONDARY,
              'min-h-[44px] lg:min-h-0',
            )}
          >
            {fullRecordLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ListTree className="h-3.5 w-3.5 text-signal-memory" />
            )}
            Load Full Record (Tier 2)
          </button>
        </FadeIn>
      ) : (
        <div className="space-y-1.5">
          {hits.length === 0 ? (
            <div className="rounded-md border border-dashed border-wire p-4 text-center text-xs text-ink-muted">
              {query.trim()
                ? 'No memory hits for this query.'
                : 'Memory index is empty. Observations appear as you work.'}
            </div>
          ) : (
            hits.map((hit) => (
              <HitCard key={hit.id} hit={hit} onClick={() => onHitClick(hit)} />
            ))
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------- the pane -------------------------------- */

export type LeftPaneTab = 'outline' | 'dna' | 'memory'

export function LeftPane({
  symbols,
  activeFilePath,
  dnaRules,
  memoryIndexHits,
  drill,
  timelineLoading,
  fullRecordLoading,
  fullRecordsOpen,
  tab,
  onTabChange,
  onJumpToLine,
  onSearchMemory,
  onHitClick,
  onBackFromTimeline,
  onLoadFullRecord,
}: {
  symbols: AstSymbolNode[]
  activeFilePath: string
  dnaRules: ProjectDnaRule[]
  memoryIndexHits: MemorySearchIndexHit[]
  drill: { hit: MemorySearchIndexHit; timeline: MemoryTimelineEntry } | null
  timelineLoading: boolean
  fullRecordLoading: boolean
  fullRecordsOpen: boolean
  tab: LeftPaneTab
  onTabChange: (tab: LeftPaneTab) => void
  onJumpToLine: (line: number) => void
  onSearchMemory: (query: string) => Promise<MemorySearchIndexHit[] | null>
  onHitClick: (hit: MemorySearchIndexHit) => void
  onBackFromTimeline: () => void
  onLoadFullRecord: () => void
}) {
  const tabs: { id: LeftPaneTab; label: string; count?: number }[] = [
    { id: 'outline', label: 'Outline & AST' },
    { id: 'dna', label: 'DNA', count: dnaRules.length },
    { id: 'memory', label: 'Memory', count: memoryIndexHits.length },
  ]

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-wire bg-vault-1 lg:h-full">
      {/* tab strip — the one TabStrip primitive (a11y: tablist/roving/arrows) */}
      <div className="shrink-0 border-b border-wire bg-vault px-1 pt-1">
        <TabStrip
          idPrefix="left-pane"
          ariaLabel="Left pane sections"
          items={tabs.map((t) => ({
            id: t.id,
            label: (
              <>
                {t.label}
                {t.count !== undefined ? (
                  <span className="ml-1 font-mono text-[11px] text-ink-muted tabular-nums">
                    ({t.count})
                  </span>
                ) : null}
              </>
            ),
          }))}
          active={tab}
          onChange={(id) => onTabChange(id as LeftPaneTab)}
          className="w-full [&>button]:flex-1"
        />
      </div>

      <div className={cn('min-h-0 flex-1 overflow-y-auto p-3', THIN_SCROLL)}>
        <div
          role="tabpanel"
          id={`left-pane-panel-${tab}`}
          aria-labelledby={`left-pane-tab-${tab}`}
          className="h-full"
        >
        {tab === 'outline' ? (
          <FadeIn key="outline">
            <OutlineTab
              symbols={symbols}
              activeFilePath={activeFilePath}
              onJumpToLine={onJumpToLine}
            />
          </FadeIn>
        ) : null}
        {tab === 'dna' ? (
          <FadeIn key="dna">
            <DnaTab dnaRules={dnaRules} />
          </FadeIn>
        ) : null}
        {tab === 'memory' ? (
          <FadeIn key="memory">
            <MemoryTab
              memoryIndexHits={memoryIndexHits}
              drill={drill}
              timelineLoading={timelineLoading}
              fullRecordLoading={fullRecordLoading}
              fullRecordsOpen={fullRecordsOpen}
              onSearchMemory={onSearchMemory}
              onHitClick={onHitClick}
              onBackFromTimeline={onBackFromTimeline}
              onLoadFullRecord={onLoadFullRecord}
            />
          </FadeIn>
        ) : null}
        </div>
      </div>
    </section>
  )
}
