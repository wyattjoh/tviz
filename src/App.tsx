/**
 * App shell: drop transcripts (files or a whole project folder), then step
 * through the selected Session's API Calls.
 *
 * The loaded view is the Workbench layout the throwaway UI prototype settled on
 * (branch `wyattjoh/ui-prototype`, `src/prototype/README.md`): a menu bar and a
 * Session strip across the top, the grid pane on the flexible left, a fixed
 * 340px right rail holding the legend and the Inspector, and the Scrubber
 * docked across the bottom. The four regions are established here once, so the
 * filter and Inspector work fills the rail instead of re-laying out the app.
 *
 * {@link useSessionLoader} owns the Session list — which files parsed, which
 * are still parsing, which failed, and Subagent Session counts — so switching
 * Sessions from the File menu never re-parses anything. The selected API Call
 * and the Context Window override live here because the strip, the grid, the
 * legend and the Scrubber all read them.
 *
 * The Demo Sessions are fetched by `loadDemoSessions` and then handed to the
 * same Session list as a dropped file, so there is no demo-only view: only
 * their manifest name and the manifest's synthetic-data note live here.
 */
import { ChevronDown } from "lucide-react";
import { type ReactNode, useCallback, useId, useMemo, useState } from "react";
import { loadDemoSessions } from "./demo/load-demo-sessions.ts";
import {
  type Category,
  cumulativeItems,
  type MessageKind,
  peakMeasuredTotal,
  type Session,
} from "./domain/context.ts";
import { collectDataTransferEntries, type PathedFile } from "./ui/collect-files.ts";
import { ContextGrid } from "./ui/ContextGrid.tsx";
import { ContextWindowMenu, ContextWindowPanel } from "./ui/ContextWindowPanel.tsx";
import { ContextLegend } from "./ui/ContextLegend.tsx";
import { DropZone } from "./ui/DropZone.tsx";
import {
  ALL_SHOWN,
  type GridFilters,
  toggleCategory,
  toggleMessageKind,
  withColourByKind,
} from "./ui/filters.ts";
import { buildCells } from "./ui/grid.ts";
import { Inspector } from "./ui/Inspector.tsx";
import { MenuBar, type MenuBarProps } from "./ui/MenuBar.tsx";
import { Scrubber } from "./ui/Scrubber.tsx";
import { SessionHeader } from "./ui/SessionHeader.tsx";
import { useSessionLoader } from "./ui/session-loader.ts";
import { effectiveWindowSize, type WindowChoice } from "./ui/window-choice.ts";

const unknownRecordCount = (session: Session): number =>
  Object.values(session.unknownRecordTypes).reduce((sum, count) => sum + count, 0);

/**
 * What the app knows about the Demo Sessions: which open Sessions came from
 * the manifest, what the manifest says about them, and how the last load went.
 */
type DemoState = {
  /**
   * Manifest name per Demo Session id. Membership is what marks a Session as
   * synthetic.
   */
  readonly labels: ReadonlyMap<string, string>;
  /**
   * The manifest's own statement about the Demo Sessions, shown while one is
   * on screen — the file that produces them is what says they are synthetic.
   */
  readonly note: string | undefined;
  /**
   * Which Demo Session is being fetched, or `undefined` when idle.
   */
  readonly progress: string | undefined;
  /**
   * Why the last demo load failed, or `undefined`.
   */
  readonly error: string | undefined;
};

const NO_DEMO: DemoState = {
  labels: new Map(),
  note: undefined,
  progress: undefined,
  error: undefined,
};

