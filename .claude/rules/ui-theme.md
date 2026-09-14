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
`ContextGrid`'s `CELL_CLASS`, not a pointer-tracking tilt: Cells go down to 8px, where a
tilt is invisible and per-Cell pointer maths over 1,000 Cells buys nothing.
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
`wyattjoh/ui-prototype`; see its `src/prototype/README.md`): a menu bar carrying the File
menu, a Session strip (`SessionHeader`), a body of `minmax(0,1fr)_340px` — grid pane on the
flexible left, fixed right rail holding the legend-filters, the Context Window panel and the
docked Inspector — and the Scrubber across the bottom. The grid pane is the scroll container,
and both of its dimensions drive `ContextGrid`: `src/ui/cell-fit.ts` sizes the Cells to fill
it and hands back the column count. Fill a region; do not restructure the shell.

**That body is the layout from `md` up. Below `md` it is one column**: the grid pane takes
the full width and the rail stacks under it at `max-h-[45vh]` with its own scroll, so the
Scrubber stays on screen. A 340px rail beside a 390px phone viewport leaves the grid 50px,
which is what the breakpoint exists to prevent. The two are the *same regions in a different
flow* — not a second shell, and not a mobile view: `LoadedSession` and `LandingPreview` still
fill one geometry, and `cell-fit.ts` needs no breakpoint of its own because it measures the
pane it is given.

The narrow **geometry** is CSS alone, and must stay that way — every rule above is a `md:`
class, and no component measures the viewport to lay itself out.

There is exactly **one** viewport read in the UI, and it is not geometry: `RailPanel` seeds
its initial folded state from `isNarrowViewport()` (`src/ui/viewport.ts`). Collapsing a
panel *unmounts* its body, which is React state, so "starts folded on a phone" is the one
thing a class cannot express — and four open panels in a stacked rail push the Scrubber off
a phone screen, which is what the height cap exists to prevent.

That read is deliberately minimal and should stay so:

- It is a plain function, not a hook, and owns **no listener**. Width decides where a
  panel's state *starts*, never where it goes: a panel the reader has opened must not
  re-fold itself when the device is rotated.
- It is read in a lazy `useState` initialiser, so it runs once per panel at mount.
- It guards on `matchMedia` being absent and answers `false`, so a test environment without
  it renders the wide-window behaviour instead of throwing.
- The open state still lives inside `RailPanel`. Nothing was lifted out, and no prop was
  added to thread it down.

Do not grow this into a general responsive hook. A second thing wanting the viewport is a
sign the layout belongs in CSS.

The regions themselves are `src/ui/Workbench.tsx`: a slotted shell (`header`/`grid`/`rail`/
`scrubber`) plus `RailPanel`, with no state and no handlers. The menu bar sits above it, in
`src/App.tsx`, and so does the drop handling — neither belongs to a Session. Two callers fill
the same shell, `LoadedSession` and `LandingPreview`, so the geometry cannot drift between
the interface and the landing state that claims to show it.

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
real components with no-op handlers, including the Session strip's close button, rather than
omitting controls.

`src/ui/preview-scrub.ts` drives the preview's API Call index: `nextPreviewIndex` and
`previewStepDelay` are pure so the cycle is testable without a render, and `usePreviewScrub`
parks on the last API Call with **no timer** under `prefers-reduced-motion`. It is
deliberately not `Scrubber`'s `usePlayback`, which stops at the end and answers to a
transport.

**Drag and drop is `App`'s, on the root of both branches** — the whole window is the target,
and `DropZone` only draws the `isOver` it is handed. A second drop handler anywhere inside
would bubble to that root and import every dropped file twice.

The Session strip is identity plus one action — file name, id, model, CC version, call
index, and `close`. It carries no controls: the fill meter and the Context Window override
are `ContextWindowPanel` in the rail, under Categories, because a strip holding both
wrapped onto two lines on a narrow window and took the height out of the grid. New
per-Session state belongs in a rail panel, not back in the strip.

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

