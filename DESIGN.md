# ApexPad — Design System Blueprint (DESIGN.md)

> **Source of truth** for all ApexPad front-end work. Built per **UI/UX Pro Max — Design Intelligence** (priority categories 1→10, `--design-system` master pattern, persistence contract) and the **Awesome Frontend Agent Skills / impeccable** discipline (intent-first, domain exploration, anti-generic gates, command set).
> **Derived from:** DESIGN_AUDIT.md findings · AI Design Audit Constitution · Vercel Web Interface Guidelines · interface-design (dashboards/admin/SaaS) craft rules.
> **Status:** v1.0 — awaiting ratification (Phase 0).

---

## 0. Pro Max Method Note (transparency)

The UI/UX Pro Max search script (`search.py`) is not installed in this environment, so per that skill's own fallback rule: the palette, typography, and style directions below come from the **built-in priority table + reasoning profiles applied manually** to the verified product type (`developer tool · internal console · dense dashboard · dark mode`), **not from a database match**. Structure follows the `--design-system` MASTER contract so it can be persisted/retrieved (`design-system/apexpad/MASTER.md` equivalent = this file). Dials used: `--density 8` (dense/dashboard), `--variance 6` (balanced-modern), `--motion 3` (subtle micro-interactions).

---

## 1. Intent Brief (interface-design: Intent First — mandatory checkpoint)

```
Intent:     The engineer-auditor running an agent memory pipeline —
            alone, deep-focus, at a desk, mid-session, seconds after an
            agent turn finished. Must inspect → verify → approve with
            zero doubt and zero theater. Feel: a bank vault terminal —
            cold precision, receipts for everything, quiet confidence.
Hierarchy:  The editor + minimap owns the center stage (hero).
            The DAG pipeline rail is the co-star of the right pane.
            Telemetry chips are demoted to borderless text.
            Green exists ONLY on the single primary action.
Palette:    From the vault/ledger world: gunmetal surfaces, paper-white
            ink, signal green for *live/liveness*, gate amber for
            *human decision points*, memory violet for CCR/memory.
            (§3 — and WHY: colors mean states, not decoration.)
Depth:      Borders-only structure + ONE whisper elevation step.
            Dark theme ⇒ shadows don't read; rgba wire borders do.
Surfaces:   3-step elevation: canvas → panel → overlay. Same hue,
            lightness only. Sidebar = canvas (not a different world).
Typography: IBM Plex Sans (UI/body) + IBM Plex Mono (data/labels/
            numerals/code). Plex carries the engineering-document /
            receipt heritage; kills the Geist scaffold default.
Spacing:    4px base unit, dense workbench: panels 12–16px padding.
```

**Who is this human:** a developer auditing what an AI agent remembered, packed, and wrote. **The verb:** verify & approve. **The feel:** cold, receipted, precise — *never* playful, never marketing.

---

## 2. Domain Exploration (interface-design: all four outputs)

**Domain (concepts/metaphors/vocabulary):** vault & receipts · frozen prefix / KV-cache · memory tiers (index → timeline → record) · gates & quarantine · DAG pipeline · symbol graph & PPR ranks · context packs (U-curve pressure) · DNA invariants.

**Color world (what exists in this world):** gunmetal steel (vault shelving) · paper white on carbon (printed receipts) · signal green (live systems) · amber warning stencils on machinery · violet UV marker ink (archival) · red halt stickers · blueprint-line hairlines.

**Signature (could only exist for ApexPad):** the **Receipt System** — every consequential action emits a hash-chip artifact (sha prefix chip + `.bak` provenance + "disk untouched" copy), rendered as a first-class UI element family, plus the **Tier Stepper** (Tier 0→1→2 memory access as a visible stateful contract). Five placement points: commit receipts, rollback receipts, tier badges, gate verdict chips, re-inflate hash chips.

