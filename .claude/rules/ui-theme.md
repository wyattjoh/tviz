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
`wyattjoh/ui-prototype`; see its `src/prototype/README.md`), in four regions established
once in `src/App.tsx`: a menu bar carrying the File menu, a Session strip
(`SessionHeader`), a body of `minmax(0,1fr)_340px` — grid pane on the flexible left, fixed
right rail holding the legend-filters, the Context Window panel and the docked Inspector —
and the Scrubber across the bottom. The grid pane is the scroll container, and both of its dimensions drive
`ContextGrid`: `src/ui/cell-fit.ts` sizes the Cells to fill it and hands back the column
count. Fill a region; do not restructure the shell.

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
each would have a 1,000-token Cell list 40,000 tokens of items. Cells are addressed upwards
by **index**, not as objects, so a pinned Cell keeps meaning something when the Scrubber
rebuilds the layout. Grid Cells are buttons on a roving tabindex under a `role="group"`
block — a 1M window is 1,000 Cells and must not be 1,000 tab stops.

The Scrubber is a stacked-area chart of Category totals over every API Call, dragged to
scrub, with transport controls, a 0.5x-4x speed control and a range input for keyboard
stepping; compactions are dashed rules on the chart. Its geometry lives in
`src/ui/scrubber.ts` so the shape of the chart is testable without a DOM. The chart is a
drag surface rather than a control: it hands focus to the range input so the arrow keys
keep stepping after a drag.
