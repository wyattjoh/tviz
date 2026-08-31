/**
 * App shell: drop one transcript, then step through its API Calls.
 *
 * One centred monospace column holds the header, the grid and the legend; the
 * Scrubber is docked across the bottom of the window, as the UI prototype
 * settled. The selected API Call lives here because the header, the grid, the
 * legend and the Scrubber all read it.
 */
import { useCallback, useState } from "react";
import type { Session } from "./domain/context.ts";
import { ContextGrid } from "./ui/ContextGrid.tsx";
import { ContextLegend } from "./ui/ContextLegend.tsx";
import { DropZone } from "./ui/DropZone.tsx";
import { formatTokens } from "./ui/format.ts";
import { Scrubber } from "./ui/Scrubber.tsx";
import { SessionHeader } from "./ui/SessionHeader.tsx";
import { parseTranscriptFile } from "./worker/parse-client.ts";

type AppState =
  | { readonly status: "idle"; readonly error: string | undefined }
  | { readonly status: "parsing"; readonly fileName: string }
  | { readonly status: "loaded"; readonly session: Session };

const unknownRecordCount = (session: Session): number =>
  Object.values(session.unknownRecordTypes).reduce((sum, count) => sum + count, 0);

const peakOf = (session: Session): number =>
  session.calls.reduce((max, call) => Math.max(max, call.measuredTotal), 0);

const App = () => {
  const [state, setState] = useState<AppState>({ status: "idle", error: undefined });

  const loadFile = useCallback((file: File) => {
    setState({ status: "parsing", fileName: file.name });
    parseTranscriptFile(file).then((outcome) => {
      setState(
        outcome.ok
          ? { status: "loaded", session: outcome.session }
          : { status: "idle", error: outcome.message },
      );
    });
  }, []);

  const clear = useCallback(() => setState({ status: "idle", error: undefined }), []);

  if (state.status !== "loaded") {
    return (
      <DropZone
        onFile={loadFile}
        parsing={state.status === "parsing" ? state.fileName : undefined}
        error={state.status === "idle" ? state.error : undefined}
      />
    );
  }

  // Keying on the Session restarts the Scrubber at the last API Call of
  // whatever was loaded, rather than carrying the previous Session's position
  // into a Session that may not even have that many API Calls.
  return <LoadedSession key={state.session.id} session={state.session} onClear={clear} />;
};

type LoadedSessionProps = {
  readonly session: Session;
  readonly onClear: () => void;
};

const LoadedSession = ({ session, onClear }: LoadedSessionProps) => {
  // The last API Call answers "where did it end up?", which is the question a
  // finished Session is usually opened with.
  const [callIndex, setCallIndex] = useState(session.calls.length - 1);
  const snapshot = session.calls[callIndex];
  if (snapshot === undefined) return null;

  return (
    <div className="grid h-full min-h-full grid-rows-[minmax(0,1fr)_auto] font-mono text-[13px]">
      <div className="overflow-y-auto px-6 py-10">
        <div className="mx-auto w-full max-w-[820px]">
          <SessionHeader session={session} snapshot={snapshot} onClear={onClear} />

          <div className="mt-7">
            <ContextGrid
              calls={session.calls}
              callIndex={callIndex}
              windowSize={session.windowSize}
            />
          </div>

          <div className="mt-8">
            <ContextLegend snapshot={snapshot} windowSize={session.windowSize} />
          </div>

          <p className="mt-8 text-[11px] text-ui-text-faint">
            window {formatTokens(session.windowSize)} (inferred) · peak{" "}
            {formatTokens(peakOf(session))} · {session.recordCount} records ·{" "}
            {session.malformedLines} malformed · {unknownRecordCount(session)} unknown
          </p>
          <p className="mt-2 text-[11px] text-ui-text-faint">
            parsed in this tab only — nothing was uploaded, nothing was stored.
          </p>
        </div>
      </div>

      <Scrubber
        calls={session.calls}
        windowSize={session.windowSize}
        callIndex={callIndex}
        onSelectCall={setCallIndex}
      />
    </div>
  );
};

export default App;
