# ApexPad — Front-End Design Audit Report

**Scope:** Entire user-facing front-end of the ApexPad workbench (`/` route) — `src/app/*`, `src/components/apexpad/*` (8 components, 4,523 LOC), `src/hooks/*`, `src/lib/apexpad-client.ts`, `src/app/globals.css`, `src/app/layout.tsx`. ~5,400 LOC audited.

**Method (per `design-critique` protocol):** Three independent assessments, synthesized —
1. **Assessment A — LLM Design Review** (design-director evaluation of all source: AI-slop detection, hierarchy, Nielsen heuristics, cognitive load, personas).
2. **Assessment B — Deterministic Detection** (`npx impeccable --fast` scan + manual rule-by-rule scan of the Vercel Web Interface Guidelines, file:line findings).
3. **Assessment C — Live Browser Verification** (Agent Browser: desktop 1440×900, mobile 390×844, keyboard focus probes, console/error check).

**Governing documents applied:** AI Design Audit Constitution (all gates A/G/U/AX/V/P/R/I) · Vercel Web Interface Guidelines (fetched latest) · design-polish checklist · design-critique structure · interface-design (dashboards/admin/SaaS craft) · UI/UX Pro Max priority categories.

---

## 1. Design Health Score — Nielsen's 10 Heuristics

| # | Heuristic | Score | Key Issue |
|---|-----------|:-----:|-----------|
| 1 | Visibility of System Status | **4** | Genuinely excellent: elapsed-seconds on agent runs, `indexing…` spinner, SSE ping dot, DAG highlight-on-running, receipt toasts with sha prefixes |
| 2 | Match System / Real World | **2** | Authentic vocabulary — but CCR/TOIN/U-Curve/Ripwire/PPR/MEM0 appear with zero glossary or on-demand explanation |
| 3 | User Control & Freedom | **3** | 1-click `.bak` rollback is a real escape; but `runAgentTurn`/`stageDag` forcibly hijack the right-pane tab (page.tsx:231, 288) |
| 4 | Consistency & Standards | **2** | Same hue = many meanings (amber = stale, indexing, CCR, verifier, rollback, truncation); custom dialogs bypass installed Radix; two different tab a11y standards |
| 5 | Error Prevention | **3** | Good disabled-until-valid logic; strict quarantine default-on. But **Approve & Commit writes to disk instantly, no confirmation** |
| 6 | Recognition Rather Than Recall | **3** | Prefilled demo fixtures are thoughtful; `@e1` RefMap syntax and hook simulator require recall |
| 7 | Flexibility & Efficiency | **1** | **Zero keyboard shortcuts. No ⌘K palette. No ⌘S. Mouse-only approve/reject/rollback/minimap.** |
| 8 | Aesthetic & Minimalist Design | **2** | Disciplined and dense, but decoration-by-borders, uniform density, 8–11px text mush |
| 9 | Error Recovery | **2** | Every failure is a destructive toast with a raw error string ("Request failed" + err.message); no inline retry |
| 10 | Help & Documentation | **1** | No onboarding, no glossary, no help surface; documentation = `title` tooltips + seed note |
| | **TOTAL** | **23/40** | **Lower-middle band** (typical real interface: 20–32) |

---

## 2. Constitution Gate Compliance Matrix

