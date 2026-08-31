/**
 * The list of loaded Sessions, shown whenever more than one is open.
 *
 * A row carries what user story 4 asks for — id, model, Claude Code version,
 * number of API Calls and peak context — plus the manifest blurb when the
 * Session is a Demo Session.
 */
import type { LoadedSession } from "../domain/context.ts";
import { formatTokens } from "./format.ts";

/**
 * Props for {@link SessionList}.
 */
export type SessionListProps = {
  /**
   * Every loaded Session, in load order.
   */
  readonly sessions: readonly LoadedSession[];
  /**
   * Id of the Session whose Context Snapshot is on screen.
   */
  readonly selectedId: string;
  /**
   * Selects a Session by its id.
   */
  readonly onSelect: (id: string) => void;
};

const peakOf = (loaded: LoadedSession): number =>
  loaded.session.calls.reduce((max, call) => Math.max(max, call.measuredTotal), 0);

/**
 * Lists the loaded Sessions and lets one be selected.
 */
export const SessionList = ({ sessions, selectedId, onSelect }: SessionListProps) => (
  <nav aria-label="Sessions">
    <ul className="space-y-1">
      {sessions.map((loaded) => {
        const isSelected = loaded.session.id === selectedId;
        return (
          <li key={loaded.session.id}>
            <button
              type="button"
              onClick={() => onSelect(loaded.session.id)}
              aria-current={isSelected ? "true" : undefined}
              className={`w-full rounded border px-3 py-2 text-left transition-colors ${
                isSelected
                  ? "border-ui-focus bg-ui-panel/50"
                  : "border-ui-border bg-ui-canvas hover:bg-ui-panel/30"
              }`}
            >
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className={isSelected ? "text-ui-text" : "text-ui-text-secondary"}>
                  {loaded.label}
                </span>
                {loaded.description === undefined ? null : (
                  <span className="rounded-sm border border-ui-border px-1 text-[10px] text-ui-text-faint">
                    synthetic demo
                  </span>
                )}
                <span className="ml-auto text-[11px] text-ui-text-faint tabular-nums">
                  {loaded.session.calls.length} calls · peak {formatTokens(peakOf(loaded))} /{" "}
                  {formatTokens(loaded.session.windowSize)}
                </span>
              </span>
              <span className="mt-1 block text-[11px] text-ui-text-faint">
                {loaded.session.model ?? "unknown model"} · cc{" "}
                {loaded.session.claudeCodeVersion ?? "unknown"} · {loaded.session.id}
              </span>
              {loaded.description === undefined ? null : (
                <span className="mt-1 block text-[11px] text-ui-text-muted">
                  {loaded.description}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  </nav>
);