const App = () => {
  const loader = useSessionLoader();
  // Not per-Session: switching Sessions from the File menu keeps whatever
  // override is selected, matching the throwaway prototype this was settled
  // against.
  const [windowChoice, setWindowChoice] = useState<WindowChoice>("auto");
  const [demo, setDemo] = useState<DemoState>(NO_DEMO);

  const addParsedSessions = loader.addParsedSessions;
  const loadDemo = useCallback(() => {
    setDemo((current) => ({ ...current, progress: "the demo sessions", error: undefined }));
    loadDemoSessions({
      onProgress: (progress) =>
        setDemo((current) => ({
          ...current,
          progress: `${progress.name} (${progress.index} of ${progress.total})`,
        })),
    }).then((outcome) => {
      if (!outcome.ok) {
        setDemo((current) => ({ ...current, progress: undefined, error: outcome.message }));
        return;
      }
      setDemo({
        labels: new Map(outcome.sessions.map((loaded) => [loaded.session.id, loaded.label])),
        note: outcome.note,
        progress: undefined,
        error: undefined,
      });
      addParsedSessions(
        outcome.sessions.map((loaded) => loaded.session),
        outcome.selectedId,
      );
    });
  }, [addParsedSessions]);

  const closeAll = loader.closeAll;
  const onCloseAll = useCallback(() => {
    setDemo(NO_DEMO);
    closeAll();
  }, [closeAll]);

  const selectedSession = loader.sessions.find((session) => session.id === loader.selectedId);

  const menuBarProps = {
    sessions: loader.sessions,
    selectedId: loader.selectedId,
    pending: loader.pending,
    errors: loader.errors,
    onFiles: loader.addEntries,
    onSelectSession: loader.selectSession,
    onCloseAll,
    onLoadDemo: loadDemo,
    demoBusy: demo.progress !== undefined,
    demoLabels: demo.labels,
  };
  const onCloseSession = loader.closeSession;

  if (selectedSession === undefined) {
    return (
      <div className="grid h-full min-h-full grid-rows-[auto_minmax(0,1fr)] bg-ui-canvas font-mono text-[13px]">
        <MenuBar {...menuBarProps} />
        <DropZone
          onFiles={loader.addEntries}
          pending={loader.pending}
          errors={loader.errors}
          onLoadDemo={loadDemo}
          demoProgress={demo.progress}
          demoError={demo.error}
        />
      </div>
    );
  }

  // Keying on the Session restarts the Scrubber at the last API Call of
  // whatever is selected, rather than carrying the previous Session's
  // position into a Session that may not even have that many API Calls.
  return (
    <LoadedSession
      key={selectedSession.id}
      session={selectedSession}
      windowChoice={windowChoice}
      onWindowChoiceChange={setWindowChoice}
      menuBarProps={menuBarProps}
      onFiles={loader.addEntries}
      onCloseSession={onCloseSession}
      demoNote={demo.labels.has(selectedSession.id) ? demo.note : undefined}
    />
  );
};

type LoadedSessionProps = {
  readonly session: Session;
  readonly windowChoice: WindowChoice;
  readonly onWindowChoiceChange: (choice: WindowChoice) => void;
  readonly menuBarProps: MenuBarProps;
  /**
   * Queues dropped or picked entries the same way the empty state's
   * `DropZone` does — the Workbench itself is a drop target once a Session is
   * loaded, so a second transcript or folder adds to what is open instead of
   * the browser's default file-drop navigating the tab away from it.
   */
  readonly onFiles: (entries: readonly PathedFile[]) => void;
  /**
   * Closes one Session, leaving the rest of the loaded Sessions open.
   */
  readonly onCloseSession: (id: string) => void;
  /**
   * The demo manifest's statement about the Demo Sessions, when the Session on
   * screen is one of them. Its presence is what marks the view as synthetic.
   */
  readonly demoNote: string | undefined;
};

/**
 * One docked panel of the right rail.
 */
type RailPanelProps = {
  /**
   * Heading of the panel, and the control that collapses it.
   */
  readonly title: string;
  /**
   * A control for the panel, drawn at the right of the heading row. For a
   * setting the panel reports but is not itself — the Context Window override
   * beside the fill meter it changes.
   */
  readonly action?: ReactNode;
  /**
   * What the panel holds.
   */
  readonly children: ReactNode;
};

/**
 * A panel in the rail, collapsed to its heading row by clicking that heading.
 *
 * The rail stacks four panels in a fixed 340px column, and on a short window
 * the ones a reader is not using push the ones they are below the fold. Each
 * panel keeps its own open state rather than lifting it here: nothing else
 * reads it, and a collapsed panel is a view preference, not Session state.
 *
 * Collapsing unmounts the body rather than hiding it, so a collapsed panel
 * costs no layout — and the `action` control stays in the heading row either
 * way, because what is in force must stay readable without opening a panel.
 */
