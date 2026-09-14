/**
 * Number formatting shared by the legend and the header.
 */

/**
 * Formats a token count the way `/context` does: exact below 1k, one decimal
 * above, rolling up to `M` rather than printing a four-digit `k`.
 *
 * The roll-up is decided on the *rounded* thousands, not on the raw count. A
 * Context Window of 1,000,000 is the common case and reads as `1000.0k`
 * without it — neither of the two windows the grid offers, which is enough to
 * make a correct denominator look like a wrong one. Testing `tokens` against a
 * million directly would only move that seam: 999,990 still rounds to
 * `1000.0k`.
 */
export const formatTokens = (tokens: number): string => {
  if (tokens < 1_000) return String(Math.round(tokens));
  const thousands = tokens / 1_000;
  if (Number(thousands.toFixed(1)) >= 1_000) return `${(tokens / 1_000_000).toFixed(1)}M`;
  return `${thousands.toFixed(1)}k`;
};

/**
 * Formats a share of the Context Window as a percentage.
 */
export const formatPercent = (part: number, whole: number): string =>
  whole <= 0 ? "0.0%" : `${((part / whole) * 100).toFixed(1)}%`;

/**
 * Formats a transcript timestamp for the header, falling back to an em dash.
 */
export const formatTimestamp = (timestamp: string | undefined): string => {
  if (timestamp === undefined) return "—";
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toLocaleString();
};
