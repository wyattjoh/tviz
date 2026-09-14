/**
 * App shell: drop transcripts (files or a whole project folder) anywhere in the
 * window, then step through the selected Session's API Calls.
 *
 * The loaded view fills `Workbench`, the shell the throwaway UI prototype
 * settled on (branch `wyattjoh/ui-prototype`, `src/prototype/README.md`): a
 * menu bar carrying the active Session details, the grid pane on the flexible
 * left, a fixed 340px right sidebar with expandable Legend and Inspector
 * sections, plus the Scrubber below. The regions live in `src/ui/Workbench.tsx`
 * so the filter and Inspector work fills a region instead of re-laying out the
 * app — and so the landing page's preview is the same shell rather than a
 * drawing of it.
 *
 * There is no separate landing view. The app is always this shell: a menu bar
 * over a positioned stack of the Workbench and the drop panel. With nothing
 * loaded the Workbench holds a Demo Session — blurred, `inert`, auto-scrubbing
 * — and the panel is opaque over it, so someone arriving at the deployed
 * prototype with no transcript of their own sees what the tool does before
 * deciding to spend a file on it. Selecting a Session swaps in that Session,
 * fades the panel out and the blur off, and hands the keyboard back. Closing
 * every Session runs it in reverse.
 *
 * Both layers stay mounted across that change, which is the only reason it can
 * be a fade rather than a swap, and `inert` moves between them so that exactly
 * one of the two is reachable at a time.
 *
 * The root is the drop target, so the whole window takes a transcript and the
 * browser never gets the chance to navigate the tab to a dropped file.
 *
 * Pinning a Cell focuses the Inspector without taking the rail away. On a
 * phone it also raises the Inspector Info Pane; at every width the Cell stays
 * pinned until its close control, Escape, or a second click releases it. Hover
 * keeps previewing other Cells and returns to the pinned reading when it leaves.
 *
 * {@link useSessionLoader} owns the Session list — which files parsed, which
 * are still parsing, which failed, and Subagent Session counts — so switching
 * Sessions from the file dropdown never re-parses anything. `LoadedSession` owns
 * the selected API Call because the grid, legend and Scrubber all read it; the
 * Context Window override stays above that Session state so it survives a switch.
 *
 * The Demo Sessions are fetched by `loadDemoSessions` and then handed to the
 * same Session list as a dropped file, so there is no demo-only view: only
 * their manifest name and the manifest's synthetic-data note live here.
 */
