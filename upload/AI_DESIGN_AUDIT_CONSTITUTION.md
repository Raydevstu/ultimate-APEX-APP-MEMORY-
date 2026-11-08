AI DESIGN AUDIT CONSTITUTION
Gate A01

User Goal Clarity

Pass

Design solves a specific user problem.

Fail

Design exists because "it looks cool".

Gate A02

Single Core Purpose

Every screen must answer:

Plain Text
Why does this screen exist?

If answer exceeds 2 sentences:

Plain Text
FAIL
Gate A03

Information Hierarchy

Must identify:

Plain Text
Primary Action
Secondary Action
Tertiary Action

No equal visual weights.

Gate A04

Visual Intent

Every major element must justify itself.

Plain Text
If removed,
what functionality breaks?

If nothing breaks:

Plain Text
Remove it

Inspired by Anthropic Frontend Design anti-generic principles.

SECTION 2
ANTI-GENERIC DESIGN GATES

Critical for AI-generated UI.

Gate G01

Forbidden:

Plain Text
Random gradient backgrounds
 
Generic SaaS cards
 
ALL CAPS eyebrow labels
 
Meaningless icons
 
Decorative shadows
 
One-accent-color-everywhere pattern
 
Empty dashboard metrics

Directly aligns with Anthropic's anti-generic design guidance.

Gate G02

Design Must Demonstrate

Plain Text
Domain Specificity
 

Examples:

Finance app ≠ Gaming app

Gaming app ≠ Healthcare app

Healthcare app ≠ Social app

Gate G03

No Design Copy Placeholder

Forbidden:

Plain Text
Lorem Ipsum
 
John Doe
 
Coming Soon
 
Sample Data

Use realistic context.

SECTION 3
UX GATES
Gate U01

Every screen contains:

Plain Text
Loading State
Empty State
Error State
Success State

Mandatory.

Gate U02

Action Visibility

Users must know:

Plain Text
What happens next?

within 2 seconds.

Gate U03

Decision Complexity

Maximum

Plain Text
7 ± 2 actions

per section.

Gate U04

Cognitive Load

Avoid:

Plain Text
Dense walls of text

Use:

Plain Text
Chunking
Cards
Progressive disclosure
Gate U05

Form Friction

Must include:

Plain Text
Autofill
 
Paste support
 
Inline validation
 
Clear labels

Matches accessibility guidance.

SECTION 4
ACCESSIBILITY GATES (P0)

Derived from Front-End Checklist accessibility rules.

Gate AX01

Keyboard Navigation

Plain Text
100% functionality
without mouse

Required.

Gate AX02

Visible Focus States

No exceptions.

Gate AX03

Contrast

Plain Text
WCAG AA minimum
Gate AX04

Touch Targets

Plain Text
44px minimum

Referenced by UI Skills guidance.

Gate AX05

Proper Labels

Every input needs:

Plain Text
Visible label
Accessible name
Gate AX06

Heading Hierarchy

Plain Text
H1
H2
H3

No skipping.

Gate AX07

Reduced Motion Support

Animations disabled when:

CSS
prefers-reduced-motion

enabled.

SECTION 5
VISUAL DESIGN GATES
Gate V01

Design Tokens Mandatory

JSON
{
"colors": {},
"spacing": {},
"radius": {},
"typography": {},
"motion": {}
}
Gate V02

Typography Scale

Must define:

Plain Text
Display
H1
H2
H3
Body
Caption
Gate V03

Spacing System

Use:

Plain Text
4
8
12
16
24
32
48
64

system.

Gate V04

Visual Consistency

Buttons:

Plain Text
same radius
same hover behavior
same elevation system
Gate V05

No Color-Only Communication

Accessibility requirement.

SECTION 6
PERFORMANCE GATES

Derived from Front-End Checklist Performance rules.

Gate P01

Target:

Plain Text
LCP < 2.5s
Gate P02

CLS

Plain Text
< 0.1
Gate P03

INP

Plain Text
< 200ms
Gate P04

Above-the-fold

Never lazy-load:

Plain Text
Hero Image
Primary CTA
Critical Navigation
Gate P05

Image Rules

Plain Text
AVIF/WebP
Responsive
Explicit Width/Height
SECTION 7
RESPONSIVE GATES
Gate R01

Required layouts

Plain Text
Mobile
Tablet
Desktop
UltraWide
Gate R02

No horizontal scrolling.

Mandatory.

Matches Front-End Checklist CSS rules.

Gate R03

400% Zoom Test

Must remain usable.

Gate R04

Portrait + Landscape

Supported.

SECTION 8
INTERACTION GATES

Inspired by UI Skills + Vercel guidelines.

Gate I01

Every interaction must provide:

Plain Text
Feedback

Examples:

Plain Text
Hover
Pressed
Success
Error
Loading
Gate I02

Animation Purpose Test

Animation must explain:

Plain Text
What changed?

If not:

Plain Text
Remove animation.
Gate I03

Motion Budget

Plain Text
150-300ms

default interactions.

Gate I04

One Hero Moment Rule

Only one memorable visual motion focus.

Directly aligned with Anthropic guidance.