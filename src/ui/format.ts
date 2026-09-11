/**
 * Number formatting shared by the legend and the header.
 */

/**
 * Formats a token count the way `/context` does: exact below 1k, one decimal
 * above.
 */
export const formatTokens = (tokens: number): string =>
  tokens < 1_000 ? String(Math.round(tokens)) : `${(tokens / 1_000).toFixed(1)}k`;

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
