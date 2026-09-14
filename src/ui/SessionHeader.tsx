/**
 * The active Session details inside the menu bar: which Session is loaded and
 * which API Call the grid is showing.
 *
 * How full the Context Window is, and the override that sets the window, remain
 * in the rail's Context Window panel. The filename is the rightmost item so the
 * current file stays easy to scan without spending a second row on chrome.
 */
import type { ContextSnapshot, Session } from "../domain/context.ts";
import { formatTimestamp } from "./format.ts";

/**
 * Props for {@link SessionHeader}.
 */
export type SessionHeaderProps = {
  /**
   * The loaded Session.
   */
  readonly session: Session;
  /**
   * The Context Snapshot currently on screen.
   */
  readonly snapshot: ContextSnapshot;
  /**
   * Closes this Session — and only this one. With several Sessions open the
   * File menu still shows the rest; the drop zone only comes back once none
   * are left. Closing every Session at once is "Close all sessions" in the
   * File menu, a separate, explicit action.
   */
  readonly onClose: () => void;
};

/**
 * Session identity, its close action, and the right-aligned filename for the menu bar.
 */
export const SessionHeader = ({ session, snapshot, onClose }: SessionHeaderProps) => (
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
    <span className="shrink-0 text-xs text-ui-text-muted">
      call <span className="text-ui-text">{snapshot.index + 1}</span>/{session.calls.length}
      <span className="hidden lg:inline"> · {formatTimestamp(snapshot.timestamp)}</span>
    </span>
    {/* A Subagent Session owns a separate Context Window; only the folder
        loader can count them, so a single dropped file says nothing. */}
    {session.subagentCount === undefined ? null : (
      <span className="hidden shrink-0 text-xs text-ui-text-faint lg:inline">
        {session.subagentCount} subagent sessions
      </span>
    )}
    {/* A compaction is the one API Call that rewrites the grid instead of
        extending it, so it is named rather than left to the Scrubber's mark. */}
    {snapshot.reset ? <span className="shrink-0 text-xs text-ui-warning">· compaction</span> : null}

    <button
      type="button"
      onClick={onClose}
      title="Close this Session"
      className="shrink-0 rounded px-2 py-0.5 text-xs text-ui-text-muted hover:bg-ui-panel hover:text-ui-text"
    >
      close
    </button>
    <span title={session.fileName} className="ml-auto min-w-0 truncate text-right text-ui-focus">
      {session.fileName}
    </span>
  </section>
);