| Gate | Verdict | Evidence |
|------|:-------:|----------|
| A01 User Goal Clarity | ✅ PASS | Purposeful tool, not decoration |
| A02 Single Core Purpose | ⚠️ RISK | Every pane justifies itself, but 13 primary surfaces + 3 dialogs on one route strains it |
| A03 Information Hierarchy | ❌ FAIL | No focal point; editor, DAG plane, header chips compete at identical visual volume |
| A04 Visual Intent | ❌ FAIL | Decorative glows (header.tsx:67, right-pane.tsx:170); chip saturation in header |
| G01 Anti-Generic | ❌ FAIL | Verbatim GitHub-dark palette (~400 hardcoded usages); ALL-CAPS micro-eyebrows (`TinyLabel`); Geist scaffold font; glow shadows |
| G02 Domain Specificity | ✅ PASS* | Content layer is deeply domain-specific (tier stepper, DNA vault, receipt culture) — but *accidentally*, via data model, not visual system |
| G03 No Copy Placeholder | ✅ PASS | No lorem/sample data; browser-tab title is scaffold leftover ("Z.ai Code Scaffold - AI-Powered Development", layout.tsx:16-36) |
| U01 Four States per screen | ⚠️ PARTIAL | Dialogs & verification-panel complete; center editor lacks empty/success; left-pane lists error = global toast only (matrix in §7) |
| U02 Action Visibility <2s | ✅ PASS | Primary CTAs obvious (min-h-44 green) |
| U03 7±2 Actions | ❌ FAIL | Verify→Pipeline: ~10 controls (verification-panel.tsx:1131-1228); Guardrails form: 6 inputs + run |
| U04 Cognitive Load | ⚠️ MODERATE | 3/8 checklist failures (§5) |
| U05 Form Friction | ⚠️ PARTIAL | Paste OK, labels in verification-panel only; no inline validation elsewhere; no unsaved-changes guard |
| AX01 Keyboard 100% | ❌ FAIL | No shortcuts, no palette; minimap canvas unfocusable (minimap.tsx:191-217) |
| AX02 Visible Focus | ❌ FAIL | center-pane.tsx:480 `outline-none` with no replacement; live probe: first Tab shows transparent ring token |
| AX03 WCAG AA Contrast | ⚠️ UNVERIFIED | `#8b949e` on `#0d1117` ≈ 4.6:1 passes for large text only; `text-[9px]` at 4.6:1 is practically unreadable |
| AX04 Touch Targets 44px | ❌ FAIL | header.tsx:104 (32px), ui-kit.tsx:148 (~22px), chips ~20px, right-pane.tsx:835 / verification-panel.tsx:1477 (40px) |
| AX05 Proper Labels | ❌ FAIL | Editor textarea (center-pane.tsx:473), search input (left-pane.tsx:328), agent prompt, tool inputs unlabeled |
| AX06 Heading Hierarchy | ❌ FAIL | Zero `h1–h6` in the app; all section headers are styled `div`s |
| AX07 Reduced Motion | ❌ FAIL | Zero `prefers-reduced-motion` handling despite framer-motion, `animate-ping` loop (ui-kit.tsx:104), 1000ms line-flash |
| V01 Design Tokens | ❌ FAIL | No token system in use; 20 distinct raw hex values across 9 files; dead `GITHUB` const (constants.ts:15) + dead oklch `:root` block (globals.css:46-79) |
| V02 Typography Scale | ❌ FAIL | No scale: 63× `text-[10px]`, 38× `text-[9px]`, 1× `text-[8px]`; max size in app = 13px |
| V03 Spacing System | ⚠️ PARTIAL | 4px grid followed but monotone; off-scale half-steps (`gap-1.5`, `p-2.5`) pervasive |
| V04 Visual Consistency | ❌ FAIL | Native checkbox `accent-[#f85149]` vs styled controls; two tab systems; two dialog systems |
| V05 No Color-Only | ✅ PASS* | Badges pair icon+text; sole exception: hot/cold symbol border (left-pane.tsx:71) |
| P01–P05 Performance | ⚠️ PARTIAL | Canvas minimap CLS-safe; SSE re-render churn (center-pane.tsx:477 scroll setState); no virtualization for long event feeds |
| R01 Mobile/Tablet/Desktop/UW | ❌ FAIL | 390px = 1,920px vertical scroll, no pane switcher; floating "N" button overlaps editor text (live-verified) |
| R02 No Horizontal Scroll | ✅ PASS | Verified live at 390px |
| R03 400% Zoom | ⚠️ UNTESTED | 8–11px text will hit minimum-size clamps |
| R04 Portrait + Landscape | ⚠️ PARTIAL | Stacks but unoptimized (R01) |
| I01 Interaction Feedback | ⚠️ PARTIAL | Hover/loading present; copy button without copied feedback (verification-panel.tsx:478) |
| I02 Animation Purpose | ✅ PASS | Animations mostly explain state (collapse, flash) |
| I03 Motion Budget 150-300ms | ❌ FAIL | Line-flash 1000ms (center-pane.tsx:493) |
| I04 One Hero Moment | ❌ FAIL | No hero moment exists at all — flatness |

