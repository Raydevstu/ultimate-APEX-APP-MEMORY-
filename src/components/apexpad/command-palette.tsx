'use client'

/**
 * src/components/apexpad/command-palette.tsx
 * ⌘K command palette (DESIGN.md §11 — the keyboard layer).
 * Built on cmdk + the project's Radix Dialog primitive: full focus trap,
 * Escape-to-close, arrow navigation, fuzzy action search. Every workbench
 * action is reachable by keyboard from here (Constitution AX01).
 */
import * as React from 'react'
import { Command } from 'cmdk'
import {
  ArrowLeftRight,
  CheckCircle2,
  Database,
  FileDiff,
  GitBranch,
  ListTree,
  Play,
  Save,
  ScrollText,
  ShieldCheck,
  Square,
  Undo2,
  Wrench,
} from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

export interface PaletteAction {
  id: string
  label: string
  /** Shown on the right — e.g. a key chord. Use nbsp inside chords. */
  hint?: string
  group: 'Workbench' | 'Navigate' | 'Pipeline' | 'Verification'
  icon: React.ReactNode
  /** Disabled actions stay visible with their reason. */
  disabled?: boolean
  disabledReason?: string
  run: () => void
}

export function CommandPalette({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: PaletteAction[]
}) {
  /* Reset the query each time the palette opens. */
  const [query, setQuery] = React.useState('')
  React.useEffect(() => {
    if (open) setQuery('')
  }, [open])

  const groups: PaletteAction['group'][] = [
    'Workbench',
    'Pipeline',
    'Verification',
    'Navigate',
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden border-wire bg-vault-1 p-0"
        aria-describedby={undefined}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <Command shouldFilter={true} loop={true}>
          <div className="border-b border-wire">
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Type a command or search…"
              aria-label="Command palette search"
              autoComplete="off"
              spellCheck={false}
              className="h-12 w-full bg-transparent px-4 font-mono text-[13px] text-ink-strong outline-none placeholder:text-ink-muted"
            />
          </div>
          <Command.List className="max-h-[46vh] overflow-y-auto p-1.5 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-receipt [&::-webkit-scrollbar]:w-1.5">
            <Command.Empty className="px-3 py-6 text-center font-mono text-xs text-ink-muted">
              No commands match “{query}”.
            </Command.Empty>
            {groups.map((group) => (
              <Command.Group
                key={group}
                heading={group}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.14em] [&_[cmdk-group-heading]]:text-ink-muted"
              >
                {actions
                  .filter((a) => a.group === group)
                  .map((action) => (
                    <Command.Item
                      key={action.id}
                      value={`${action.label} ${action.group}`}
                      disabled={action.disabled}
                      onSelect={() => {
                        if (action.disabled) return
                        onOpenChange(false)
                        action.run()
                      }}
                      className={cn(
                        'flex min-h-[40px] cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 font-mono text-xs text-ink',
                        'data-[selected=true]:bg-receipt data-[selected=true]:text-ink-strong',
                        'data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50',
                        'focus-visible:outline-none',
                      )}
                    >
                      <span className="shrink-0 text-ink-muted" aria-hidden>
                        {action.icon}
                      </span>
                      <span className="flex-1 truncate">{action.label}</span>
                      {action.disabled && action.disabledReason ? (
                        <span className="shrink-0 text-[11px] text-ink-ghost">
                          {action.disabledReason}
                        </span>
                      ) : action.hint ? (
                        <kbd className="shrink-0 rounded border border-wire bg-vault px-1.5 py-0.5 text-[11px] text-ink-muted">
                          {action.hint}
                        </kbd>
                      ) : null}
                    </Command.Item>
                  ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

/* Icon helpers so page.tsx stays tidy */
export const paletteIcons = {
  save: <Save className="h-3.5 w-3.5" />,
  run: <Play className="h-3.5 w-3.5" />,
  stage: <GitBranch className="h-3.5 w-3.5" />,
  approve: <CheckCircle2 className="h-3.5 w-3.5" />,
  reject: <Square className="h-3.5 w-3.5" />,
  rollback: <Undo2 className="h-3.5 w-3.5" />,
  spec: <ScrollText className="h-3.5 w-3.5" />,
  pack: <FileDiff className="h-3.5 w-3.5" />,
  dag: <ArrowLeftRight className="h-3.5 w-3.5" />,
  staging: <ShieldCheck className="h-3.5 w-3.5" />,
  verify: <ShieldCheck className="h-3.5 w-3.5" />,
  outline: <ListTree className="h-3.5 w-3.5" />,
  memory: <Database className="h-3.5 w-3.5" />,
  hook: <Wrench className="h-3.5 w-3.5" />,
}
