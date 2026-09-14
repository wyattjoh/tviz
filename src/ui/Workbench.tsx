/**
 * The Workbench shell: the regions the throwaway UI prototype settled on
 * (branch `wyattjoh/ui-prototype`, `src/prototype/README.md`), as slots.
 *
 * The menu bar and active Session details sit above this, in `App`; what lives
 * here is one positioning context holding four regions — the grid pane, the
 * rail, the Inspector and the Scrubber. Both the loaded Session and the landing
 * page's blurred preview fill the same one.
 *
 * **From `md` up** the body is a two-column grid: grid pane on the flexible
 * left, 340px rail on the right, with the Inspector and the Scrubber as
 * full-width rows spanning beneath both.
 *
 * **Below `md` the grid pane is the whole body and never changes size.** The
 * same three regions become overlays floating on top of it, raised by a **tab
 * bar** pinned over the bottom edge. That is the point of the overlay:
 * `cell-fit.ts` sizes every Cell from the pane's height, so a region that took
 * height *out* of the pane re-sized the entire grid every time it opened.
 * Floating them means opening anything shifts nothing, and the grid stays one
 * scrollable region that only ever scrolls vertically.
 *
 * Tabs, not three disclosures: exactly one region is raised at a time and
 * tapping the raised one lowers it. Two open at once would stack over the same
 * corner of the grid, and the tab bar says which is showing by *fill* rather
 * than by a chevron — a chevron promises a drawer that pushes content down,
 * which is the one thing these must not do.
 *
 * Each region is the *same element* at both widths — `absolute md:static` — so
 * the two layouts cannot drift apart, and nothing measures the viewport in JS.
 *
 * **The top border belongs to the Info Pane, not to what fills it.** All three
 * slots draw `border-t` themselves, so the line between the grid and whatever
 * is raised over it is one rule rather than three — and the grid pane draws no
 * bottom border of its own, since when nothing is raised the tab bar's own top
 * border is that edge. The rail drops its border from `md` up, where it is a
 * column beside the grid rather than a pane under it.
 *
 * Two pieces of state, both about the shell rather than a Session: which pane
 * the tab bar has raised, and whether the Inspector's desktop drawer is folded.
 * `revealInspector` raises the Inspector when a caller has put something in it
 * worth reading — pinning a Cell fills it, and a phone has no hover, so pin is
 * the only gesture that does.
 */
import { ChevronDown } from "lucide-react";
import { ScrollArea } from "./ScrollArea.tsx";
import { type CSSProperties, type ReactNode, useCallback, useId, useState } from "react";

/**
 * Props for {@link Workbench}.
 */
export type WorkbenchProps = {
  /**
   * The grid pane, which is also the body's scroll container.
   */
  readonly grid: ReactNode;
  /**
   * The right rail: the legend, the Context Window panel, the Transcript panel.
   */
  readonly rail: ReactNode;
  /**
   * The Inspector, its own region rather than a panel inside the rail.
   */
  readonly inspector: ReactNode;
  /**
   * The Scrubber.
   */
  readonly scrubber: ReactNode;
  /**
   * Opens the Inspector when it turns true, for a caller that has just put
   * something in it worth reading.
   *
   * Only ever opens. Closing it while the reason still holds is a decision the
   * reader is allowed to make, and re-opening it under them would be the shell
   * arguing back.
   */
  readonly revealInspector?: boolean;
  /**
   * Whether the grid has content below its fold, from `ContextGrid`.
   *
   * The shell draws the scroll-fade because only the shell knows what the
   * grid's bottom edge is hidden *behind* — an open Info Pane, or the tab bar
   * when none is open.
   */
  readonly gridHasMoreBelow?: boolean;
};

/**
 * One of the three regions the tab bar raises over the grid: the **Info
 * Panes**. Named as a set because they behave as one — mutually exclusive,
 * floating, and each anchored to the same bottom edge.
 */
type InfoPane = "legend" | "inspector" | "scrubber";

/**
 * The scroll-fade that says the grid continues under whatever is covering it.
 *
 * Anchored with `bottom-full` to the element that does the covering, so it
 * always sits immediately above that edge whatever height it happens to have —
 * an open Info Pane's height is its content's, and nothing has to measure it.
 */