**Defaults being rejected:**
1. Verbatim GitHub-dark chrome → **ApexPad ledger-vault token set** (same usable darkness, owned naming + one signature accent).
2. Geist scaffold pairing → **IBM Plex Sans/Mono**.
3. Equal-width three-pane parking lot → **hero center (editor), instrument right, index left** with re-proportioned columns and varied rhythm.
4. Chip-everything header → **borderless telemetry line** (text-first, 2 chips max).
5. Decorative glows → **deleted**; depth via wire borders only.

**Swap test:** swap Plex→Geist and the vault→GitHub palette and the design collapses to generic — that's the proof these choices carry the identity. **Token test:** `--vault`, `--receipt`, `--signal-gate`, `--memory` read as ApexPad's world, not `--gray-700`'s.

---

## 3. Design Tokens (Constitution V01 — mandatory JSON contract)

Named for the domain, not the hex. **Rule: no raw hex anywhere in `src/components/apexpad/**`** (enforced by re-audit grep).

```jsonc
{
  "color": {
    // Surfaces — one hue, lightness steps only (whisper-quiet)
    "--vault":        "#0d1117",  // canvas / app bg            (surface-0)
    "--vault-1":      "#161b22",  // panel bg                   (surface-1)
    "--vault-1-hover":"#1c2128",  // panel hover
    "--receipt":      "#21262d",  // control/receipt bg         (surface-2)
    "--receipt-hover":"#2d333b",  // control hover
    "--well":         "#0a0d12",  // inputs & wells: DARKER than
                                  // surroundings (inset = "type here")
    // Ink — 4-level text hierarchy (not 2)
    "--ink-strong":   "#e6edf3",  // headings, hero values
    "--ink":          "#c9d1d9",  // body
    "--ink-muted":    "#8b949e",  // labels, meta   (4.6:1 on --vault —
                                  //  keep ≥11px/500 or bump size)
    "--ink-ghost":    "#6e7681",  // disabled only
    // Wire — rgba border progression (borders disappear unless sought)
    "--wire":         "rgba(240,246,252,0.10)",  // default
    "--wire-soft":    "rgba(240,246,252,0.06)",  // separation
    "--wire-strong":  "rgba(240,246,252,0.16)",  // emphasis
    "--wire-focus":   "rgba(88,166,255,0.55)",   // focus ring only
    // Signals — color = meaning, locked (V05 + 60/30/10)
    "--action":       "#238636",  // THE primary action bg (green is
      "--action-hover":"#2ea043", // for actions. Nothing else.)
    "--signal-live":  "#3fb950",  // live/success fg (SSE, gate-clear)
    "--signal-gate":  "#d29922",  // human decision points ONLY:
                                  // approval, quarantine, truncation
    "--signal-danger":"#f85149",  // errors, deny, rollback-needed
    "--danger-strong":"#da3633",  // destructive bg
    "--signal-info":  "#58a6ff",  // focus ring, links, info — the ONE blue
    "--memory":       "#d2a8ff",  // CCR/memory/PPR identity (violet)
    // Derived
    "--action-ink":   "#ffffff",  // text on --action
    "--gate-wash":    "rgba(210,153,34,0.10)",   // gate surface tint
    "--memory-wash":  "rgba(210,153,255,0.08)" // memory tint
  },
  "spacing": {  // 4px base; NO half-steps (gap-1.5/p-2.5 banned)
    "0": "0", "1": "4px", "2": "8px", "3": "12px", "4": "16px",
    "6": "24px", "8": "32px", "12": "48px", "16": "64px",
    "panel-pad": "12px",     // dense workbench (interface-design: 12-16)
    "section-gap": "24px"    // real air between groups
  },
  "radius": {   // concentric: outer = inner + padding
    "control": "4px",   // buttons, inputs, chips
    "panel":   "6px",   // cards, panels
    "overlay": "10px"   // dialogs, popovers, sheets
  },
  "typography": {
    "sans": "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif",
    "mono": "IBM Plex Mono, ui-monospace, monospace",
    "numerals": "tabular-nums on EVERY dynamic number (counts, %, tokens, elapsed, PPR)",
    "scale": "see §4"
  },
  "motion": {
    "duration": { "press": "120ms", "control": "160ms", "panel": "220ms", "overlay": "240ms" },
    "easing":   { "enter": "cubic-bezier(0.23,1,0.32,1)", "move": "cubic-bezier(0.77,0,0.175,1)" },
    "reduced":  "MotionConfig reducedMotion='user' + global CSS block",
    "budget":   "≤300ms everything; 100+×/day actions animate NOT at all"
  },
  "depth": {
    "strategy": "borders-only + one elevation step (dark mode)",
    "wire": "1px --wire on panels; --wire-soft for internal dividers",
    "overlay-shadow": "0 8px 24px rgba(0,0,0,0.44) — overlays only",
    "banned": "glow shadows (rgba(88,166,255,…)), layered lift shadows on cards"
  }
}
```