const RailPanel = ({ title, action, children }: RailPanelProps) => {
  const bodyId = useId();
  const [open, setOpen] = useState(true);

  return (
    <section className="rounded border border-ui-border bg-ui-panel/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold tracking-wide text-ui-text-muted uppercase">
          <button
            type="button"
            onClick={() => setOpen((wasOpen) => !wasOpen)}
            aria-expanded={open}
            aria-controls={bodyId}
            className="-m-1 flex cursor-pointer items-center gap-1.5 p-1 hover:text-ui-text"
          >
            <ChevronDown
              className={`h-3 w-3 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
              aria-hidden="true"
            />
            {title}
          </button>
        </h2>
        {action}
      </div>
      {open ? (
        <div id={bodyId} className="mt-2">
          {children}
        </div>
      ) : null}
    </section>
  );
};

const LoadedSession = ({
  session,
  windowChoice,
  onWindowChoiceChange,
  menuBarProps,
  onFiles,
  onCloseSession,
  demoNote,
}: LoadedSessionProps) => {
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
  // Purely visual, and never load-bearing: the drop is handled regardless of
  // whether this is showing when it lands.
  const [isDropOver, setIsDropOver] = useState(false);

  const windowSize = effectiveWindowSize(session, windowChoice);

  // The layout is built here rather than inside the grid because the Inspector
  // in the rail reads the same Cells. It ignores the filters by design: hiding
  // is a paint-time decision, so no filter can move a Cell (ADR-0006).
  const cells = useMemo(
    () => buildCells(cumulativeItems(session.calls, callIndex), windowSize),
    [session.calls, callIndex, windowSize],
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
    <div
      // A Session loaded is not the end of the drop path: the empty state's
      // `DropZone` is unmounted once one is, so without a handler here the
      // browser's own file-drop behaviour (navigating the tab to the file)
      // takes over and every open Session, plus the Scrubber and filter
      // state, is lost.
      onDragOver={(event) => {
        event.preventDefault();
        setIsDropOver(true);
      }}
      onDragLeave={() => setIsDropOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setIsDropOver(false);
        collectDataTransferEntries(event.dataTransfer).then(onFiles);
      }}
      className={`grid h-full min-h-full grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-ui-canvas font-mono text-[13px] ${
        isDropOver ? "outline outline-2 -outline-offset-2 outline-dashed outline-ui-focus" : ""
      }`}
    >
      <MenuBar {...menuBarProps} />
      <SessionHeader
        session={session}
        snapshot={snapshot}
        onClose={() => onCloseSession(session.id)}
      />

      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px]">
        <main aria-label="Context grid" className="min-h-0 border-r border-ui-border">
          <ContextGrid
            cells={cells}
            windowSize={windowSize}
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
              windowSize={windowSize}
              filters={filters}
              onToggleCategory={onToggleCategory}
              onToggleMessageKind={onToggleMessageKind}
              onColourByKind={onColourByKind}
            />
          </RailPanel>

          {/* Fill level and the window override sit under the legend: the
              legend's Free space line is the other half of the same number,
              and the Session strip stayed one line on a narrow window once
              they left it. */}
          <RailPanel
            title="Context Window"
            action={
              <ContextWindowMenu
                windowChoice={windowChoice}
                onWindowChoiceChange={onWindowChoiceChange}
              />
            }
          >
            <ContextWindowPanel
              measuredTotal={snapshot.measuredTotal}
              windowSize={windowSize}
              peak={peakMeasuredTotal(session.calls)}
              windowChoice={windowChoice}
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
            {/* The window and its peak moved up to the Context Window panel,
                beside the control that sets them; what is left here is what the
                parse itself found. */}
            <p className="text-[11px] leading-snug text-ui-text-faint">
              {session.recordCount} records · {session.malformedLines} malformed ·{" "}
              {unknownRecordCount(session)} unknown
            </p>
            {/* The manifest's own statement, so what a reviewer reads about the
                Demo Sessions is the file that produced them rather than a copy. */}
            {demoNote === undefined ? null : (
              <p className="mt-2 text-[11px] leading-snug text-ui-text-faint">{demoNote}</p>
            )}
          </RailPanel>
        </aside>
      </div>

      <Scrubber
        calls={session.calls}
        windowSize={windowSize}
        callIndex={callIndex}
        onSelectCall={setCallIndex}
      />
    </div>
  );
};

export default App;