**Pinning a Cell focuses the rail.** While a Cell is pinned the rail holds the Inspector
and nothing else: Categories, Context Window and Transcript unmount, and the Inspector is
rendered with `collapsible={false}` — a plain heading, no chevron — because folding the
only panel would leave an empty rail under a heading row. Its `action` slot is the close
control (`aria-label="Unpin cell"`), and Escape or clicking the pinned Cell again do the
same. Hover is never a trigger: it previews into the docked Inspector on both branches,
and only a click changes what the rail holds — a hover-driven rail flips every time the
pointer crosses the grid edge, and a close control can never be reached under it. The
filters and the window override are one unpin away, which is the deliberate trade for a
rail with one thing in it. Escape leaves the pin alone while a menu is open, so one
keypress closes one thing.

The menu bar (`src/ui/MenuBar.tsx`) carries the whole File menu: Open files…, Open folder…,
Load demo sessions, the list of open Sessions (a Demo Session shows its manifest name and
"(demo)" rather than the file it is served as), and Close all sessions. There is no session
sidebar — a new way into the app is a File-menu entry.

The grid itself is append-only with fixed-quantum Cells — see ADR-0006 before changing
Cell size, ordering, or how filtering hides Cells. A Cell is a fixed 1,000 tokens but not a
fixed number of pixels: it grows to fill the pane, clamped to 8–48px, and bottoms out into
the scrolling grid the fixed Cell always drew. That geometry is a pure function in
`src/ui/cell-fit.ts` so the shape of the block is testable without a DOM, the way
`scrubber.ts` holds the chart's. Filtering blanks Cells in place; it
never removes them, so legend totals never change when a Category or Message Kind is
hidden.

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

A legend row says what it counts in a card that floats under it while it is hovered or
focused — the one floating layer in the rail, and not a contradiction of the docked
Inspector below: a Cell's contents are read and compared, while a row's description is a
one-line reminder of what the bucket means and does not earn permanent rail height. The
copy lives in `src/domain/context.ts` (`CATEGORY_DESCRIPTIONS`,
`MESSAGE_KIND_DESCRIPTIONS`, `FREE_SPACE_DESCRIPTION`) so the words the legend uses for a
Category are the words `CONTEXT.md` defines it with. The card's pointer handlers hang off
the row, not its button — a disabled Message Kind row fires no mouse events of its own and
still has something to say — and it is `pointer-events-none` so it never swallows the hover
of the row it covers.

The Inspector is docked in the rail, not a tooltip. It lists each item's **Cell Share** —
the tokens of *that* Cell the item covers, carried on `Cell.items` beside the whole item —
never the item's own size: a 40k tool result crosses 40 Cells, and reporting its size in
each would have a 1,000-token Cell list 40,000 tokens of items. A hovered Cell's list is
capped at `ITEM_LIMIT` because the panels under it share the rail; a pinned Cell has the
rail to itself and lists every item, so `pinned` is what lifts the cap. Cells are addressed
upwards by **index**, not as objects, so a pinned Cell keeps meaning something when the
Scrubber rebuilds the layout. Grid Cells are buttons on a roving tabindex under a
`role="group"` block — a 1M window is 1,000 Cells and must not be 1,000 tab stops.

`ALL_SHOWN` opens with `colourByKind` **on**: "how much of this is tool output" is the
question a Session is usually opened with, and it cannot be read off a grid where every
Messages Cell is one blue. The legend checkbox turns it off; the Category accent is the
fallback, not the default.

The Scrubber is a stacked-area chart of Category totals over every API Call, dragged to
scrub, with transport controls, a 0.5x-4x speed control and a range input for keyboard
stepping; compactions are dashed rules on the chart. Its geometry lives in
`src/ui/scrubber.ts` so the shape of the chart is testable without a DOM. The chart is a
drag surface rather than a control: it hands focus to the range input so the arrow keys
keep stepping after a drag.
