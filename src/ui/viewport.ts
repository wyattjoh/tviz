/**
 * The one thing the UI reads about the viewport in JavaScript.
 *
 * The Workbench's narrow layout is CSS alone — `md:` classes in
 * `Workbench.tsx` — and stays that way. This exists for the one decision CSS
 * cannot make: a `RailPanel` collapses by *unmounting* its body, which is React
 * state, so "start folded on a phone" cannot be expressed as a class.
 *
 * Deliberately a plain function rather than a hook with a listener. The rail
 * panels seed their initial state from it once, at mount; nothing re-reads it
 * on resize, because a panel the reader has since opened must not fold itself
 * again when the device is rotated.
 */

/**
 * Matches the Tailwind `md` breakpoint the Workbench switches its layout at.
 * Below it the rail sits under the grid rather than beside it.
 */
export const NARROW_VIEWPORT_QUERY = "(max-width: 767px)";

/**
 * True when the viewport is narrow enough that the rail is stacked under the
 * grid pane.
 *
 * Answers `false` wherever `matchMedia` is missing — an old browser, or a test
 * environment that does not implement it — so the rail behaves as it does on a
 * wide window rather than throwing.
 */
export const isNarrowViewport = (): boolean =>
  typeof globalThis.matchMedia === "function" &&
  globalThis.matchMedia(NARROW_VIEWPORT_QUERY).matches;
