/**
 * Character-based token estimation and the scaling that ties Estimated Tokens
 * back to the Measured Tokens the API reported (ADR-0003).
 */

const CHARS_PER_TOKEN = 4;

/**
 * Fixed Estimated Tokens charged for an `image` content block, which has no
 * text to measure.
 */
export const IMAGE_ESTIMATED_TOKENS = 1600;

/**
 * Rough token estimate for a piece of text.
 *
 * Only ever used as a relative weight: {@link scaleToTotal} rescales the result
 * so a call's estimates sum to its Measured Tokens.
 */
export const estimateTokens = (text: string): number => Math.ceil(text.length / CHARS_PER_TOKEN);

/**
 * Estimated Tokens for an arbitrary JSON value, used for content blocks and
 * attachments whose payload is not a plain string.
 */
export const estimateJsonTokens = (value: unknown): number => {
  if (value === undefined) return 0;
  if (typeof value === "string") return estimateTokens(value);
  try {
    return estimateTokens(JSON.stringify(value) ?? "");
  } catch {
    return 0;
  }
};

/**
 * Distributes `total` across `weights` proportionally, in whole tokens, so that
 * the returned numbers sum to exactly `total`.
 *
 * Uses the largest-remainder method, so no tokens are lost to rounding. Weights
 * that are all zero are treated as equal. A non-positive `total` yields zeros.
 */
export const scaleToTotal = (weights: readonly number[], total: number): number[] => {
  const count = weights.length;
  if (count === 0) return [];
  if (total <= 0) return weights.map(() => 0);

  const rawSum = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  const basis = rawSum > 0 ? weights.map((weight) => Math.max(0, weight)) : weights.map(() => 1);
  const basisSum = rawSum > 0 ? rawSum : count;

  const exact = basis.map((weight) => (weight * total) / basisSum);
  const shares = exact.map((value) => Math.floor(value));
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  let leftover = total - shares.reduce((sum, share) => sum + share, 0);
  for (let step = 0; leftover > 0; step += 1) {
    const target = byRemainder[step % count];
    if (target === undefined) break;
    shares[target.index] = (shares[target.index] ?? 0) + 1;
    leftover -= 1;
  }
  return shares;
};
