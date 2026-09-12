/**
 * Context Window inference. Transcripts never record the window size, so it is
 * derived from the model id and corrected by what the Session actually reached.
 */

/**
 * Context Window for a model whose native window is the smaller one.
 */
export const DEFAULT_CONTEXT_WINDOW = 200_000;

/**
 * Context Window for a model whose native window is 1M.
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
 * the model's native one — `claude-sonnet-4-5[1m]`.
 *
 * It does not normally survive into the transcript: Claude Code canonicalises
 * the id before recording it, and the suffix appears in none of 600 sampled
 * Sessions. Where it *does* appear it is the most direct evidence there is, so
 * it is read before the table rather than only stripped for lookup.
 */
const WINDOW_SUFFIX = /\[([12])m\]$/;

/**
 * Trailing release stamps Claude Code appends to a model id: `-20251101`,
 * `@20251101`, and a Bedrock `-v1` / `-v1:0` revision.
 */
const RELEASE_STAMP = /(?:[-@]\d{8})?(?:-v\d+(?::\d+)?)?$/;

/**
 * The routing prefix a hosted provider puts in front of the id, as in
 * `us.anthropic.claude-opus-5` or `anthropic.claude-opus-5`.
 */
const PROVIDER_PREFIX = /^(?:[a-z0-9-]+\.)*(?=claude-)/;

/**
 * Model ids whose **native** Context Window is 1M, with no beta header needed.
 *
 * Per Anthropic's context-windows documentation, this is a property of the
 * model, not of the request. It is emphatically not a property of the family
 * *number*: `claude-opus-4-5` is a 200k model while `claude-opus-4-6` is a 1M
 * one, so this is an explicit list rather than a version comparison. Claude Code
 * shipped the same mistake and fixed it in 2.1.117, where Opus 4.7 sessions were
 * being measured against 200k and autocompacting early.
 *
 * A model this list has never heard of falls to 200k, which is the smaller claim
 * — and the peak in {@link inferContextWindow} corrects it upwards if the
 * Session proves otherwise.
 */
const LARGE_WINDOW_MODELS: ReadonlySet<string> = new Set([
  "claude-fable-5",
  "claude-fable-5-1",
  "claude-mythos-5",
  "claude-mythos-5-1",
  "claude-opus-4-6",
  "claude-opus-4-7",
  "claude-opus-4-8",
  "claude-opus-5",
  "claude-sonnet-4-6",
  "claude-sonnet-5",
]);

/**
 * Strips the parts of a model id that name a deployment or a release rather
 * than a model, leaving an id the table can be looked up by exactly.
 *
 * Exactly, and not by prefix: `claude-opus-4` is a prefix of `claude-opus-4-8`
 * and `claude-sonnet-4-5` of `claude-sonnet-4-5-20250929`, so a longest-prefix
 * rule would quietly misfile ids as new models ship.
 */
const canonicalModelId = (model: string): string =>
  model
    .toLowerCase()
    .replace(PROVIDER_PREFIX, "")
    .replace(WINDOW_SUFFIX, "")
    .replace(RELEASE_STAMP, "");

/**
 * True when the Session's Context Window is 1M: either the id asked for it, or
 * the model's native window already is.
 */
export const isLargeWindowModel = (model: string): boolean => {
  const id = model.toLowerCase();
  if (WINDOW_SUFFIX.test(id)) return true;
  return LARGE_WINDOW_MODELS.has(canonicalModelId(id));
};

/**
 * Infers the Context Window for a Session.
 *
 * Starts from the model's native window and bumps to 1M whenever the Session
 * demonstrably exceeded the smaller one — which is the correction for the
 * Sessions a 1M model ran *smaller* than its ceiling, since several things the
 * transcript does not record can hold one down: missing usage credits,
 * `CLAUDE_CODE_DISABLE_1M_CONTEXT`, a configured auto-compact window, or simply
 * a Claude Code old enough to predate the model's 1M support. Those leave the
 * grid reading fuller than it was, which is what the UI override is for.
 */
export const inferContextWindow = (
  model: string | undefined,
  peakMeasuredTotal: number,
): number => {
  if (peakMeasuredTotal > DEFAULT_CONTEXT_WINDOW) return LARGE_CONTEXT_WINDOW;
  if (model !== undefined && isLargeWindowModel(model)) return LARGE_CONTEXT_WINDOW;
  return DEFAULT_CONTEXT_WINDOW;
};
