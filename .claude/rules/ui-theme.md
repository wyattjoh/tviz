---
description: Colour and layout conventions for React components — semantic tokens only, never a palette name or hex literal
paths:
  - "src/ui/**"
  - "src/index.css"
alwaysApply: false
---

# UI: semantic tokens and the Workbench layout

## Colour

Components never name a Catppuccin colour and never write a hex literal. They use the
semantic Tailwind utilities — `bg-ui-canvas`, `text-ui-text-muted`, `bg-cat-skills`,
`bg-kind-tool-result`, `bg-cell-free`, … — declared in `src/index.css` and mapped from
domain values (Category, Message Kind) in `src/ui/theme.ts`.

`src/index.css` is the only place a colour is named: it adapts the Catppuccin Mocha
palette into `ctp-*` and then defines the semantic tokens on top. The `ctp-*` layer exists
for the semantic layer only — a component that reaches for `ctp-mauve` has skipped a step,
and a new colour needs a new semantic token instead.

Adding or checking a colour: use the `catppuccin-interfaces` skill for tokens and contrast.
`src/ui/tokens.test.ts` then pins the result — it reads `src/index.css` and measures what
the tokens resolve to, which is the only check that can see an invisible or duplicated
colour (`theme.test.ts` only ever sees class names). Two rules it holds: every Category and
Message Kind accent is a colour of its own, and a Cell state is perceptible against the
pane behind the grid. A blanked Cell is a recessed fill **plus** an outline, because the
fills dark enough to read as blanked sit near 1.1:1 against the canvas — without the
outline "blanked in place" and "Cell removed" look the same, and the second is the re-flow
ADR-0006 forbids.

A Cell under the pointer or keyboard focus **lifts** — a small translate up and left, a
`scale-125`, a `shadow-md` in `cell-lift` (the deepest neutral, so the shadow reads as
depth on the canvas rather than as a colour), and a raised `z-index` so it paints over its
neighbours. The pinned Cell holds the lift beside its outline. It is pure CSS in
`ContextGrid`'s `CELL_CLASS`, not a pointer-tracking tilt: per-Cell pointer maths over
1,000 Cells buys nothing that CSS does not already give.
`motion-reduce` drops the transition, never the lift — the state still has to be seen.

## Icons