const ScrollFade = ({ shown, className = "" }: { shown: boolean; className?: string }) => (
  <div
    aria-hidden="true"
    className={`pointer-events-none absolute inset-x-0 bottom-full h-16 bg-linear-to-t from-ui-canvas to-transparent transition-opacity duration-200 motion-reduce:transition-none ${
      shown ? "opacity-100" : "opacity-0"
    } ${className}`}
  />
);

/**
 * The custom property the grid pane pads its bottom by.
 *
 * Set by the shell on the positioning container and inherited by the grid, so
 * the two never have to pass a number between them — `ContextGrid` is a slot
 * the shell fills, and a prop would have to travel up to `App` and back down.
 * Reset to zero from `md` up, where nothing floats over the grid.
 */
const OBSCURED_BOTTOM = "--tviz-obscured-bottom";

/**
 * Height of the phone tab bar, in pixels.
 *
 * A number rather than a class because the grid pads its scroll by it: every
 * Info Pane is raised off this, and the grid has to be able to scroll clear of
 * the whole stack.
 */
const TOOLBAR_HEIGHT_PX = 44;

/**
 * Measures an element's border-box height.
 *
 * The toolbar's height is a number the shell already knows, but an open Info
 * Pane's is whatever its content comes to — and the grid has to be able to
 * scroll past exactly that much, so it is measured rather than guessed at.
 */
const useMeasuredHeight = (): readonly [(node: HTMLElement | null) => void, number] => {
  const [height, setHeight] = useState(0);
  const [observer] = useState(() =>
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry === undefined) return;
          const measured = entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height;
          setHeight((was) => (Math.abs(was - measured) < 0.5 ? was : measured));
        }),
  );

  const ref = useCallback(
    (node: HTMLElement | null) => {
      if (observer === undefined) return;
      observer.disconnect();
      if (node !== null) observer.observe(node);
    },
    [observer],
  );

  return [ref, height] as const;
};

/**
 * A tab in the phone toolbar. Equal thirds, so the three targets are the same
 * size and none is the awkward one to hit.
 *
 * State is carried by the fill rather than by a chevron: these are tabs, and a
 * chevron promises a drawer that pushes the content below it, which is exactly
 * what these do not do. The raised tab lifts to the panel's own surface so it
 * reads as continuous with the pane above it; the others stay on the shell.
 */
const tabClass = (raised: boolean): string =>
  "flex min-h-11 flex-1 touch-manipulation items-center justify-center text-[11px] font-semibold tracking-wide uppercase " +
  (raised
    ? "bg-ui-sunken text-ui-text"
    : "text-ui-text-muted hover:bg-ui-panel hover:text-ui-text");

/**
 * Lays the grid pane, rail, Inspector and Scrubber into the shell.
 *
 * Fill a region; do not restructure the shell — see `.claude/rules/ui-theme.md`
 * and ADR-0006.
 */
