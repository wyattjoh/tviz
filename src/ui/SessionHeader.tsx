/**
 * The active Session's file identity inside the menu bar.
 *
 * API Call state stays in the Scrubber, and Context Window details stay in the
 * rail. The filename is the rightmost item so the current file remains easy to
 * scan without spending a second row on chrome.
 */
import type { ReactNode } from "react";
import type { Session } from "../domain/context.ts";

/**
 * Props for {@link SessionHeader}.
 */
export type SessionHeaderProps = {
  /**
   * The loaded Session.
   */
  readonly session: Session;
  /**
   * The filename button and its Session menu.
   */
  readonly sessionMenu: ReactNode;
};

/**
 * Session identity with the filename right-aligned in the menu bar.
 */
export const SessionHeader = ({ session, sessionMenu }: SessionHeaderProps) => (
  <section aria-label="Session" className="flex min-w-0 flex-1 items-center gap-3">
    <span className="hidden max-w-56 min-w-0 truncate text-xs text-ui-text-faint xl:inline">
      {session.id}
    </span>
    <span className="hidden max-w-40 truncate rounded bg-ui-panel px-2 py-0.5 text-xs text-ui-text-secondary sm:inline">
      {session.model ?? "unknown model"}
    </span>
    <span className="hidden shrink-0 text-xs text-ui-text-muted md:inline">
      cc {session.claudeCodeVersion ?? "unknown"}
    </span>
    {/* A Subagent Session owns a separate Context Window; only the folder
        loader can count them, so a single dropped file says nothing. */}
    {session.subagentCount === undefined ? null : (
      <span className="hidden shrink-0 text-xs text-ui-text-faint lg:inline">
        {session.subagentCount} subagent sessions
      </span>
    )}
    {sessionMenu}
  </section>
);
