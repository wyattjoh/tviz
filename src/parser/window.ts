/**
 * Context Window inference. Transcripts never record the window size, so it is
 * derived from the model id and corrected by what the Session actually reached.
 */

/**
 * Context Window for every model that is not in the 1M family.
 */
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * Context Window for the Claude 5 family and for `[1m]`-suffixed model ids.
 */
export const LARGE_CONTEXT_WINDOW = 1_000_000;

/**
 * Context Window sizes a reviewer can pick from when the inference is wrong.
 */
export const CONTEXT_WINDOW_CHOICES: readonly number[] = [
  DEFAULT_CONTEXT_WINDOW,
  LARGE_CONTEXT_WINDOW,
];

/**
 * Matches the Claude 5 family (`claude-opus-5-…`, `claude-sonnet-5-…`) without
 * matching point releases of earlier families such as `claude-sonnet-4-5-…` or
 * `claude-3-5-sonnet-…`, where the `5` is a minor version rather than a family.
 */
const CLAUDE_5_FAMILY = /^claude-[a-z]+-5(?:[-.]|$)/;

const ONE_MILLION_SUFFIX = "[1m]";

/**
 * True when the model id belongs to a family that accepts a 1M token window.
 */
export const isLargeWindowModel = (model: string): boolean => {
  const id = model.toLowerCase();
  return id.includes(ONE_MILLION_SUFFIX) || CLAUDE_5_FAMILY.test(id);
};

/**
 * Infers the Context Window for a Session.
 *
 * Starts from the model id and bumps to 1M whenever the Session demonstrably
 * exceeded the smaller window.
 */
export const inferContextWindow = (
  model: string | undefined,
  peakMeasuredTotal: number,
): number => {
  if (peakMeasuredTotal > DEFAULT_CONTEXT_WINDOW) return LARGE_CONTEXT_WINDOW;
  if (model !== undefined && isLargeWindowModel(model)) return LARGE_CONTEXT_WINDOW;
  return DEFAULT_CONTEXT_WINDOW;
};
