/**
 * Geometry for the Scrubber: the stacked-area chart of Category totals across
 * every API Call of a Session, and the arithmetic that turns a pointer position
 * into an API Call index.
 *
 * Kept separate from the component so the shape of the chart is testable
 * without a DOM. Everything here is pure and works in view-box units; the SVG
 * is stretched to whatever width the footer has (`preserveAspectRatio="none"`),
 * so the component only ever needs the ratio of a pointer across the element.
 */
import { CATEGORY_ORDER, type Category, type ContextSnapshot } from "../domain/context.ts";

/**
 * View-box width of the chart. Arbitrary, because the SVG is stretched to the
 * footer's width; it only sets the resolution of the polygon points.
 */
export const CHART_WIDTH = 1_000;

/**
 * View-box height of the chart. A full Context Window reaches the top.
 */
export const CHART_HEIGHT = 130;

/**
 * Half the width of the playhead rule, so it is never clipped by the edge of
 * the view box on the first or last API Call.
 */
const PLAYHEAD_INSET = 1;

/**
 * One Category's band in the stacked area, as an SVG polygon.
 */
export type ScrubberBand = {
  /**
   * The Category this band measures.
   */
  readonly category: Category;
  /**
   * `points` for an SVG `<polygon>`, in view-box units.
   */
  readonly points: string;
};

/**
 * Where an API Call sits across the chart, in view-box units.
 *
 * A Session with a single API Call has no span to spread across, so it is
 * pinned to the left edge and {@link bandsFor} widens its band to fill the
 * chart instead.
 */
export const callX = (index: number, callCount: number): number => {
  if (callCount <= 1) return 0;
  const clamped = Math.max(0, Math.min(callCount - 1, index));
  return (clamped / (callCount - 1)) * CHART_WIDTH;
};

/**
 * Where to draw the playhead for an API Call, nudged inside the view box so the
 * rule stays fully visible at either end.
 */
export const playheadX = (index: number, callCount: number): number =>
  Math.max(PLAYHEAD_INSET, Math.min(CHART_WIDTH - PLAYHEAD_INSET, callX(index, callCount)));

/**
 * The API Call a pointer at `ratio` across the chart selects.
 *
 * `ratio` is clamped, so dragging past either edge parks on the first or last
 * API Call rather than running off the end.
 */
export const callIndexAtRatio = (ratio: number, callCount: number): number => {
  if (callCount <= 1) return 0;
  const clamped = Math.max(0, Math.min(1, ratio));
  return Math.round(clamped * (callCount - 1));
};

/**
 * Height of a token total in view-box units, measured from the top.
 *
 * A Context Snapshot larger than the Context Window is clamped to the top of
 * the chart rather than drawn outside it.
 */
const chartY = (tokens: number, windowSize: number): number => {
  if (!Number.isFinite(windowSize) || windowSize <= 0) return CHART_HEIGHT;
  const filled = Math.max(0, Math.min(1, tokens / windowSize));
  return CHART_HEIGHT - filled * CHART_HEIGHT;
};

/**
 * Builds one stacked band per Category across every API Call of a Session.
 *
 * Bands are stacked in {@link CATEGORY_ORDER}, so System is the floor of the
 * chart and Messages the roof — the same order the legend lists and, because
 * System is the one Category that survives a compaction, the order that makes
 * a compaction read as the stack above System collapsing.
 *
 * Every band is returned, including a Category with no tokens: an empty band is
 * a flat line on the floor of its slice of the stack and costs one polygon,
 * while skipping it would make the band list depend on the Session.
 *
 * @param calls - Context Snapshots of one Session, in transcript order
 * @param windowSize - Context Window the chart's full height stands for
 * @returns One polygon per Category, floor first
 */
export const bandsFor = (
  calls: readonly ContextSnapshot[],
  windowSize: number,
): readonly ScrubberBand[] => {
  if (calls.length === 0) return [];
  // A lone API Call would otherwise be a zero-width polygon: draw it as a band
  // spanning the whole chart so a one-call Session still shows its composition.
  const xs =
    calls.length === 1 ? [0, CHART_WIDTH] : calls.map((call) => callX(call.index, calls.length));
  const stacked = calls.length === 1 ? [calls[0], calls[0]] : calls;

  return CATEGORY_ORDER.map((category, order) => {
    const upper: string[] = [];
    const lower: string[] = [];
    for (const [position, call] of stacked.entries()) {
      if (call === undefined) continue;
      let below = 0;
      for (const beneath of CATEGORY_ORDER.slice(0, order)) below += call.byCategory[beneath];
      const x = xs[position] ?? 0;
      upper.push(`${x},${chartY(below + call.byCategory[category], windowSize)}`);
      lower.push(`${x},${chartY(below, windowSize)}`);
    }
    return { category, points: [...upper, ...lower.reverse()].join(" ") };
  });
};

/**
 * The API Calls that compacted, in transcript order.
 *
 * A compaction is the one event that rewrites the grid rather than extending
 * it, so the Scrubber marks it: the stack visibly drops there, and the mark
 * says the drop is a compaction rather than a smaller request.
 */
export const compactionIndices = (calls: readonly ContextSnapshot[]): readonly number[] =>
  calls.filter((call) => call.reset).map((call) => call.index);
