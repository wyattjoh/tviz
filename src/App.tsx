/**
 * App shell: drop one transcript — or load the bundled Demo Sessions — and see
 * the Context Snapshot of the selected Session's last API Call.
 *
 * Layout follows the "Console" variant of the UI prototype — one centred
 * monospace column, the grid as the page, the legend as an aligned text table —
 * under the menu bar the Workbench variant settled on, which is where the File
 * menu lives.
 */
import { useCallback, useState } from "react";
import { loadDemoSessions } from "./demo/load-demo-sessions.ts";
import type { LoadedSession, Session } from "./domain/context.ts";
import { ContextGrid } from "./ui/ContextGrid.tsx";
import { ContextLegend } from "./ui/ContextLegend.tsx";
import { DropZone } from "./ui/DropZone.tsx";
import { formatTokens } from "./ui/format.ts";
import { MenuBar } from "./ui/MenuBar.tsx";
import { SessionHeader } from "./ui/SessionHeader.tsx";
import { SessionList } from "./ui/SessionList.tsx";
import { parseTranscriptFile } from "./worker/parse-client.ts";

type LoadedState = {
  readonly status: "loaded";
  readonly sessions: readonly LoadedSession[];
  readonly selectedId: string;
  /**
   * The demo manifest's statement about the Demo Sessions, when these Sessions
   * came from the demo.
   */
  readonly note: string | undefined;
  /**
   * Message from a load that failed while these Sessions were open.
   */
  readonly error: string | undefined;
};

type AppState =
  | { readonly status: "idle"; readonly error: string | undefined }
  | {
      readonly status: "parsing";
      readonly label: string;
      readonly previous: LoadedState | undefined;
    }
  | LoadedState;

const openSessions = (state: AppState): LoadedState | undefined => {
  if (state.status === "loaded") return state;
  return state.status === "parsing" ? state.previous : undefined;
};

/**
 * Where a failed load leaves the app.
 *
 * A transcript is parsed in the tab and never leaves it, so Sessions that are
 * already open cannot be fetched again: a load that fails goes back to them
 * with the message attached, and only an empty app falls back to the drop zone.
 */
const afterFailure = (state: AppState, message: string): AppState => {
  const previous = openSessions(state);
  return previous === undefined
    ? { status: "idle", error: message }
    : { ...previous, error: message };
};

const unknownRecordCount = (session: Session): number =>
  Object.values(session.unknownRecordTypes).reduce((sum, count) => sum + count, 0);

const peakOf = (session: Session): number =>
  session.calls.reduce((max, call) => Math.max(max, call.measuredTotal), 0);

const App = () => {
  const [state, setState] = useState<AppState>({ status: "idle", error: undefined });

  const loadFile = useCallback((file: File) => {
    setState((current) => ({
      status: "parsing",
      label: file.name,
      previous: openSessions(current),
    }));
    parseTranscriptFile(file).then((outcome) => {
      setState((current) =>
        outcome.ok
          ? {
              status: "loaded",
              sessions: [{ session: outcome.session, label: file.name, description: undefined }],
              selectedId: outcome.session.id,
              note: undefined,
              error: undefined,
            }
          : afterFailure(current, outcome.message),
      );
    });
  }, []);

  const loadDemo = useCallback(() => {
    setState((current) => ({
      status: "parsing",
      label: "the demo sessions",
      previous: openSessions(current),
    }));
    loadDemoSessions({
      onProgress: (progress) =>
        setState((current) => ({
          status: "parsing",
          label: `${progress.name} (${progress.index} of ${progress.total})`,
          previous: openSessions(current),
        })),
    }).then((outcome) => {
      setState((current) =>
        outcome.ok
          ? {
              status: "loaded",
              sessions: outcome.sessions,
              selectedId: outcome.selectedId,
              note: outcome.note,
              error: undefined,
            }
          : afterFailure(current, outcome.message),
      );
    });
  }, []);

  const select = useCallback((id: string) => {
    setState((current) =>
      current.status === "loaded" ? { ...current, selectedId: id, error: undefined } : current,
    );
  }, []);

  const clear = useCallback(() => setState({ status: "idle", error: undefined }), []);

  const open = openSessions(state);
  const menuBar = (
    <MenuBar
      onLoadDemo={loadDemo}
      onClear={open === undefined ? undefined : clear}
      busy={state.status === "parsing"}
    />
  );

  // A load started from an open Session keeps that Session on screen: it exists
  // only in this tab, so replacing it with the drop zone before the new one has
  // parsed would throw it away on the way.
  if (open === undefined) {
    return (
      <div className="flex min-h-full flex-col">
        {menuBar}
        <DropZone
          onFile={loadFile}
          onLoadDemo={loadDemo}
          parsing={state.status === "parsing" ? state.label : undefined}
          error={state.status === "idle" ? state.error : undefined}
        />
      </div>
    );
  }

  const selected =
    open.sessions.find((loaded) => loaded.session.id === open.selectedId) ?? open.sessions[0];
  if (selected === undefined) return null;

  return (
    <div className="flex min-h-full flex-col">
      {menuBar}
      <LoadedSessionView
        loaded={selected}
        sessions={open.sessions}
        note={open.note}
        error={open.error}
        parsing={state.status === "parsing" ? state.label : undefined}
        onSelect={select}
      />
    </div>
  );
};

type LoadedSessionViewProps = {
  readonly loaded: LoadedSession;
  readonly sessions: readonly LoadedSession[];
  readonly note: string | undefined;
  readonly error: string | undefined;
  readonly parsing: string | undefined;
  readonly onSelect: (id: string) => void;
};

const LoadedSessionView = ({
  loaded,
  sessions,
  note,
  error,
  parsing,
  onSelect,
}: LoadedSessionViewProps) => {
  const session = loaded.session;
  const snapshot = session.calls.at(-1);
  if (snapshot === undefined) return null;

  return (
    <div className="flex-1 px-6 py-10 font-mono text-[13px]">
      <div className="mx-auto w-full max-w-[820px]">
        <SessionHeader session={session} snapshot={snapshot} />

        {parsing === undefined ? null : (
          <p className="mt-4 text-[11px] text-ui-text-muted">parsing {parsing}…</p>
        )}

        {error === undefined ? null : (
          <p role="alert" className="mt-4 text-xs text-ui-danger">
            {error}
          </p>
        )}

        {sessions.length < 2 ? null : (
          <div className="mt-6">
            <SessionList sessions={sessions} selectedId={session.id} onSelect={onSelect} />
          </div>
        )}

        <div className="mt-7">
          <ContextGrid snapshot={snapshot} windowSize={session.windowSize} />
        </div>

        <div className="mt-8">
          <ContextLegend snapshot={snapshot} windowSize={session.windowSize} />
        </div>

        <p className="mt-8 text-[11px] text-ui-text-faint">
          window {formatTokens(session.windowSize)} (inferred) · peak{" "}
          {formatTokens(peakOf(session))} · {session.recordCount} records · {session.malformedLines}{" "}
          malformed · {unknownRecordCount(session)} unknown
        </p>
        <p className="mt-2 text-[11px] text-ui-text-faint">
          parsed in this tab only — nothing was uploaded, nothing was stored.
        </p>
        {/* The manifest's own statement, so what a reviewer reads about the
            Demo Sessions is the file that produced them rather than a copy. */}
        {loaded.description === undefined || note === undefined ? null : (
          <p className="mt-2 text-[11px] text-ui-text-faint">{note}</p>
        )}
      </div>
    </div>
  );
};

export default App;
