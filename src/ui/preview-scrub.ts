/**
 * The landing page preview's auto-scrub: which API Call the blurred Workbench
 * behind the drop panel is showing, and when it steps to the next one.
 *
 * The stepping is a pure function of the current index the way `cell-fit.ts`
 * and `scrubber.ts` hold their geometry, so the cycle is testable without
 * rendering anything; only the timer needs a DOM.
 *
 * This is deliberately not `Scrubber`'s own `usePlayback`. That one stops at
 * the last API Call — "playback stops on its own at the last API Call" is the
 * behaviour its transport promises — and carries a play/pause and a speed
 * control. The preview has no transport, loops forever, and stops dead under
 * `prefers-reduced-motion`. Folding both into one hook would make the
 * transport's ending conditional on a caller that has no transport.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

/**
 * Milliseconds a preview API Call is held before the next one.
 *
 * Slower than the Scrubber's 260ms base: the transport is stepping through a
 * Session someone chose to watch, while this is scenery behind a drop panel
 * that must not pull the eye off the panel.
 */
const STEP_MS = 1_100;

/**
 * Milliseconds the finished Session is held before the cycle restarts, so the
 * full grid — the thing the preview exists to show — is the frame that lingers.
 */
const HOLD_MS = 2_200;

/**
 * The API Call after `current`, wrapping back to the first past the end.
 *
 * @param current - Index on screen now.
 * @param total - How many API Calls the Session has.
 * @returns The next index, always within the Session.
 */
export const nextPreviewIndex = (current: number, total: number): number =>
  total < 1 ? 0 : (current + 1) % total;

/**
 * How long to hold `index` before stepping on.
 *
 * @param index - Index on screen now.
 * @param total - How many API Calls the Session has.
 * @returns Milliseconds to wait — longer on the last API Call.
 */
export const previewStepDelay = (index: number, total: number): number =>
  index >= total - 1 ? HOLD_MS : STEP_MS;

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const matchReducedMotion = (): MediaQueryList | undefined =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : undefined;

const subscribeReducedMotion = (onChange: () => void): (() => void) => {
  const query = matchReducedMotion();
  if (query === undefined) return () => {};
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};

// Read through `useSyncExternalStore` rather than mirrored into state by an
// effect: the media query is the source of truth, and copying it would mean a
// first render that animates before the effect corrects it.
const usePrefersReducedMotion = (): boolean =>
  useSyncExternalStore(
    subscribeReducedMotion,
    () => matchReducedMotion()?.matches ?? false,
    () => false,
  );

/**
 * Drives the preview's API Call index, looping through the Session.
 *
 * Under `prefers-reduced-motion` it parks on the last API Call and starts no
 * timer at all: a still of a filled window says more about the tool than a
 * still of an empty one, and the preview is decoration that must not animate
 * against a stated preference.
 *
 * @param total - How many API Calls the preview Session has.
 * @returns The index the preview should render.
 */
export const usePreviewScrub = (total: number): number => {
  const reduced = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const lastIndex = Math.max(0, total - 1);

  useEffect(() => {
    // One API Call has nothing to step between, and a parked preview has no
    // timer to clean up.
    if (reduced || total < 2) return;
    const timer = setTimeout(
      () => setIndex((current) => nextPreviewIndex(current, total)),
      previewStepDelay(index, total),
    );
    return () => clearTimeout(timer);
  }, [reduced, total, index]);

  // Clamped rather than reset, so swapping in a shorter Session mid-cycle
  // cannot ask the grid for an API Call that is not there.
  return reduced ? lastIndex : Math.min(index, lastIndex);
};
