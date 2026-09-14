/**
 * Context Window inference. Transcripts never record the window size, so it is
 * derived from what the Session demonstrably reached and from the one marker
 * Claude Code writes when a larger window was asked for (ADR-0009).
 *
 * What this deliberately does **not** read is the model id's native ceiling. A
 * model id says what the model is capable of, not what the Session ran with:
 * Claude Code's 1M window is opt-in, so the great majority of Sessions on a
 * 1M-capable model still ran against 200k, and several unrecorded things hold
 * one there — missing usage credits, `CLAUDE_CODE_DISABLE_1M_CONTEXT`, a
 * configured auto-compact window, or a Claude Code predating the model's 1M
 * support. Inferring from the ceiling drew every short Session on a recent
 * model as a nearly empty 1M grid.
 */

/**
 * Context Window assumed when nothing shows the Session had more.
 */
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * Context Window for a Session shown to have exceeded the default.
 */
export const LARGE_CONTEXT_WINDOW = 1_000_000;

/**
 * Context Window sizes someone can pick from when the inference is wrong.
 */
export const CONTEXT_WINDOW_CHOICES: readonly number[] = [
  DEFAULT_CONTEXT_WINDOW,
  LARGE_CONTEXT_WINDOW,
];

/**
 * The suffix Claude Code appends to a model id to select a larger window than
 * the default — `claude-sonnet-4-5[1m]`.
 *
 * It rarely survives into the transcript: Claude Code canonicalises the id
 * before recording it, and the suffix appears in none of 600 sampled Sessions.
 * Where it *does* appear it is the most direct evidence there is — a statement
 * that this Session asked for the larger window — so it is read rather than
 * stripped.
 *
 * `[2m]` is matched too and also yields {@link LARGE_CONTEXT_WINDOW}: the grid
 * offers two denominators, so a Session declaring more than 1M is drawn against
 * 1M and left to the UI override.
 */
const WINDOW_SUFFIX = /\[([12])m\]$/;

/**
 * True when the model id itself declares that this Session asked for a window
 * larger than the default.
 *
 * This is a statement about the *Session*, not about the model: it is the
 * recorded trace of an opt-in, which is why it is the only thing the model id
 * contributes to {@link inferContextWindow}.
 */
export const declaresLargeWindow = (model: string): boolean =>
  WINDOW_SUFFIX.test(model.toLowerCase());

/**
 * Infers the Context Window for a Session from its own evidence.
 *
 * Two things can raise it above the default, and both are properties of the
 * Session rather than of the model:
 *
 * - a Measured Total past {@link DEFAULT_CONTEXT_WINDOW}, which *proves* the
 *   larger window — no Session can hold more context than its window; and
 * - the `[1m]` marker on the model id, which records the opt-in directly.
 *
 * Absent either, the answer is the smaller claim. A peak under 200k proves
 * nothing in either direction, so a Session that genuinely ran at 1M and stayed
 * small is drawn against 200k — under-stating headroom rather than inventing
 * it, and one click of the Context Window override away. That is the same
 * preference for the honest reading that makes System a remainder (ADR-0001)
 * and scales estimates to what was measured (ADR-0003).
 *
 * @param model - Model id of the Session's first API Call, when it recorded one
 * @param peakMeasuredTotal - The largest Measured Tokens any API Call reached
 * @returns The Context Window to use as the grid's denominator
 */
export const inferContextWindow = (
  model: string | undefined,
  peakMeasuredTotal: number,
): number => {
  if (peakMeasuredTotal > DEFAULT_CONTEXT_WINDOW) return LARGE_CONTEXT_WINDOW;
  if (model !== undefined && declaresLargeWindow(model)) return LARGE_CONTEXT_WINDOW;
  return DEFAULT_CONTEXT_WINDOW;
};
