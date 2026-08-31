/**
 * The Context Window override: `/context`'s denominator is inferred
 * (`inferContextWindow`), and a reviewer can pin it instead when the
 * inference is wrong for their Session.
 */
import { CONTEXT_WINDOW_CHOICES } from "../parser/window.ts";
import type { Session } from "../domain/context.ts";

/**
 * `"auto"` defers to the Session's inferred `windowSize`; a number pins the
 * grid's denominator regardless of what the parser inferred.
 */
export type WindowChoice = "auto" | (typeof CONTEXT_WINDOW_CHOICES)[number];

/**
 * Every choice the selector offers, `"auto"` first.
 */
export const WINDOW_CHOICES: readonly WindowChoice[] = ["auto", ...CONTEXT_WINDOW_CHOICES];

/**
 * Resolves a {@link WindowChoice} against a Session to the Context Window the
 * grid, legend and Scrubber should use as their denominator.
 */
export const effectiveWindowSize = (session: Session, choice: WindowChoice): number =>
  choice === "auto" ? session.windowSize : choice;