**Gate tally: 9 PASS · 6 PARTIAL/RISK · 16 FAIL**

---

## 3. Anti-Patterns Verdict (AI Slop Detection)

**Verdict: "Slop chassis, custom engine" — moderate slop.**

- The 5-second test **fails**: verbatim GitHub Primer dark palette (20 hexes, ~400 usages — the codebase's own `constants.ts:15` names the object `GITHUB`, and **no file imports it**); untouched Geist/Geist-Mono scaffold fonts; canonical equal-width three-column skeleton (`grid-cols-[300px_minmax(0,1fr)_400px]`, page.tsx:525); uppercase 10px tracked micro-labels; chip-everything telemetry header; decorative glows.
- The 30-second test **complicates it**: the content layer is genuinely specific — 18 typed SSE events with distinct icons, memory Tier 0→1→2 stepper, DNA vault with category-coded rules, quarantine gate, sha256 receipt culture. **The identity lives in the data model, not the visual system. That is an accident, not a decision.**
- Deterministic scan agrees: `impeccable` flagged the accent-border tell (left-pane.tsx:71, 367); manual scan confirms the generic-dark-IDE dialect. Both assessments independently converged on the same root cause: **a dead token layer forcing every component to hardcode a borrowed palette.**

---

## 4. Overall Impression

A functionally deep, operationally honest expert console wearing a rented, illegible skin. The single biggest opportunity: **the product's soul (receipts, tiers, gates, hashes) is already in the copy and data model — the visual system just needs to be rebuilt from that identity instead of from GitHub's theme**, with a keyboard layer and human-scaled typography.

---

## 5. Cognitive Load Assessment

| Item | Result |
|------|--------|
| (a) >2 font families | ✅ Geist + Geist Mono |
| (b) >4 accent colors | ❌ 5 hue families / 10 accent hexes (blue ×4, green ×4, amber, red, purple) |
| (c) >7±2 actions per region | ❌ Verify→Pipeline ≈10 controls; Guardrails form 6 inputs + run |
| (d) Walls of undifferentiated text | ❌ Context Pack raw XML `<pre>` 10px × 420px, no folding/highlight; event payloads = truncated 9px JSON |
| (e) No progressive disclosure | ✅ Tier stepper, collapsible stages, dialogs |
| (f) Inconsistent spacing | ✅ Faithful 4px grid (though monotone) |
| (g) Unclear primary action | ✅* One green primary per view (but "Run Agent Turn (SPEC → CONTEXT PACK → LLM)" is a 38-char pipeline diagram wearing a button) |
| (h) Icon overload | ✅ Icons nearly always labeled |

**Failure count: 3 → Moderate.** Failures cluster in the Verify tab.

---

## 6. What's Working (keep and build on)

1. **Memory Tier Stepper** (left-pane.tsx:318-324, 156-175) — renders an abstract memory architecture as a visible, stateful interaction contract with per-tier loading/done/pending badges. A real signature (Gate G02 earned here).
2. **Honest-receipt culture** — sha256 prefixes, `.apexpad-backups/….bak` paths, "disk untouched" on reject (page.tsx:326-330), truncation disclosures as first-class warnings (right-pane.tsx:374-386). For a tool premised on *trustworthy agent memory*, this voice is emotionally correct.
3. **DAG Control Plane as numbered pipeline narrative** (right-pane.tsx:209-309) — four stages with live status highlight, commit/rollback counters, and a genuinely instructive Staging empty state (right-pane.tsx:686-690).
4. **Status visibility engine** (Nielsen #1 = 4/4) — elapsed timers, SSE heartbeat, indexing spinners are best-in-class for this stack.

---

## 7. Priority Issues (ordered by impact)

### P0-1 · Type scale collapse — the app reads at 8–11px
- **What:** 63× `text-[10px]`, 38× `text-[9px]`, 1× `text-[8px]`; largest text in the whole app is 13px. 9px mono evidence lists (verification-panel.tsx:207), 8px badges (left-pane.tsx:251).
- **Why:** The primary artifact of this product is *reading machine output*; the UI actively fights comprehension. Fails V02, AX03 (practical legibility), R03.
- **Fix:** Define a 1.2–1.25 ratio scale in `@theme` (see DESIGN.md §4): meta floor 11px, body 13px, section titles 15–16px, page title 18–22px. Delete every `text-[8px]`/`text-[9px]`. Add `tabular-nums` to all dynamic numerals.
- **Command:** `/typeset`

### P0-2 · Dead token layer + ~400 hardcoded hexes
- **What:** `GITHUB` palette const exists but is imported by nothing (constants.ts:15-33); `globals.css:46-79` defines a light oklch token set the components contradict; shadcn `Button`/`Dialog`/`Tabs` installed while `ui-kit.tsx:23-36` re-implements them as class-string constants. Two parallel design systems — one alive & untokenized, one tokenized & dead.
- **Why:** V01 fail; theming, contrast audits, consistency all impossible. Mechanical root cause of the slop verdict.
- **Fix:** Promote palette to semantic CSS variables with domain names (`--surface-0/1/2`, `--ink-muted`, `--signal-action`, … — full table in DESIGN.md §3); map into Tailwind `@theme`; add `color-scheme: dark` + `theme-color` meta; delete the dead light block or genuinely support it; migrate class-string constants onto shadcn primitives.
- **Command:** `/colorize` + `/harden`

### P0-3 · The keyboard layer does not exist
- **What:** Zero shortcuts, zero ⌘K palette, zero ⌘S; approve/reject/rollback pointer-only; minimap canvas unfocusable (minimap.tsx:191-217); tab strips lack arrow-key nav.
- **Why:** AX01 hard fail; persona Alex (the target user — a keyboard-first engineer) is disqualified; Nielsen #7 = 1/4.
- **Fix:** ⌘K command palette (cmdk); ⌘S save; `A`/`R` on focused artifact; arrow-key minimap; roving `role="tablist"` with arrow navigation. Full spec: DESIGN.md §11.
- **Command:** `/harden`

### P1-4 · The approval moment is designed for the system, not the human
- **What:** "Approve & Commit" (right-pane.tsx:755-766) performs an instant real disk write — no confirmation, no blast-radius summary at the decision point; API supports `reviewerNote` (apexpad-types.ts:377) but UI never collects it; Reject records no reason; rollback affordance only renders *after* commit (right-pane.tsx:829-845); rollback itself is immediate destructive (page.tsx:345-374).
- **Why:** This is the emotional peak of the product (Gate A03 primary action). Auditors (Priya) lose the "why"; the Vercel guideline "destructive actions need confirmation or undo" is violated.
- **Fix:** Approval sheet: diff stats + blast radius + optional/required reviewer note + explicit `.bak` notice; persistent "rollback available" chip on committed artifacts; confirm-or-undo on rollback.
- **Command:** `/clarify`

### P1-5 · No focal point — every view is a parking lot of equal panels
- **What:** Three bordered panes, uniform `p-3`/`gap-3` rhythm, everything 10px semibold; editor nominally owns the center but Agent Console and header chips compete at identical volume; Verify sub-tab renders one button above a large dead zone (live-verified).
- **Why:** Hierarchy is the difference between "designed" and "generated" (A03/A04, I04).
- **Fix:** Editor+minimap = hero (larger active-file title, dimmed chrome); demote telemetry chips to borderless text; restrict green to *actions only*; vary spatial rhythm (dense controls → open content). Full spec: DESIGN.md §2/§5.
- **Command:** `/layout` then `/distill`

### P2-6 · Accessibility floor missing (labels, live regions, headings, motion)
- **What:** Unlabeled editor/search/prompt inputs; no `aria-live` on EventFeed/boot/indexing; zero `h1–h6`; no `prefers-reduced-motion` anywhere; icon-only copy/trash buttons partially labeled; decorative glows/icons not hidden.
- **Fix:** Full ARIA + motion spec: DESIGN.md §8/§10. `MotionConfig reducedMotion="user"` + global CSS block; `aria-live="polite"` on 4 async regions; semantic heading ladder.
- **Command:** `/harden`

### P2-7 · Dialog & tab systems bypass installed primitives
- **What:** `DarkDialog` (dialogs.tsx:42-60) and `ToolOutputDialog` (center-pane.tsx:58-84): no focus trap, no Escape, no scroll lock, no `aria-labelledby`, no `overscroll-behavior: contain` — while Radix Dialog/Sheet is installed; two tab-strip implementations with different ARIA standards.
- **Fix:** One dialog primitive (Radix, dark-tokenized) + one `TabStrip` component with full `tablist` semantics (both panes adopt verification-panel.tsx:1468's pattern).
- **Command:** `/harden` + `/distill`

### P2-8 · Mobile is a stacked afterthought
- **What:** 390px = three panes stacked into 1,920px of vertical scroll; header chips wrap into 3 rows (~20% of viewport); floating "N" button overlaps editor text; minimap + toolbar not adapted (live-verified).
- **Fix:** Mobile strategy in DESIGN.md §12: bottom pane-switcher (≤5 targets), collapsed telemetry (2 chips + overflow), sheet-based dialogs.
- **Command:** `/adapt`

### P3-9 · Identity & microcopy drift
- **What:** Browser tab = "Z.ai Code Scaffold - AI-Powered Development" with z.ai favicon (layout.tsx:16-36); glyph drift "⚠" vs "⚠️" (right-pane.tsx:333 vs 735); "Run" vs "Execute command"; "booting…" vs "Listening…" case drift; "Save locally" vs "1-Click Rollback (.bak)" capitalization; EventFeed shows "Listening for capture events…" even when SSE disconnected (right-pane.tsx:108-111); icons semantically wrong (Save icon for "tokens saved %", header.tsx:140-146).
- **Fix:** Rename metadata to ApexPad + custom favicon; terminology table (DESIGN.md §13); honest disconnected state.
- **Command:** `/polish`

### P3-10 · Locale & data-format gaps
- **What:** 6× `toLocale*` call sites + custom "Ns ago" formatter instead of `Intl.RelativeTimeFormat`; no `tabular-nums` on any dynamic numeral (causes jitter in live counters — visible on "18.37% tokens saved").
- **Fix:** Central `format*` helpers on `Intl.*`; `tabular-nums` token on numeric classes.
- **Command:** `/polish`

---

## 8. Full Issue Register (deterministic scan, file:line)

### Accessibility
| Location | Issue |
|---|---|
| center-pane.tsx:473-483 | Editor `<textarea>` no `aria-label`; `outline-none` with NO focus-visible replacement |
| center-pane.tsx:149-158, 211-218, 329-333 | Agent prompt, userGoal, toolName inputs: no label/aria-label/name |
| left-pane.tsx:328-333 | Memory search input: no label/aria-label/name/autocomplete |
| left-pane.tsx:456-475, right-pane.tsx:925-944 | Tab strips without `role="tab"`/`aria-selected` (verification-panel.tsx:1468 does it correctly — unify) |
| page.tsx:499-510 | Boot splash lacks `role="status"`/`aria-live` |
| right-pane.tsx:100-146 | EventFeed async region no `aria-live` |
| left-pane.tsx:334-336 | Search spinner not announced |
| header.tsx:168-173 | SSE status flips without `role="status"` |
| page.tsx:513 | No `<h1>` anywhere; all headings are `div`s (AX06) |
| header.tsx:68,111,122,128-161 | Decorative lucide icons without `aria-hidden` |
| minimap.tsx:191-217 | Canvas navigation mouse/touch-only, not focusable — gesture-only anti-pattern |
| header.tsx:83 | Session info via `title` only — no keyboard path |

### Focus
| Location | Issue |
|---|---|
| center-pane.tsx:480 | `outline-none` without focus replacement (AX02 — the one hard fail) |
| left-pane.tsx:332, center-pane.tsx:218,333 | `focus:ring-2` uses `:focus` not `:focus-visible`; ring color mismatched with INPUT_DARK variant |
| Live probe | First Tab: ring token computes to transparent |

### Forms
| Location | Issue |
|---|---|
| All inputs | No `name`/`autocomplete` attributes |
| center-pane.tsx:217 | Placeholder straight quotes, no `…` |
| center-pane.tsx:332, verification-panel.tsx:686 | Placeholders lack `…` |
| page.tsx (editor) | No unsaved-changes `beforeunload` guard |

### Motion
| Location | Issue |
|---|---|
| globals.css + all components | Zero `prefers-reduced-motion` handling (AX07) |
| ui-kit.tsx:104 | `animate-ping` infinite loop, no stop |
| center-pane.tsx:493 | Line-flash 1000ms (I03: ≤300ms) |
| ui-kit.tsx:193-233 | FadeIn/SlideInItem without reduced-motion wrapper |
| Live probe | `animate-spin` during boot, no reduced variant |

### Typography & Content
| Location | Issue |
|---|---|
| All numeric readouts | No `tabular-nums` (header.tsx:39,127-164; center-pane.tsx:466,173) |
| right-pane.tsx:365-372 | Context Pack XML: 10px `<pre>`, no folding, no syntax emphasis |
| right-pane.tsx:136-138 | Event payloads truncated at 120 chars, 9px |
| verification-panel.tsx:207 | 9px mono evidence lists |
| left-pane.tsx:251 | 8px badges |

### Theming & Tokens
| Location | Issue |
|---|---|
| 9 files (~400 usages) | 20 distinct hardcoded hexes — full inventory: §9 |
| layout.tsx:44 | No `color-scheme: dark`; no `class="dark"`; dead `.dark` block |
| layout.tsx:16-36 | Scaffold metadata; no `themeColor`; no `viewport` export |
| globals.css:115-122 | No `overscroll-behavior`; no safe-area `env()`; no global reduced-motion block |

### Navigation & State
| Location | Issue |
|---|---|
| page.tsx:74-75,91-101 | leftTab/rightTab/dialog/memory-drill state in `useState` only — no URL deep-linking |
| page.tsx:345-374 | Rollback immediate, no confirm |
| right-pane.tsx:830-845 | "1-Click Rollback (.bak)" no confirm; 40px target |
| right-pane.tsx:755-766 | Approve & Commit instant, no reviewer note |

### Touch (AX04)
| Location | Issue |
|---|---|
| header.tsx:104 | 32px save button |
| ui-kit.tsx:144-159 | CopyButton ~22px |
| center-pane.tsx:255-264, right-pane.tsx:238-245 | Chips ~20px |
| verification-panel.tsx:1477, right-pane.tsx:835 | 40px |
| left-pane.tsx:344 | ~28px back button |
| globals | No `touch-action: manipulation`; tap-highlight unstyled |

### Locale & Hydration
| Location | Issue |
|---|---|
| header.tsx:100,116; right-pane.tsx:821,824,858; verification-panel.tsx:1255 | `toLocale*` instead of `Intl.DateTimeFormat` |
| apexpad-client.ts:301-313 | Custom relative-time formatter instead of `Intl.RelativeTimeFormat` |

### Hooks/lib
| Location | Issue |
|---|---|
| use-toast.ts:12 | `TOAST_REMOVE_DELAY = 1000000` — toasts never auto-dismiss (live-region clutter) |

---

## 9. Hardcoded Hex Inventory (token migration map)

| Hex | Semantic role | Migrate to (DESIGN.md §3) |
|---|---|---|
| `#0d1117` | canvas/field bg | `--surface-0` |
| `#161b22` | panel/card bg | `--surface-1` |
| `#1c2128` | hover bg | `--surface-1-hover` |
| `#21262d` | control bg | `--control` |
| `#30363d` | border/default | `--wire` |
| `#8b949e` | muted fg | `--ink-muted` |
| `#c9d1d9` | body fg | `--ink` |
| `#e6edf3` | bright fg / headings | `--ink-strong` |
| `#58a6ff` / `#79c0ff` / `#a5d6ff` / `#1f6feb` | blue accent ×4 | consolidate → `--signal-info` + `--memory` (one blue) |
| `#3fb950` / `#7ee787` | success fg | `--signal-live` |
| `#238636` / `#2ea043` | action bg/hover | `--action` / `--action-hover` |
| `#d29922` | warning/gate amber | `--signal-gate` |
| `#f85149` / `#da3633` | danger | `--signal-danger` / `--danger-strong` |
| `#d2a8ff` | memory/CCR purple | `--memory` |
| rgba glows (header.tsx:67, right-pane.tsx:170, minimap.tsx:35) | decorative | **delete** (G01) |

---

## 10. Persona Red Flags

**Alex (Power User, keyboard-first engineer) — catastrophic:**
No shortcuts, no palette, no ⌘S, mouse-only approve/reject/rollback/minimap, no batch approval. His fastest loop — *stage → review diff → approve → jump to changed lines* — is 4 pointer trips across two panes. He would use the API, not the UI.

**Jordan (First-Timer) — drowning:**
CCR, TOIN, Ripwire, U-Curve, MEM0, PPR, Frozen Prefix, KV-Cache Aligned, BM25 — not one carries a tooltip, glossary, or tiered explanation ("TOIN score: 0.87", dialogs.tsx:162, is a pure unexplained sigil). No onboarding, no help affordance, no "?". His lifelines are accidental: prefilled fixtures and the self-documenting seed note.

**Priya (Reviewer/Auditor) — best-served, still blocked:**
Real verification surface (diffs, blast radius, shas, `.bak` provenance) — but she cannot record *why* she rejected (`reviewerNote` unused), no browsable commit ledger (just "N on-disk commit(s)" counter), event payloads truncated to 120 chars at 9px, relative-only timestamps, quarantined edits capped at 5 shown, no operator identity. **The audit trail is a vibe, not a ledger.**

---

## 11. Minor Observations

- layout.tsx:16-36 — browser tab title/favicon are scaffold leftovers.
- constants.ts:15 — dead `GITHUB` palette object (root cause, see P0-2).
- header.tsx:140-146 — `Save` icon collides with the real save action; `Settings2` for "symbols" is meaningless (G01).
- right-pane.tsx:108-111 — "Listening for capture events…" shown even when SSE disconnected.
- center-pane.tsx:473-483 + constants.ts:11 — textarea wraps lines but `EDITOR_LINE_HEIGHT_PX = 21` assumes it doesn't; jump/minimap/flash coordinates desync on wrapped lines. No `wrap="off"`, no line-number gutter.
- verification-panel.tsx:1468-1485 — tabs have roles but no `aria-controls`/tabpanel ids, no arrow-key nav.
- verification-panel.tsx:1149-1159 — native checkbox `accent-[#f85149]`, inconsistent with styled controls.
- page.tsx:53 — session ID regenerates per page load; cross-session history structurally invisible.
- Quarantine panel (right-pane.tsx:311-346) — red wall with no remediation path ("view offending diff" / override request absent).
- IA sprawl: left(3) + right(5) + verify(5) = 13 primary surfaces + 3 dialogs on one route.
- center-pane.tsx:477 — `setScrollTop` on every scroll event feeds minimap re-renders.
- use-toast.ts:12 — toasts never auto-dismiss.

---

## 12. Phased Remediation Plan

> Ordered so each phase de-risks the next. Phases 0–3 resolve all P0s; 4–5 the P1/P2s; 6 the P3 polish pass. Commands reference the impeccable command set from design-critique.

| Phase | Theme | Commands | Resolves | Key deliverables |
|---|---|---|---|---|
| **0** | Foundations | — | P0-2 substrate | DESIGN.md ratified; token CSS vars in `@theme`; `color-scheme`/`theme-color`/metadata identity |
| **1** | Tokenize | `/colorize` | P0-2 | Hex → semantic vars across 9 files; glows deleted; consolidate blue ×4 → 2; shadcn primitives adopted over class-string constants; unified dialog + TabStrip |
| **2** | Typeset | `/typeset` | P0-1 | Ratio scale applied (11px floor); `tabular-nums`; heading ladder h1→h3; Context Pack viewer readable (13px + folding) |
| **3** | Harden | `/harden` | P0-3, P2-6, P2-7 | ⌘K palette; ⌘S; keyboard approve/reject; focus-visible everywhere; aria-labels; aria-live ×4; reduced-motion (MotionConfig + CSS); 44px targets; tabs a11y |
| **4** | Clarify | `/clarify` | P1-4 | Approval sheet (diff stats + reviewerNote + .bak notice); rollback confirm/undo; error toasts with next-step copy; quarantine remediation path; glossary tooltips (Tier-0-for-concepts) |
| **5** | Layout + Distill | `/layout` `/distill` | P1-5, U03 | Hero editor (focal); chip demotion; green = actions only; Verify→Pipeline form chunked to ≤7; spatial rhythm variance |
| **6** | Adapt + Polish | `/adapt` `/polish` | P2-8, P3-9/10, R01 | Mobile pane-switcher; identity rename + favicon; terminology table; Intl formatters; auto-dismiss toasts; final polish checklist sweep |

**Estimated effort:** Phases 0–1 are the leverage point (~40% of total value for ~20% of effort): tokenization mechanically fixes consistency, theming, and the slop verdict in one motion.

---

## 13. Questions Before Execution (per critique Step 4 — answer to shape the plan)

1. **Priority direction:** I found the token/type collapse (P0-1/2), the missing keyboard layer (P0-3), and the approval-moment UX (P1-4). Which do we tackle first — or run Phases 0–3 straight through?
2. **Design intent:** The chrome is currently rented GitHub-dark. DESIGN.md proposes re-skinning the same dark world with ApexPad's own identity (ledger/vault tokens, IBM Plex pairing, one signature accent). Keep GitHub-adjacent familiarity, or go bolder?
3. **Scope:** All 10 issues across 7 phases, or top-3 P0s first?
4. **Constraints:** Should the three-pane geometry (300/1fr/400) stay fixed, or may Phase 5 re-proportion it?

---

## 14. Re-Audit Verification Checklist

Run after each phase; full re-audit (`/critique`) after Phase 6:
- [ ] Zero raw hex in `src/components/apexpad/**` (grep `#[0-9a-fA-F]{3,6}`)
- [ ] Zero `text-[8px]`/`text-[9px]`; body ≥13px; meta ≥11px
- [ ] `prefers-reduced-motion` global block + MotionConfig present
- [ ] Tab-through app: every focus visible; editor textarea labeled
- [ ] ⌘K opens palette; ⌘S saves; approve/reject keyboard-reachable
- [ ] Approve & Commit requires confirmation + collects reviewerNote
- [ ] EventFeed/boot/search have `aria-live` + honest disconnected state
- [ ] 390px: pane-switcher, no 1,900px scroll, no overlapping floats
- [ ] Browser tab shows "ApexPad" + custom favicon
- [ ] All dynamic numerals `tabular-nums`; dates via `Intl.*`
- [ ] Lighthouse a11y ≥ 95; Nielsen re-score target ≥ 30/40
