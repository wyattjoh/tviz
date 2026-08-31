/**
 * App shell: drop one transcript, see the Context Snapshot of its last API Call.
 *
 * Layout follows the "Console" variant of the UI prototype — one centred
 * monospace column, the grid as the page, the legend as an aligned text table.
 */
import { useCallback, useState } from "react";
import type { Session } from "./domain/context.ts";
import { ContextGrid } from "./ui/ContextGrid.tsx";
import { ContextLegend } from "./ui/ContextLegend.tsx";
import { DropZone } from "./ui/DropZone.tsx";
import { formatTokens } from "./ui/format.ts";
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

  return <LoadedSession session={state.session} onClear={clear} />;
};

type LoadedSessionProps = {
  readonly session: Session;
  readonly onClear: () => void;
};

const LoadedSession = ({ session, onClear }: LoadedSessionProps) => {
  const callIndex = session.calls.length - 1;
  const snapshot = session.calls[callIndex];
  if (snapshot === undefined) return null;

  return (
    <div className="min-h-full px-6 py-10 font-mono text-[13px]">
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
          {formatTokens(peakOf(session))} · {session.recordCount} records · {session.malformedLines}{" "}
          malformed · {unknownRecordCount(session)} unknown
        </p>
        <p className="mt-2 text-[11px] text-ui-text-faint">
          parsed in this tab only — nothing was uploaded, nothing was stored.
        </p>
      </div>
    </div>
  );
};

export default App;
