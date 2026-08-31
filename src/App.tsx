/**
 * App shell: drop one transcript, then step through its API Calls.
 *
 * The loaded view is the Workbench layout the throwaway UI prototype settled on
 * (branch `wyattjoh/ui-prototype`, `src/prototype/README.md`): a menu bar and a
 * Session strip across the top, the grid pane on the flexible left, a fixed
 * 340px right rail holding the legend and the Inspector, and the Scrubber
 * docked across the bottom. The four regions are established here once, so the
 * filter and Inspector work fills the rail instead of re-laying out the app.
 *
 * The selected API Call lives here because the strip, the grid, the legend and
 * the Scrubber all read it.
 */
import { type ReactNode, useCallback, useState } from "react";
import type { Session } from "./domain/context.ts";
import { ContextGrid } from "./ui/ContextGrid.tsx";
import { ContextLegend } from "./ui/ContextLegend.tsx";
import { DropZone } from "./ui/DropZone.tsx";
import { formatTokens } from "./ui/format.ts";
import { MenuBar } from "./ui/MenuBar.tsx";
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
      <div className="grid h-full min-h-full grid-rows-[auto_minmax(0,1fr)] bg-ui-canvas font-mono text-[13px]">
        <MenuBar />
        <DropZone
          onFile={loadFile}
          parsing={state.status === "parsing" ? state.fileName : undefined}
          error={state.status === "idle" ? state.error : undefined}
        />
      </div>
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

/**
 * One docked panel of the right rail.
 */
type RailPanelProps = {
  /**
   * Heading of the panel.
   */
  readonly title: string;
  /**
   * What the panel holds.
   */
  readonly children: ReactNode;
};

const RailPanel = ({ title, children }: RailPanelProps) => (
  <section className="rounded border border-ui-border bg-ui-panel/40 p-3">
    <h2 className="text-[11px] font-semibold tracking-wide text-ui-text-muted uppercase">
      {title}
    </h2>
    <div className="mt-2">{children}</div>
  </section>
);

const LoadedSession = ({ session, onClear }: LoadedSessionProps) => {
  // The last API Call answers "where did it end up?", which is the question a
  // finished Session is usually opened with.
  const [callIndex, setCallIndex] = useState(session.calls.length - 1);
  const snapshot = session.calls[callIndex];
  if (snapshot === undefined) return null;

  return (
    <div className="grid h-full min-h-full grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-ui-canvas font-mono text-[13px]">
      <MenuBar />
      <SessionHeader session={session} snapshot={snapshot} onClear={onClear} />

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px]">
        <main aria-label="Context grid" className="min-h-0 border-r border-ui-border">
          <ContextGrid
            calls={session.calls}
            callIndex={callIndex}
            windowSize={session.windowSize}
          />
        </main>

        <aside
          aria-label="Legend and Inspector"
          className="min-h-0 space-y-3 overflow-y-auto bg-ui-sunken p-3"
        >
          <RailPanel title="Categories">
            <ContextLegend snapshot={snapshot} windowSize={session.windowSize} />
          </RailPanel>

          {/* The Inspector docks here rather than following the pointer as a
              tooltip; the panel holds its place until it is filled. */}
          <RailPanel title="Inspector">
            <p className="text-[11px] leading-snug text-ui-text-faint">
              The items filling a Cell will be listed here.
            </p>
          </RailPanel>

          <RailPanel title="Transcript">
            <p className="text-[11px] leading-snug text-ui-text-faint">
              window {formatTokens(session.windowSize)} (inferred) · peak{" "}
              {formatTokens(peakOf(session))}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-ui-text-faint">
              {session.recordCount} records · {session.malformedLines} malformed ·{" "}
              {unknownRecordCount(session)} unknown
            </p>
          </RailPanel>
        </aside>
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