**Tailwind wiring:** map into `@theme` (`--color-vault`, `--color-wire`, …) so utilities become `bg-vault`, `border-wire`, `text-ink-muted`. `globals.css` sets `color-scheme: dark` on `:root`, `<meta name="theme-color" content="#0d1117">`, and the dead light oklch block is removed (single-theme is a **decision**, recorded here).

---

## 4. Type Scale (V02 — ratio 1.2, weight beats size)

The Apple/Linear lever set: **size + weight + color** together, never size alone.

| Token | Size | Weight | Ink | Usage |
|---|---|---|---|---|
| `display` | 28px/600 | mono? no — sans | `--ink-strong` | empty-state heroes only |
| `title` | 18px/600 | sans | `--ink-strong` | page/pane title (the ONE h1) |
| `heading` | 15px/600 | sans | `--ink-strong` | section headings (h2/h3) |
| `body` | 13px/400 | sans | `--ink` | default UI text |
| `body-strong` | 13px/600 | sans | `--ink-strong` | emphasis rows |
| `label` | 12px/500 | sans | `--ink-muted` | field labels, secondary |
| `meta` | 11px/500 | **mono** | `--ink-muted` | timestamps, hashes, counts — **absolute floor** |
| `code` | 13px/400 | mono | `--ink` | editor, packs, payloads |

**Hard rules:** `text-[8px]`/`text-[9px]`/`text-[10px]` are **deleted** — grep-enforced. Editor payload viewers ≥13px with folding; if it doesn't fit, it folds (`max-h` + expand), never shrinks. Headings get `text-wrap: balance`; body `text-wrap: pretty`. Uppercase+tracking is permitted **only** for the `meta` mono receipt labels — replace the `TinyLabel` all-caps sans eyebrows.

---

## 5. Layout & Hierarchy (A03/I04 — one focal point)

```
┌────────────────────────────────────────────────────────────────────┐
│ HEADER  ApexPad ◆ [file] ◆ ── telemetry as borderless text ── live │  48px
├──────────────┬─────────────────────────────────────┬───────────────┤
│ LEFT 280px   │ CENTER (hero) 1fr                   │ RIGHT 380px   │
│ index:       │ editor title @18px 600 = focal      │ DAG rail      │
│ sessions,    │ textarea + minimap                   │ (4 numbered   │
│ outline,     │ ── real air (24px section-gap) ──    │  stages,      │
│ memory       │ Agent Console (1 input, 2 actions)   │  connectors,  │
│ tiers        │                                      │  gate amber)  │
│ (quiet 60%)  │                                      │ event feed    │
└──────────────┴─────────────────────────────────────┴───────────────┘
```

- **Proportions speak:** 280px left says "index serves content"; 380px right says "instrument panel". Hero center wins via the 18px title + whitespace ring — everything else is 12-13px.
- **Rhythm breathes unevenly:** dense control zones (console, pipeline rail) → open content (editor, packs). Vary `section-gap` deliberately; kill the uniform `p-3 gap-3 mt-2` monotone.
- **Spatial system:** sidebar = canvas bg (not a different world) + 1px wire divider.
- **60/30/10:** gunmetal surfaces 60% · ink 30% · accent ≤10% — and green is spent on exactly one element per view.
- **Verify tab dead zones:** sub-tab panels fill with content or collapse the pane height — no button-over-void.

