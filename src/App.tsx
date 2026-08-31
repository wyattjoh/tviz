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
import { type ReactNode, useCallback, useMemo, useState } from "react";
import {
  type Category,
  cumulativeItems,
  type MessageKind,
  type Session,
} from "./domain/context.ts";
import { ContextGrid } from "./ui/ContextGrid.tsx";
import { ContextLegend } from "./ui/ContextLegend.tsx";
import { DropZone } from "./ui/DropZone.tsx";
import {
  ALL_SHOWN,
  type GridFilters,
  toggleCategory,
  toggleMessageKind,
  withColourByKind,
} from "./ui/filters.ts";
import { formatTokens } from "./ui/format.ts";
import { buildCells } from "./ui/grid.ts";
import { Inspector } from "./ui/Inspector.tsx";
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
  const [filters, setFilters] = useState<GridFilters>(ALL_SHOWN);
  // Cells are addressed by index rather than held as objects: an index stays
  // meaningful when the Scrubber moves and the Cell at that position is rebuilt,
  // so a pinned Cell keeps answering "what is in this part of the window?"
  // across API Calls instead of going stale.
  const [inspectedIndex, setInspectedIndex] = useState<number | undefined>(undefined);
  const [pinnedIndex, setPinnedIndex] = useState<number | undefined>(undefined);

  // The layout is built here rather than inside the grid because the Inspector
  // in the rail reads the same Cells. It ignores the filters by design: hiding
  // is a paint-time decision, so no filter can move a Cell (ADR-0006).
  const cells = useMemo(
    () => buildCells(cumulativeItems(session.calls, callIndex), session.windowSize),
    [session.calls, callIndex, session.windowSize],
  );

  const onToggleCategory = useCallback(
    (category: Category) => setFilters((current) => toggleCategory(current, category)),
    [],
  );
  const onToggleMessageKind = useCallback(
    (kind: MessageKind) => setFilters((current) => toggleMessageKind(current, kind)),
    [],
  );
  const onColourByKind = useCallback(
    (colourByKind: boolean) => setFilters((current) => withColourByKind(current, colourByKind)),
    [],
  );
  // Clicking the pinned Cell again releases it, so the rail can be handed back
  // to whatever the pointer is over.
  const onPin = useCallback(
    (index: number) => setPinnedIndex((current) => (current === index ? undefined : index)),
    [],
  );

  const snapshot = session.calls[callIndex];
  if (snapshot === undefined) return null;

  const shownIndex = inspectedIndex ?? pinnedIndex;

  return (
    <div className="grid h-full min-h-full grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-ui-canvas font-mono text-[13px]">
      <MenuBar />
      <SessionHeader session={session} snapshot={snapshot} onClear={onClear} />

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px]">
        <main aria-label="Context grid" className="min-h-0 border-r border-ui-border">
          <ContextGrid
            cells={cells}
            windowSize={session.windowSize}
            measuredTotal={snapshot.measuredTotal}
            filters={filters}
            pinnedIndex={pinnedIndex}
            onInspect={setInspectedIndex}
            onPin={onPin}
          />
        </main>

        <aside
          aria-label="Legend and Inspector"
          className="min-h-0 space-y-3 overflow-y-auto bg-ui-sunken p-3"
        >
          <RailPanel title="Categories">
            <ContextLegend
              snapshot={snapshot}
              windowSize={session.windowSize}
              filters={filters}
              onToggleCategory={onToggleCategory}
              onToggleMessageKind={onToggleMessageKind}
              onColourByKind={onColourByKind}
            />
          </RailPanel>

          {/* The Inspector docks here rather than following the pointer as a
              tooltip; the panel holds its place until it is filled. */}
          <RailPanel title="Inspector">
            <Inspector
              cell={shownIndex === undefined ? undefined : cells[shownIndex]}
              filters={filters}
              pinned={shownIndex !== undefined && shownIndex === pinnedIndex}
            />
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