Icons come from `lucide-react` — never a hand-drawn `<svg>`, never a text glyph standing in
for one (`✓`, `|<`, `>|`). Import the named component, size it with Tailwind (`h-3.5 w-3.5`
in the chrome, `h-3 w-3` for a menu row's check), and let it inherit `currentColor` from the
element's semantic text token rather than setting a colour on it.

Every icon is `aria-hidden="true"`, because a control's accessible name lives on the button
(`aria-label="Play"`, `aria-label="Context Window override"`) where a state flip can change
it. That leaves several `<svg>` elements in a region with no accessible name, so a test that
wants a specific one addresses it by a `data-*` hook — `[data-chart="calls"]` for the
Scrubber's chart — never by tag.

## Layout

The main view is the **Workbench** shell the throwaway UI prototype settled on (branch
`wyattjoh/ui-prototype`; see its `src/prototype/README.md`): one top bar carrying the File
menu and active Session details, then four slotted regions — grid pane, right rail,
Inspector, and Scrubber inside the shell. From `md` up the body
is `minmax(0,1fr)_340px`: the grid and settings rail share the first row, then the Inspector
and Scrubber each span both columns below them. The grid pane is the scroll container, and
both of its dimensions drive `ContextGrid`. Fill a region; do not restructure the shell.

**Below `md` the grid pane keeps the whole body and the rail, Inspector, and Scrubber become
three mutually exclusive Info Panes floating over its bottom edge.** A phone-only tab bar
with 44px targets raises one pane at a time; tapping the raised tab lowers it, and all three
start lowered.
They are tabs, not disclosures: a chevron would promise a drawer that pushes the grid down,
which is precisely what the overlays avoid. The grid pads its scroll content by the tab bar
plus the measured open-pane height through `--tviz-obscured-bottom`, so the last Cell can be
scrolled clear without changing the pane size used by `cell-fit.ts`.

The two layouts reuse the *same elements* — `absolute md:static` — rather than rendering a
second shell. The same `<aside>` is the Legend pane on a phone and the right rail on desktop;
the same Inspector and Scrubber are overlays below `md` and full-width rows from `md` up.
`LoadedSession` and `LandingPreview` therefore fill one geometry. `LoadedSession` owns its
API Call index because the grid, legend and Scrubber read it; the top bar does not.

Five constraints:

- **Nothing measures the viewport.** Media queries choose the layout; there is no
  `matchMedia`, viewport resize listener, or measured breakpoint. `ResizeObserver` measures
  only the open pane's own height for scroll clearance. A jsdom component test needs no
  viewport stand-in to mount the shell, and `Workbench.test.tsx` pins that.
- **Lowered means `display: none`**, not a translate or zero height, so a hidden pane's
  controls leave the tab order on their own. From `md` up `md:flex`/`md:block` restores the
  same regions regardless of the phone tab state.
- **`openPane` and the desktop Inspector fold are the only state the shell holds.** Both are
  view state local to `Workbench`; a `RailPanel` likewise keeps its own fold. Nothing about
  a Session is lifted into the shell.
- **`revealInspector` only raises the Inspector on a false-to-true transition.** Pinning a
  Cell puts something worth reading there and a phone has no hover, so the pane opens on
  pin. The reader may lower it while the Cell remains pinned; re-rendering the same true
  value must not reopen it under them.
- **The Inspector is a fixed `h-48` and scrolls through `ScrollArea`'s inner viewport.** Its
  varying item count therefore changes neither the phone overlay nor the desktop row. The
  wrapper positions the edge fades while the inner element owns `overflow-y-auto`; putting
  both jobs on one element clips the fades.

The regions live in `src/ui/Workbench.tsx`: a slotted shell
(`grid`/`rail`/`inspector`/`scrubber`) plus `RailPanel`. The menu bar, active Session details,
and drop handling stay above it in `src/App.tsx`. Both `LoadedSession` and `LandingPreview`
fill the same slots, so the landing state cannot drift from the interface it claims to
preview.

## Touch

`html` carries `touch-action: manipulation` (`src/index.css`) as the viewport baseline.
That drops the double-tap-to-zoom gesture and with it the delay a browser may hold a tap for
while it waits for a second one. **A nested scroll container is a gesture boundary:** a
control inside one computes to `touch-action: auto` unless it carries `touch-manipulation`
itself. Put that utility directly on rapid-tap controls inside `ScrollArea`; the legend rows
do this so fast taps are clicks rather than candidates for double-tap handling. Pinch-zoom
and panning remain available: do **not** reach for `user-scalable=no` on the viewport meta,
which buys the same thing by taking zoom away from people who need it. The Scrubber's chart
opts further out with `touch-none`, because dragging it must not scroll the page.

## The landing page

**There is no landing view — there is one view in two states.** `src/App.tsx` always renders
a menu bar over a positioned stack of two layers, each carrying a `data-layer` hook:

- `data-layer="workbench"` — `LoadedSession` for the selected Session, or `LandingPreview`
  (the same Workbench filled with a Demo Session) when nothing is selected.
- `data-layer="drop-panel"` — the `DropZone`, `absolute inset-0` over it.

Neither layer ever unmounts. That is the whole point: with nothing loaded the Workbench is
`opacity-50 blur-[3px]` under an opaque panel, and selecting a Session transitions the blur
off and the panel's opacity to zero over 500ms (`motion-reduce:transition-none`). A branch
that swapped one view for the other could only blink. Closing the last Session runs it
backwards.

**`inert` and `aria-hidden` move between the layers so that exactly one is reachable.**
Without `inert` on the blurred Workbench, the grid's Cell buttons and the Scrubber's
transport are real tab stops behind a blur and the first Tab off the menu bar lands in a
control nobody can see; without it on the faded panel, an invisible layer covering the
Workbench keeps its tab stops. Tests read which state the app is in off those attributes
rather than off what is mounted.

The menu bar sits *outside* the stack and stays sharp: the File menu is how a visitor with
no transcript reaches the Demo Sessions.

Keep the Workbench layer at exactly the size and position the real one gets — no scaling, no
inset, nothing that would show a layout the loaded view never has. `LandingPreview` uses the
real Workbench components with no-op handlers. Session details stay out of the preview because
the global top bar only describes a Session the visitor opened; the blurred preview is scenery,
not an open Session.

`src/ui/preview-scrub.ts` drives the preview's API Call index: `nextPreviewIndex` and
`previewStepDelay` are pure so the cycle is testable without a render, and `usePreviewScrub`
parks on the last API Call with **no timer** under `prefers-reduced-motion`. It is
deliberately not `Scrubber`'s `usePlayback`, which stops at the end and answers to a
transport.

**Drag and drop is `App`'s, on the root of both branches** — the whole window is the target,
and `DropZone` only draws the `isOver` it is handed. A second drop handler anywhere inside
would bubble to that root and import every dropped file twice.

The top bar's Session region is static file identity only — id, model, CC version, Subagent
Session count, and the filename menu as its rightmost item. Lower-priority identity fields
hide at narrow breakpoints so the filename keeps its space. The filename is a button that
opens individual transcripts, reports pending or failed loads, and switches among open
Sessions. API Call state stays in the Scrubber; "Close session" stays in the File menu beside
"Close all sessions"; and the fill meter and Context Window override stay in
`ContextWindowPanel` under Categories. New per-Session state belongs in a rail panel, not
back in the top bar.

A rail panel is a reading; a setting that changes it rides in the panel's header row
through `RailPanel`'s `action` slot, as `ContextWindowMenu`'s cog does — not as a row of
buttons in the body, which spends rail height on a control pressed once a Session. What is
in force stays readable without opening the menu: the panel's "(inferred)"/"(override)"
note names the window whether or not anyone has touched the cog.

A panel's heading is also its collapse toggle, and collapsing unmounts the body so a panel
the reader is not using costs no rail height. The open state lives in `RailPanel` itself —
nothing else reads it, and which panels are folded is a view preference rather than
Session state. The `action` slot stays in the heading row through a collapse, which is the
same rule as above: a setting in force must not need a panel opened to be seen.

**Pinning a Cell focuses the Inspector without taking the rail away.** The Inspector is its
own region, so Categories, Context Window and Transcript remain mounted and reachable while
a Cell is pinned. The pin adds the close control (`aria-label="Unpin cell"`) beside the
Inspector; Escape or clicking the pinned Cell again does the same. On a phone the pin also
raises the Inspector Info Pane. Hover is never a trigger for pane state: it previews another
Cell in the Inspector while the pinned Cell remains raised, and leaving the grid returns to
the pinned reading. Escape leaves the pin alone while a menu is open, so one keypress closes
one thing.

The menu bar (`src/ui/MenuBar.tsx`) splits navigation by intent. The filename menu carries
Open session…, pending and failed file status, and the list of open Sessions (a Demo Session
shows its manifest name and "(demo)" rather than the file it is served as). The File menu
keeps Open folder…, Load demo sessions, Close session, and Close all sessions. There is no
session sidebar.

The grid itself is append-only with fixed-quantum Cells — see ADR-0006 before changing
Cell size, ordering, or how filtering hides Cells. A Cell is a fixed 1,000 tokens but not a
fixed number of pixels: `fitCells` chooses a column count and CSS divides the pane into equal
`1fr` tracks, so every row spans the width without a rounding remainder. The nominal clamp
is 44–48px. When no integer column count can serve that narrow range, filling the width wins
by the smallest miss; when there are fewer Cells than tracks, the Cells may exceed the
maximum rather than stretching empty columns across the row. The 44px fallback keeps first
paint tappable, and a block too tall for the pane scrolls vertically rather than shrinking
the whole Context Window to fit. That geometry is pure in `src/ui/cell-fit.ts`, while
`ContextGrid` reproduces it with equal tracks and `aspect-square`. Filtering blanks Cells in
place; it never removes them, so legend totals never change when a Category or Message Kind
is hidden.

## Filtering and the Inspector

`buildCells` takes **no filters**: the layout is built in `App` and handed to both
`ContextGrid` and `Inspector`, and `src/ui/filters.ts` only ever reaches a Cell's colour
through `cellFillClass`. That is the seam that makes "blank in place" structural rather
than a promise — no filter can move a Cell, and legend totals come from the Context
Snapshot rather than from the Cells. Keep it that way: a filter argument on `buildCells`
would reintroduce the re-flow.

Hiding a Category hides the Message Kinds inside it: `isMessageKindHidden` asks about
Messages before it asks about the Kind, and the legend disables the Kind rows while their
Category is off. A row's `aria-pressed` and its filled swatch both promise "these Cells are
drawn", so a Kind may not claim to be shown while every one of its Cells is blanked.

A legend row says what it counts in a card that floats under it while it is hovered with a
hover-capable pointer or receives keyboard-visible focus — the one floating layer in the
rail, and not a contradiction of the docked Inspector below: a Cell's contents are read and
compared, while a row's description is a one-line reminder of what the bucket means and
does not earn permanent rail height. A touch tap only toggles the row; never turn the
synthetic hover or pointer focus from that tap into a floating card over the phone controls.
The copy lives in `src/domain/context.ts` (`CATEGORY_DESCRIPTIONS`,
`MESSAGE_KIND_DESCRIPTIONS`, `FREE_SPACE_DESCRIPTION`) so the words the legend uses for a
Category are the words `CONTEXT.md` defines it with. The card's pointer handlers hang off
the row, not its button — a disabled Message Kind row fires no pointer events of its own and
still has something to say — and it is `pointer-events-none` so it never swallows the hover
of the row it covers. Every control in the phone Legend pane is at least 44px tall and uses
`touch-manipulation`: filter rows, panel headings, bulk actions, override triggers, and menu
choices. Filter rows use a 16px swatch and labels that take the available width and wrap
rather than truncate; from `md` up the controls return to the compact desktop rail spacing.

The Inspector is docked in the rail, not a tooltip. It lists each item's **Cell Share** —
the tokens of *that* Cell the item covers, carried on `Cell.items` beside the whole item —
never the item's own size: a 40k tool result crosses 40 Cells, and reporting its size in
each would have a 1,000-token Cell list 40,000 tokens of items. A hovered Cell's list is
capped at `ITEM_LIMIT` because past a dozen rows the hover preview stops being readable; a
pinned Cell has the rail to itself and lists every item, so `pinned` is what lifts the cap.
Either way the panel is a fixed `h-48` and the list scrolls inside it, so which Cell is
being read never changes the rail's size. Cells are addressed
upwards by **index**, not as objects, so a pinned Cell keeps meaning something when the
Scrubber rebuilds the layout. Grid Cells are buttons on a roving tabindex under a
`role="group"` block — a 1M window is 1,000 Cells and must not be 1,000 tab stops.

The Categories panel's `action` slot holds `FilterAllButton`, which controls every Category
and Message Kind filter. If anything is shown, its `ListX` icon and "Deselect all filters"
accessible name describe the next click; only when nothing is shown does it switch to
`ListChecks` and "Select all filters". Keep the action derived from `areAllFiltersHidden`
and the state transition in `toggleAllFilters`, rather than duplicating set logic in the
component. The action stays present while the panel is collapsed, matching `RailPanel`'s
setting-in-force rule.

Messages Cells always use their Message Kind accents: "how much of this is tool output" is
the question a Session is usually opened with, and it cannot be read off a grid where every
Messages Cell is one blue. The Message Kind rows are always present and own their individual
colour swatches. The Messages Category row summarizes the enabled Kinds as equal
`conic-gradient` wedges radiating from the swatch's center; `messageKindSwatchBackground`
in `src/ui/theme.ts` constructs it from semantic Kind tokens so the component never names a
colour. Hidden Kinds leave the aggregate swatch, and no enabled Kinds produces the normal
outlined hidden state. Clicking Messages is a true all/none control: any enabled Kind means
hide all, while none enabled means show all and clear every individual exclusion. There is
no alternate Category-colour mode or setting; `GridFilters` only tracks what is hidden.

The Scrubber is a stacked-area chart of Category totals over every API Call, dragged to
scrub, with transport controls, a 0.5x-4x speed dropdown and a range input for keyboard
stepping; compactions are dashed rules on the chart. Transport stays on the left, the
`call x/y` position sits between the controls without a token reading, and the speed trigger
stays on the right. Below `md`, every transport button, the speed trigger, and its
menu choices have a 44px minimum tap target and `touch-manipulation`; desktop restores
compact sizing. Its
geometry lives in
`src/ui/scrubber.ts` so the shape of the chart is testable without a DOM. The chart is a
drag surface rather than a control: it hands focus to the range input so the arrow keys
keep stepping after a drag.