---

## 6. Component Patterns (record the values — extract on 2nd reuse)

| Component | Values | Notes |
|---|---|---|
| **Button/primary** | h-40px · px-16px · r-4 · `--action` bg · 13px/600 · press scale(0.97) · hover `--action-hover` | exactly one per view |
| **Button/secondary** | h-36px · px-12px · r-4 · `--receipt` bg · 1px wire · 13px/500 | |
| **Button/ghost** | h-32px · px-8px · text `--ink-muted` · hover `--vault-1` | telemetry actions |
| **Icon button** | 44×44 hit (visual ≥28px + pseudo-element pad) · `aria-label` required | G01: no meaningless icons — Save icon means save |
| **Panel** | r-6 · `--vault-1` · 1px `--wire` · pad 12px · heading 15px/600 + 12px gap | single Panel primitive, no per-file copies |
| **TabStrip** | h-40px tabs · `role="tablist"` + `aria-selected` + arrow-key roving focus · active = 15px/600 ink-strong + 2px underline `--signal-info` | ONE component for all 4 strips |
| **Field** | well bg · 1px `--wire` · r-4 · h-36px · visible 12px/500 label (htmlFor) · placeholder "…" · focus `--wire-focus` ring 2px | label always visible; placeholder is an example, not the label |
| **Chip** | h-24px · r-4 · mono 11px/500 · 1px wire · optional status dot | chips are DATA (hashes, counts) — never actions |
| **Receipt (signature)** | hash chip: mono 11px `--memory` on `--memory-wash` · sha prefix 7 chars · provenance line 11px mono muted | family: commit/rollback/tier/gate/re-inflate |
| **TierStepper (signature)** | 3 steps · 24px nodes · connector 1px wire · per-state badge (pending wire / loading spinner / done `--signal-live` + 11px mono) | do not restyle per-pane |
| **GateBadge** | icon + text + color (never color-only) · amber = human decision · red = halt · green = clear | |
| **EmptyState** | 15px/600 heading + 13px body + next-step action button · 28px display glyph max | every list, every tab panel |
| **Dialog** | Radix primitive · r-10 · overlay 240ms enter · focus trap + Escape + scroll-lock + `overscroll-behavior: contain` + `aria-labelledby` · `--vault-1` bg | delete DarkDialog & ToolOutputDialog customs |
| **Toast** | auto-dismiss 6s (fix the 1000000ms) · role="status" · errors carry a next-step link | |
| **EventRow** | 13px body · icon+verb+target · payload in expandable `<details>` 13px mono (fold, don't truncate to 120 chars) | aria-live="polite" on the feed |

---

## 7. States Matrix (Constitution U01 — mandatory per surface)

| Surface | Loading | Empty | Error | Success |
|---|---|---|---|---|
| Left lists (outline/DNA) | inline spinner row | instructive + CTA | **inline retry row** (new) | n/a |
| Editor | indexing chip | never (by design) | toast + inline banner | save receipt chip (new) |
| DAG rail | per-stage shimmer | "Stage an edit →" (keep — it's good) | quarantine w/ **remediation path** (new) | stage status badge |
| Event feed | skeleton ×3 | "No events yet — run a turn" | disconnected banner (honest, new) | live dot |
| Verify suite | per-gate spinner | "Run the suite" | per-gate fail row w/ retry | gate-clear receipt |
| Dialogs | spinner | not-found copy | error + retry | result (keep — best in codebase) |

Every async surface: `aria-busy` + visible change within 2s (U02).

---

## 8. Accessibility Contract (AX01–AX07 — P0, non-negotiable)

1. **Keyboard 100%** (AX01): ⌘K palette (cmdk) — every action reachable by name; ⌘S save; `A`=approve, `R`=reject on focused artifact; minimap gets arrow-key navigation + focusable scrubber; TabStrips rove with ←/→.
2. **Focus visible** (AX02): `focus-visible: 2px ring --wire-focus + offset 1px` on every interactive; `:focus` (not `-visible`) only inside palette-type widgets; never `outline-none` without replacement.
3. **Contrast** (AX03): `--ink-muted` only at ≥11px/500 or 12px; all body text `--ink`/`--ink-strong`; validate 4.5:1 on new tokens.
4. **Touch** (AX04): 44×44px hit areas (visual may be smaller + padded pseudo-element); no overlapping hit zones.
5. **Labels** (AX05): every input has visible `<label htmlFor>`; inputs get `name` + `autocomplete="off"` (non-auth tool); icon-only controls `aria-label`.
6. **Headings** (AX06): one `h1` (pane title "ApexPad"), `h2` per pane section, `h3` within — no skips; `scroll-margin-top` on anchors.
7. **Reduced motion** (AX07): framer `MotionConfig reducedMotion="user"` at root + CSS `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation-duration:0.01ms !important; transition-duration:0.01ms !important } }`; the `animate-ping` SSE dot swaps to a static dot.
8. **Live regions:** EventFeed, boot splash, search status, SSE badge → `aria-live="polite"` + `role="status"`.

---

## 9. Forms & Feedback (U05)

Visible labels always (placeholder is an example pattern ending in `…`) · inline validation on blur, error text 12px `--signal-danger` **next to the field** with a fix hint · paste never blocked · submit disabled only until request starts, spinner during · budget/number inputs `type="number"` + min/max + mono `tabular-nums` · unsaved editor changes → `beforeunload` guard.

---

## 10. Motion Spec (I01–I04)

- **Budget:** press 120ms · controls 160ms · panels 220ms · overlays 240ms — **everything ≤300ms**. Line-flash: 1000ms → **320ms** fade.
- **Easing:** enter `cubic-bezier(0.23,1,0.32,1)`; on-screen move `cubic-bezier(0.77,0,0.175,1)`. Never ease-in, never bounce.
- **Properties:** `transform`/`opacity` only; name properties (`transition-[color,box-shadow]`), `transition-all` banned.
- **Popovers** scale from trigger origin at `scale(0.97)+opacity:0` (never 0); modals stay centered.
- **Hero moment (I04):** the **approval receipt animation** — on Approve, the gate badge stamps to gate-clear with a 240ms scale-settle + receipt chip draws in. One memorable motion, tied to the product's soul. Everything else stays quiet.
- **No animation** on: palette actions, tab switches, save (100+×/day).

---

## 11. Keyboard Layer (new — Nielsen #7)

| Scope | Binding |
|---|---|
| Global | `⌘K`/`Ctrl+K` palette (cmdk): fuzzy actions + jump-to-symbol + run commands |
| Global | `⌘S` save · `⌘1/2/3` focus left/center/right pane |
| Editor | `⌘Enter` run agent turn · `Esc` blur |
| Artifact (focused) | `A` approve (opens sheet) · `R` reject (opens note) · `Enter` expand diff |
| Tabs | `←`/`→` rove · `Home`/`End` |
| Minimap | focusable; `↑`/`↓` scrub, `PageUp/Down` page |

Show bindings in palette rows (`⌘ K` with nbsp) + a `?` shortcuts sheet. Non-breaking space in all chord copy.

---

## 12. Responsive (R01–R04)

| Breakpoint | Layout |
|---|---|
| `<640px` | **Pane-switcher mode:** bottom nav (≤5: Index/Editor/Pipeline/Verify) swaps panes; header collapses to logo + live dot + ⋯ overflow (2 chips max); dialogs → Radix Sheet (bottom, `overscroll-behavior: contain`); floating action repositioned to clear text |
| `640–1023px` | Two-pane: left collapses to icon rail; right becomes overlay drawer |
| `1024–1535px` | Full 280/1fr/380 workbench |
| `≥1536px` (UltraWide) | Max-w 1680px centered; surplus air goes to center pane, not margins-of-margins |

Plus: `env(safe-area-inset-*)` padding on shell bottom · `touch-action: manipulation` global · `-webkit-tap-highlight-color: transparent` · no horizontal scroll at 320px (R02) · 400% zoom keeps pane-switcher usable (R03).

---

## 13. Content & Microcopy

- **Terminology table (single source):** "Agent Turn" (not run/execute drift) · "Stage as DAG Edit" · "Approve & Commit" / "Reject" · "Re-inflate" · "gate clear / awaiting human approval" · "disk untouched". Sentence case everywhere; Title Case only for proper nouns (DNA Vault).
- **Jargon onboarding (Jordan fix):** every blueprint term (CCR, TOIN, Ripwire, U-Curve, PPR, MEM0, Frozen Prefix) gets a **hover/focus tooltip with a one-line definition + "more" link to a glossary dialog** — Tier-0-for-concepts: short line inline, depth on demand. First-run empty states teach the loop in ≤2 sentences.
- **Numbers:** numerals for counts; `Intl.DateTimeFormat`/`Intl.NumberFormat`/`Intl.RelativeTimeFormat` only; "18.37%" style values tabular.
- **Errors:** problem + fix + control ("Staging failed — the file changed on disk. Re-diff →").
- Glyph discipline: one warning glyph style (⚠️ everywhere, or none) — no drift.

---

## 14. Performance (P01–P05)

Canvas minimap sized with explicit width/height (keep) · throttle editor scroll → minimap via rAF (kill per-event setState, center-pane.tsx:477) · virtualize EventFeed past 50 rows · framer-motion import pruned to `m` + LazyMotion where feasible · next/font self-hosted Plex with `display: swap` · SSE-driven state updates batched per tick · CLS target <0.1 (no font/layout shift: mono fallback metric-compatible).

---

## 15. Project Anti-Pattern List (banned — grep in re-audit)

Raw hex in apexpad components · `text-[8/9/10px]` · `transition-all` · `outline-none` without focus-visible ring · glow/shadow decoration · `<div onClick>` · ALL-CAPS sans eyebrows · blue-as-accent-everywhere (blue = info/focus ONLY) · green on anything but the primary action · custom modal shells beside Radix · toasts without next steps · half-step spacing (`gap-1.5`, `p-2.5`) · `toLocale*` · emoji as icons · placeholder-as-label · decorative ping loops without reduced-motion stop.

---

## 16. Pre-Delivery Checklist (run before any UI task is called done)

1. Zero raw hex / zero sub-11px text / zero half-step spacing (grep all three)
2. Squint test: hierarchy reads at blur — hero wins, nothing jumps harshly
3. All four states present per surface (§7 matrix)
4. Tab-through: visible focus everywhere; palette opens; approve reachable by keys
5. `prefers-reduced-motion` verified live (UI settles instantly)
6. Contrast spot-check on any new token pairing (≥4.5:1)
7. 390px / 768px / 1440px screenshots clean; no horizontal scroll; footer/safe-areas intact
8. Dynamic numerals tabular; dates via Intl; toasts auto-dismiss with next steps
9. No console errors; dev.log clean
10. Copy matches the terminology table (§13)

---

## 17. Persistence & Retrieval Contract

- This file is the **MASTER**. Page-level overrides go to `design-system/apexpad/pages/<page>.md` — none exist yet; until then MASTER rules exclusively.
- Any new component used 2+ times gets its values recorded in §6 before the next reuse.
- Consistency checks on every task: spacing on the 4px grid, borders-only depth, colors from §3, patterns from §6 reused (not reinvented).
- On completion of each phase of DESIGN_AUDIT.md §12, update the phase status there and re-run the §16 checklist.
