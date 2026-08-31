/**
 * The bridge between the domain vocabulary and the semantic colour tokens
 * declared in `src/index.css`.
 *
 * Components import class names from here; they never name a Catppuccin colour
 * or a hex literal themselves.
 */
import type { Category } from "../domain/context.ts";

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
 * Background utility for a Cell no Category fills.
 */
export const FREE_FILL_CLASS = "bg-cell-free";

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