import { X } from "lucide-react";
import { type DragEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  loadDemoSessions,
  loadPreviewSession,
  PREVIEW_SESSION_ID,
} from "./demo/load-demo-sessions.ts";
import {
  type Category,
  cumulativeItems,
  type MessageKind,
  peakMeasuredTotal,
  type Session,
} from "./domain/context.ts";
import { collectDataTransferEntries } from "./ui/collect-files.ts";
import { ContextGrid } from "./ui/ContextGrid.tsx";
import { ContextWindowMenu, ContextWindowPanel } from "./ui/ContextWindowPanel.tsx";
import { ContextLegend, FilterAllButton } from "./ui/ContextLegend.tsx";
import { DropZone } from "./ui/DropZone.tsx";
import {
  ALL_SHOWN,
  type GridFilters,
  toggleAllFilters,
  toggleCategory,
  toggleMessageKind,
} from "./ui/filters.ts";
import { buildCells } from "./ui/grid.ts";
import { Inspector } from "./ui/Inspector.tsx";
import { LandingPreview } from "./ui/LandingPreview.tsx";
import { MenuBar } from "./ui/MenuBar.tsx";
import { Scrubber } from "./ui/Scrubber.tsx";
import { useSessionLoader } from "./ui/session-loader.ts";
import { effectiveWindowSize, type WindowChoice } from "./ui/window-choice.ts";
import { RailPanel, Workbench } from "./ui/Workbench.tsx";

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
  // Not per-Session: switching Sessions from the file dropdown keeps whatever
  // override is selected, matching the throwaway prototype this was settled
  // against.
  const [windowChoice, setWindowChoice] = useState<WindowChoice>("auto");
  const [demo, setDemo] = useState<DemoState>(NO_DEMO);
  // The landing page's background. Held here rather than in `useSessionLoader`
  // on purpose: it must not be an open Session. Putting it in the loader would
  // put it in the file dropdown, and — because `addEntries` only selects a parsed
  // Session when nothing is selected yet — would leave a dropped transcript
  // sitting behind a demo the visitor never asked to open.
  const [preview, setPreview] = useState<Session | undefined>(undefined);
  // Purely visual, and never load-bearing on either branch: the drop is
  // handled regardless of whether the highlight is showing when it lands.
  const [isDropOver, setIsDropOver] = useState(false);

  // Kept across a load rather than discarded: closing every Session comes back
  // to this page, and a second fetch of a file already in memory would be the
  // visitor paying twice for the same decoration.
  useEffect(() => {
    let cancelled = false;
    loadPreviewSession(PREVIEW_SESSION_ID).then((session) => {
      if (!cancelled) setPreview(session);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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

  const addEntries = loader.addEntries;
  // The app's one drop implementation, on the root: the whole window is the
  // target rather than the dashed panel, and without a handler here the
  // browser's own file-drop behaviour navigates the tab to the file and takes
  // every open Session with it.
  const dropTargetProps = useMemo(
    () => ({
      onDragOver: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setIsDropOver(true);
      },
      onDragLeave: () => setIsDropOver(false),
      onDrop: (event: DragEvent<HTMLElement>) => {
        event.preventDefault();
        setIsDropOver(false);
        // Must read `dataTransfer` synchronously in this handler; the walk of
        // a dropped folder's entries is what stays async.
        collectDataTransferEntries(event.dataTransfer).then(addEntries);
      },
    }),
    [addEntries],
  );

  const selectedSession = loader.sessions.find((session) => session.id === loader.selectedId);
  const onCloseSession = loader.closeSession;

  const menuBarProps = {
    sessions: loader.sessions,
    selectedId: loader.selectedId,
    pending: loader.pending,
    errors: loader.errors,
    onFiles: loader.addEntries,
    onSelectSession: loader.selectSession,
    onCloseSession,
    onCloseAll,
    onLoadDemo: loadDemo,
    demoBusy: demo.progress !== undefined,
    demoLabels: demo.labels,
  };

  // One view, two states. Nothing loaded shows the Demo Session preview under
  // the drop panel; a Session loaded shows that Session and lets the panel
  // fade off it. Both layers stay mounted in the same positioned stack across
  // the change, which is the only reason the change can be a fade rather than
  // a swap — and closing every Session fades the panel back on.
  const previewing = selectedSession === undefined;
  const shown = selectedSession ?? preview;

  return (
    <div
      {...dropTargetProps}
      // `grid-cols-[minmax(0,1fr)]` rather than an implicit column: an
      // implicit track is `auto`, which floors at its items' min-content and
      // widens the page instead of letting them shrink.
      className={`grid h-full min-h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)] bg-ui-canvas font-mono text-[13px] ${
        isDropOver ? "outline outline-2 -outline-offset-2 outline-dashed outline-ui-focus" : ""
      }`}
    >
      {/* Outside the blur: the file dropdown is how someone with no transcript
          reaches the Demo Sessions, so it stays sharp and reachable on the
          landing page. */}
      <MenuBar {...menuBarProps} />

      <div className="relative min-h-0">
        {/* While nothing is loaded this is scenery, and `inert` is what makes
            that structural rather than a promise: without it the grid's Cell
            buttons and the Scrubber's transport are real tab stops sitting
            behind a blur, and the first Tab off the menu bar lands in a
            control nobody can see. `aria-hidden` keeps the same content out of
            the accessibility tree. Both are dropped the moment a Session is
            selected, and the blur transitions off rather than cutting.

            Laid out at exactly the size the real Workbench gets — no scaling,
            no inset. The point of the landing page is that this *is* the
            interface, so anything that shifted it would be showing a layout
            the loaded view never has. */}
        <div
          data-layer="workbench"
          aria-hidden={previewing || undefined}
          inert={previewing}
          className={`absolute inset-0 grid transition-[filter,opacity] duration-500 motion-reduce:transition-none ${
            previewing ? "pointer-events-none opacity-50 blur-[3px] select-none" : "opacity-100"
          }`}
        >
          {shown === undefined ? null : previewing ? (
            <LandingPreview session={shown} />
          ) : (
            // Keying on the Session restarts the Scrubber at the last API Call
            // of whatever is selected, rather than carrying the previous
            // Session's position into a Session that may not even have that
            // many API Calls.
            <LoadedSession
              key={shown.id}
              session={shown}
              windowChoice={windowChoice}
              onWindowChoiceChange={setWindowChoice}
              demoNote={demo.labels.has(shown.id) ? demo.note : undefined}
            />
          )}
        </div>

        {/* Never unmounted, so it has something to fade between. Faded out it
            is `inert` too: an invisible panel covering the Workbench must not
            hold tab stops or take a click. */}
        <div
          data-layer="drop-panel"
          aria-hidden={previewing ? undefined : true}
          inert={!previewing}
          className={`absolute inset-0 transition-opacity duration-500 motion-reduce:transition-none ${
            previewing ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <DropZone
            onFiles={loader.addEntries}
            isOver={isDropOver}
            previewing={preview !== undefined}
            pending={loader.pending}
            errors={loader.errors}
            onLoadDemo={loadDemo}
            demoProgress={demo.progress}
            demoError={demo.error}
          />
        </div>
      </div>
    </div>
  );
};

type LoadedSessionProps = {
  readonly session: Session;
  readonly windowChoice: WindowChoice;
  readonly onWindowChoiceChange: (choice: WindowChoice) => void;
  /**
   * The demo manifest's statement about the Demo Sessions, when the Session on
   * screen is one of them. Its presence is what marks the view as synthetic.
   */
  readonly demoNote: string | undefined;
};

const LoadedSession = ({
  session,
  windowChoice,
  onWindowChoiceChange,
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
  // Held here only to hand back down: the grid knows there is more to scroll
  // to, the shell knows what is covering the place it would be announced.
  const [gridHasMoreBelow, setGridHasMoreBelow] = useState(false);
  const [pinnedIndex, setPinnedIndex] = useState<number | undefined>(undefined);

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
  const onToggleAllFilters = useCallback(
    () => setFilters((current) => toggleAllFilters(current)),
    [],
  );
  // Clicking the pinned Cell again releases it, so the Inspector can return to
  // whatever the pointer is over.
  const onPin = useCallback(
    (index: number) => setPinnedIndex((current) => (current === index ? undefined : index)),
    [],
  );
  const unpin = useCallback(() => setPinnedIndex(undefined), []);

  // Escape unpins, the way it closes the menus — unless a menu is the thing
  // that is open, in which case one keypress should close the menu and leave
  // the pin alone rather than dismiss both at once.
  const pinned = pinnedIndex !== undefined;
  useEffect(() => {
    if (!pinned) return;
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('[aria-haspopup="menu"][aria-expanded="true"]') !== null) return;
      unpin();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pinned, unpin]);

  const snapshot = session.calls[callIndex];
  if (snapshot === undefined) return null;

  const shownIndex = inspectedIndex ?? pinnedIndex;

  return (
    <Workbench
      grid={
        <ContextGrid
          cells={cells}
          windowSize={windowSize}
          measuredTotal={snapshot.measuredTotal}
          filters={filters}
          pinnedIndex={pinnedIndex}
          onInspect={setInspectedIndex}
          onPin={onPin}
          onMoreBelowChange={setGridHasMoreBelow}
        />
      }
      gridHasMoreBelow={gridHasMoreBelow}
      inspector={
        /* The same region is a phone Info Pane and the expandable bottom of the
           desktop sidebar. The rail scrolls independently above it, so filters
           stay reachable while reading a pinned Cell. Escape and clicking the
           Cell again still unpin. */
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Inspector
              cell={shownIndex === undefined ? undefined : cells[shownIndex]}
              filters={filters}
              pinned={shownIndex === pinnedIndex}
            />
          </div>
          {pinned ? (
            <button
              type="button"
              onClick={unpin}
              aria-label="Unpin cell"
              title="Unpin cell · Esc"
              className="shrink-0 rounded p-1 text-ui-text-faint hover:bg-ui-panel hover:text-ui-text"
            >
              <X aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>
      }
      rail={
        <>
          <RailPanel
            title="Categories"
            action={<FilterAllButton filters={filters} onToggle={onToggleAllFilters} />}
          >
            <ContextLegend
              snapshot={snapshot}
              windowSize={windowSize}
              filters={filters}
              onToggleCategory={onToggleCategory}
              onToggleMessageKind={onToggleMessageKind}
            />
          </RailPanel>

          {/* Fill level and the window override sit under the legend: the
              legend's Free space line is the other half of the same number,
              and the Session details stayed compact in the top bar once
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

          <RailPanel title="Transcript">
            {/* The window and its peak moved up to the Context Window panel,
                beside the control that sets them; what is left here is what the
                parse itself found. */}
            <p className="text-[11px] leading-snug text-ui-text-faint">
              {session.recordCount} records · {session.malformedLines} malformed ·{" "}
              {unknownRecordCount(session)} unknown
            </p>
            {/* The manifest's own statement, so what someone reads about the
                Demo Sessions is the file that produced them rather than a copy. */}
            {demoNote === undefined ? null : (
              <p className="mt-2 text-[11px] leading-snug text-ui-text-faint">{demoNote}</p>
            )}
          </RailPanel>
        </>
      }
      revealInspector={pinned}
      scrubber={
        <Scrubber
          calls={session.calls}
          windowSize={windowSize}
          callIndex={callIndex}
          onSelectCall={setCallIndex}
        />
      }
    />
  );
};

export default App;
