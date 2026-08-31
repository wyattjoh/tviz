/**
 * The bridge between the domain vocabulary and the semantic colour tokens
 * declared in `src/index.css`.
 *
 * Components import class names from here; they never name a Catppuccin colour
 * or a hex literal themselves.
 */
import type { Category, MessageKind } from "../domain/context.ts";
import { type GridFilters, isCellHidden } from "./filters.ts";
import type { Cell } from "./grid.ts";

/**
 * Background utility for each Category, used by grid Cells and legend swatches.
 */
export const CATEGORY_FILL_CLASS: Readonly<Record<Category, string>> = {
  system: "bg-cat-system",
  customAgents: "bg-cat-agents",
  memoryFiles: "bg-cat-memory",
  skills: "bg-cat-skills",
  mcp: "bg-cat-mcp",
  messages: "bg-cat-messages",
};

/**
 * Ring utility for each Category, used by a legend swatch whose Category is
 * toggled off: the outline keeps the row readable while the missing fill says
 * the Cells are blanked.
 */
export const CATEGORY_RING_CLASS: Readonly<Record<Category, string>> = {
  system: "ring-cat-system",
  customAgents: "ring-cat-agents",
  memoryFiles: "ring-cat-memory",
  skills: "ring-cat-skills",
  mcp: "ring-cat-mcp",
  messages: "ring-cat-messages",
};

/**
 * Background utility for each Message Kind, used when Messages Cells are
 * coloured by Kind and by the Kind rows of the legend.
 */
export const MESSAGE_KIND_FILL_CLASS: Readonly<Record<MessageKind, string>> = {
  user: "bg-kind-user",
  assistant: "bg-kind-assistant",
  toolResult: "bg-kind-tool-result",
  reminder: "bg-kind-reminder",
};

/**
 * Ring utility for each Message Kind, the Kind counterpart of
 * {@link CATEGORY_RING_CLASS}.
 */
export const MESSAGE_KIND_RING_CLASS: Readonly<Record<MessageKind, string>> = {
  user: "ring-kind-user",
  assistant: "ring-kind-assistant",
  toolResult: "ring-kind-tool-result",
  reminder: "ring-kind-reminder",
};

/**
 * Background utility for a Cell no Category fills.
 */
export const FREE_FILL_CLASS = "bg-cell-free";

/**
 * Background utility for a Cell blanked by a filter.
 *
 * Deliberately distinct from {@link FREE_FILL_CLASS}: a hidden Cell holds
 * tokens and a free one does not, so the grid never claims headroom a Session
 * did not have.
 */
export const HIDDEN_FILL_CLASS = "bg-cell-hidden";

/**
 * SVG `fill` utility for each Category, used by the Scrubber's stacked bands.
 *
 * A separate map from {@link CATEGORY_FILL_CLASS} because SVG paints with
 * `fill`, not `background`; both resolve the same semantic token.
 */
export const CATEGORY_SVG_FILL_CLASS: Readonly<Record<Category, string>> = {
  system: "fill-cat-system",
  customAgents: "fill-cat-agents",
  memoryFiles: "fill-cat-memory",
  skills: "fill-cat-skills",
  mcp: "fill-cat-mcp",
  messages: "fill-cat-messages",
};

/**
 * The background utility one Cell is painted with, honouring the filters.
 *
 * The order matters: a blanked Cell is blank whatever it holds, and "colour by
 * kind" only ever repaints Messages Cells.
 */
export const cellFillClass = (cell: Cell, filters: GridFilters): string => {
  if (cell.fill === "free") return FREE_FILL_CLASS;
  if (isCellHidden(cell, filters)) return HIDDEN_FILL_CLASS;
  if (filters.colourByKind && cell.fill === "messages" && cell.kind !== undefined) {
    return MESSAGE_KIND_FILL_CLASS[cell.kind];
  }
  return CATEGORY_FILL_CLASS[cell.fill];
};
