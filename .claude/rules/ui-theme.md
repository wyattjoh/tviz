---
description: Colour and layout conventions for React components — semantic tokens only, never a palette name or hex literal
paths:
  - "src/ui/**"
  - "src/index.css"
alwaysApply: false
---

# UI: semantic tokens and the Console layout

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

## Layout

The main view follows the "Console" variant of the throwaway UI prototype (branch
`wyattjoh/ui-prototype`, see `src/prototype/README.md` there): one centred monospace
column on `ui-shell`, the grid as the page, the legend as an aligned text table.

The grid itself is append-only with fixed-quantum Cells — see ADR-0006 before changing
Cell size, ordering, or how filtering hides Cells. Filtering blanks Cells in place; it
never removes them.