export const Workbench = ({
  grid,
  rail,
  inspector,
  scrubber,
  revealInspector,
  gridHasMoreBelow,
}: WorkbenchProps) => {
  // The toolbar's height is a number the grid needs too — it is part of how
  // much of the grid's bottom edge is covered — so it is named rather than
  // left as a class.
  const toolbarHeight = TOOLBAR_HEIGHT_PX;

  // Below `md` the three regions are *tabs*, not three independent
  // disclosures: one is raised at a time and tapping the raised one lowers it.
  // Stacking them would put two overlays over the same corner of the grid.
  // `undefined` is "all lowered", which is how a phone starts.
  const [openPane, setOpenPane] = useState<InfoPane | undefined>(undefined);
  // Desktop only, and independent: from `md` up all three regions are laid out
  // rather than raised, so the Inspector's own header is what collapses it.
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const railId = useId();
  const inspectorId = useId();
  const scrubberId = useId();

  const togglePane = (pane: InfoPane) =>
    setOpenPane((current) => (current === pane ? undefined : pane));

  const [railRef, railHeight] = useMeasuredHeight();
  const [inspectorRef, inspectorHeight] = useMeasuredHeight();
  const [scrubberRef, scrubberHeight] = useMeasuredHeight();
  const openPaneHeight =
    openPane === "legend"
      ? railHeight
      : openPane === "inspector"
        ? inspectorHeight
        : openPane === "scrubber"
          ? scrubberHeight
          : 0;
  // How much of the grid's bottom edge is covered right now: the tab bar
  // always, plus whichever Info Pane is raised. The grid pads its scroll by
  // this, so its last row can be brought clear of both.
  const obscuredBottom = toolbarHeight + openPaneHeight;

  const TABS = [
    { pane: "legend", label: "Legend", panelId: railId },
    { pane: "inspector", label: "Inspector", panelId: inspectorId },
    { pane: "scrubber", label: "Scrubber", panelId: scrubberId },
  ] as const satisfies readonly { pane: InfoPane; label: string; panelId: string }[];

  // Adjusted during render against the previous prop rather than in an effect,
  // so the Inspector is already showing on the first paint after a pin — no
  // flash, no cascading render. Keyed on the transition, so the reader can put
  // it away again while the Cell is still pinned.
  const [lastReveal, setLastReveal] = useState<boolean | undefined>(undefined);
  if (revealInspector !== lastReveal) {
    setLastReveal(revealInspector);
    if (revealInspector === true) {
      setOpenPane("inspector");
      setInspectorCollapsed(false);
    }
  }

  return (
    // The one positioning context. Below `md` it is a single full-height
    // region and every panel floats inside it; from `md` up it is the
    // two-column body with the Inspector and Scrubber spanning beneath.
    // `grid-cols-[minmax(0,1fr)]` rather than an implicit column: an implicit
    // track is `auto`, which floors at its items' min-content and would let one
    // unbreakable string widen the page.
    <div
      style={{ [OBSCURED_BOTTOM]: `${obscuredBottom}px` } as CSSProperties}
      // The `md:` reset is written out rather than built from
      // `OBSCURED_BOTTOM`: Tailwind scans source text for class names, so a
      // template literal produces a class it never generates.
      className="relative grid min-h-0 grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-[minmax(0,1fr)_auto_auto] md:[--tviz-obscured-bottom:0px]"
    >
      <main
        aria-label="Context grid"
        className="relative min-h-0 min-w-0 md:border-r md:border-ui-border"
      >
        {grid}
        {/* From `md` up nothing floats over the grid, so the fade belongs at
              the pane's own bottom edge. `top-full` on a zero-height anchor at
              the bottom is how it reaches the same place `bottom-full` does on
              the Info Panes below. */}
        <div className="absolute inset-x-0 bottom-0 hidden md:block">
          <ScrollFade shown={gridHasMoreBelow === true} />
        </div>
      </main>

      {/* The scroll lives on the inner element, not on the `<aside>`. The
            fade sits *above* the pane's top edge, so an `overflow` on the same
            element that carries it clips it away — which is why this one pane
            went without a fade while the other two, which have no overflow, had
            theirs. */}
      <aside
        id={railId}
        aria-label="Legend and Context Window"
        ref={railRef}
        style={{
          display: openPane === "legend" ? "flex" : undefined,
          flexDirection: "column",
        }}
        className={`${openPane === "legend" ? "" : "hidden"} absolute inset-x-0 z-30 min-h-0 min-w-0 bottom-11 max-h-[35vh] border-t border-ui-border bg-ui-sunken md:static md:bottom-auto md:z-auto md:col-start-2 md:row-start-1 md:flex md:max-h-none md:border-t-0`}
      >
        <ScrollFade shown={gridHasMoreBelow === true} className="md:hidden" />
        <ScrollArea
          className="flex min-h-0 flex-1 flex-col"
          innerClassName="flex flex-col gap-2 p-2 md:gap-3 md:p-3"
        >
          {rail}
        </ScrollArea>
      </aside>

      {/* Its own region rather than a panel inside the rail: a full-width
            band under the grid from `md` up, an overlay on a phone. */}
      <section
        id={inspectorId}
        aria-label="Inspector"
        ref={inspectorRef}
        className={`${openPane === "inspector" ? "" : "hidden"} absolute inset-x-0 bottom-11 z-30 border-t border-ui-border bg-ui-sunken md:static md:z-auto md:col-span-2 md:row-start-2 md:block`}
      >
        {/* The desktop header is this section's own collapse control, and it
              keeps a chevron: from `md` up this really is a drawer, and folding
              it does give its height back to the grid. On a phone the tab bar
              carries the state instead, so the header is `md:flex`. */}
        <button
          type="button"
          onClick={() => setInspectorCollapsed((wasCollapsed) => !wasCollapsed)}
          aria-expanded={!inspectorCollapsed}
          aria-controls={inspectorId}
          className="hidden w-full items-center gap-1.5 px-3 py-2 text-[11px] font-semibold tracking-wide text-ui-text-muted uppercase hover:text-ui-text md:flex"
        >
          <ChevronDown
            className={`h-3 w-3 shrink-0 transition-transform ${
              inspectorCollapsed ? "-rotate-90" : ""
            }`}
            aria-hidden="true"
          />
          Inspector
        </button>
        {/* Collapsed is desktop-only: on a phone the section is raised or it
              is not, so the body always shows when the tab is active. */}
        <ScrollFade shown={gridHasMoreBelow === true} className="md:hidden" />
        <div className={`p-3 md:pt-0 ${inspectorCollapsed ? "md:hidden" : ""}`}>{inspector}</div>
      </section>

      <div
        id={scrubberId}
        ref={scrubberRef}
        className={`${openPane === "scrubber" ? "" : "hidden"} absolute inset-x-0 bottom-11 z-30 border-t border-ui-border bg-ui-sunken md:static md:z-auto md:col-span-2 md:row-start-3 md:block`}
      >
        <ScrollFade shown={gridHasMoreBelow === true} className="md:hidden" />
        {scrubber}
      </div>

      {/* Pinned over the bottom edge rather than laid out in flow: in flow it
            would take permanent height out of the grid pane, and the pane's
            height is what sizes every Cell. It covers the last row or two,
            which the pane scrolls past. */}
      <div
        role="tablist"
        aria-label="Info panes"
        className="absolute inset-x-0 bottom-0 z-40 flex h-11 items-stretch border-t border-ui-border bg-ui-shell md:hidden"
      >
        {/* Only when nothing is raised: an open Info Pane is nearer the grid
              and carries the fade itself. */}
        <ScrollFade shown={gridHasMoreBelow === true && openPane === undefined} />
        {TABS.map(({ pane, label, panelId }, order) => {
          const raised = openPane === pane;
          return (
            <button
              key={pane}
              type="button"
              role="tab"
              onClick={() => togglePane(pane)}
              // `aria-selected` is the tab's state; `aria-expanded` says the
              // selected one can also be put away, which a plain tablist
              // cannot express on its own.
              aria-selected={raised}
              aria-expanded={raised}
              aria-controls={panelId}
              className={`${tabClass(raised)} ${order === 0 ? "" : "border-l border-ui-border"}`}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/**
 * Props for {@link RailPanel}.
 */
export type RailPanelProps = {
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
   * Whether the heading folds the panel. Defaults to on; a caller can disable
   * it when a panel's contents must always remain visible.
   */
  readonly collapsible?: boolean;
  /**
   * What the panel holds.
   */
  readonly children: ReactNode;
};

/**
 * A panel in the rail, collapsed to its heading row by clicking that heading.
 *
 * The rail stacks panels in a 340px column from `md` up and in the capped
 * Legend Info Pane below it. On a short window the ones a reader is not using
 * push the others below the fold. Each panel keeps its own open state rather
 * than lifting it out: nothing else reads it, and a collapsed panel is a view
 * preference, not Session state.
 *
 * Collapsing unmounts the body rather than hiding it, so a collapsed panel
 * costs no layout — and the `action` control stays in the heading row either
 * way, because what is in force must stay readable without opening a panel.
 */
export const RailPanel = ({ title, action, collapsible = true, children }: RailPanelProps) => {
  const bodyId = useId();
  const [folded, setFolded] = useState(false);
  const open = !collapsible || !folded;

  return (
    <section className="rounded border border-ui-border bg-ui-panel/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold tracking-wide text-ui-text-muted uppercase">
          {collapsible ? (
            <button
              type="button"
              onClick={() => setFolded((wasFolded) => !wasFolded)}
              aria-expanded={open}
              aria-controls={bodyId}
              className="flex min-h-11 touch-manipulation cursor-pointer items-center gap-1.5 p-0 hover:text-ui-text md:-m-1 md:min-h-0 md:p-1"
            >
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform md:h-3 md:w-3 ${open ? "" : "-rotate-90"}`}
                aria-hidden="true"
              />
              {title}
            </button>
          ) : (
            <span className="-m-1 flex items-center gap-1.5 p-1">{title}</span>
          )}
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
