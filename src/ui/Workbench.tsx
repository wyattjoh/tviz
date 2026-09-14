/**
 * The Workbench shell: the four regions the throwaway UI prototype settled on
 * (branch `wyattjoh/ui-prototype`, `src/prototype/README.md`), as slots.
 *
 * The menu bar sits above this, in `App`; what lives here is everything under
 * it — the Session strip, a body that is `minmax(0,1fr)_340px` from `md` up
 * (grid pane on the flexible left, fixed 340px right rail) and a single column
 * below it (grid pane full width, the rail behind a disclosure under it), and
 * the Scrubber docked across the bottom. The regions are a geometry, and both
 * the loaded Session and the landing page's blurred preview fill the same one.
 *
 * A 340px rail beside a phone's 390px viewport leaves the grid 50px, which is
 * what the breakpoint exists to prevent — but stacking the rail underneath
 * still spent most of the screen on it, so below `md` it is closed by default
 * and opened by a toggle row. The whole thing is media queries plus one
 * boolean: no viewport is measured in JS, and the *same* `<aside>` is the
 * disclosure's panel on a phone and the rail column on a wide window, so the
 * two layouts cannot drift apart.
 *
 * That one boolean is the only state the shell holds, and it describes the
 * shell rather than a Session.
 *
 * That shared geometry is the point. The landing page claims to show the
 * interface, and a preview that re-declared these grid classes would stop being
 * the interface the first time either side was touched.
 */
import { ChevronDown } from "lucide-react";
import { type ReactNode, useId, useState } from "react";

/**
 * Props for {@link Workbench}.
 */
export type WorkbenchProps = {
  /**
   * The Session strip — identity plus, on the loaded view, its close control.
   */
  readonly header: ReactNode;
  /**
   * The grid pane, which is also the body's scroll container.
   */
  readonly grid: ReactNode;
  /**
   * The right rail: a stack of {@link RailPanel}s.
   */
  readonly rail: ReactNode;
  /**
   * The Scrubber, docked across the bottom.
   */
  readonly scrubber: ReactNode;
};

/**
 * Lays the Session strip, grid pane, right rail and Scrubber into the shell.
 *
 * Fill a region; do not restructure the shell — see `.claude/rules/ui-theme.md`
 * and ADR-0006.
 */
export const Workbench = ({ header, grid, rail, scrubber }: WorkbenchProps) => {
  // The only state the shell owns, and it is about the shell rather than about
  // a Session: below `md` the rail is behind a disclosure, so that a phone
  // spends its height on the grid instead of on a legend nobody asked for. It
  // lives here rather than in `App` because both callers would otherwise have
  // to thread a boolean and a setter through to say the same thing, and
  // because — like a `RailPanel`'s fold — nothing outside reads it.
  const [railOpen, setRailOpen] = useState(false);
  const railId = useId();

  return (
    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)_auto]">
      {header}

      {/* Both axes are declared, and the column is `minmax(0,1fr)` rather than
          left implicit. A grid's implicit column is `auto`, whose base size is
          its items' *min-content* — so one unbreakable string anywhere inside
          widens the track past the viewport and scrolls the page sideways. The
          `md:` track list always carried that floor; the narrow layout has to
          carry it too. */}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)_auto_auto] md:grid-cols-[minmax(0,1fr)_340px] md:grid-rows-1">
        <main
          aria-label="Context grid"
          className="min-h-0 min-w-0 border-b border-ui-border md:border-r md:border-b-0"
        >
          {grid}
        </main>

        {/* A row of its own rather than a control floating over the grid: a
            Cell is a tap target, and a button sitting on top of one would eat
            taps meant for the thing the rail is there to describe. `md:hidden`
            because from `md` up the rail is simply present. */}
        <button
          type="button"
          onClick={() => setRailOpen((wasOpen) => !wasOpen)}
          aria-expanded={railOpen}
          aria-controls={railId}
          className="flex items-center gap-1.5 border-b border-ui-border bg-ui-sunken px-3 py-2 text-[11px] font-semibold tracking-wide text-ui-text-muted uppercase md:hidden"
        >
          <ChevronDown
            className={`h-3 w-3 shrink-0 transition-transform ${railOpen ? "" : "-rotate-90"}`}
            aria-hidden="true"
          />
          Legend and inspector
        </button>

        {/* Closed, the rail is `display: none` rather than translated away or
            zero-height: that takes its controls out of the tab order without an
            `inert` that would then have to be undone at `md`. `md:block` is
            what makes the disclosure a phone-only affordance — the same element
            is the rail column on a wide window, so the two never diverge. */}
        <aside
          id={railId}
          aria-label="Legend and Inspector"
          className={`max-h-[45vh] min-h-0 min-w-0 space-y-3 overflow-y-auto bg-ui-sunken p-3 md:max-h-none md:block ${
            railOpen ? "" : "hidden"
          }`}
        >
          {rail}
        </aside>
      </div>

      {scrubber}
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
   * Whether the heading folds the panel. Off for the one panel the rail holds
   * while a Cell is pinned: folding it would leave an empty rail under a lone
   * heading row. Defaults to on.
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
 * The rail stacks four panels — a 340px column from `md` up, a capped
 * scrolling strip under the grid below it — and on a short window the ones a
 * reader is not using push the ones they are below the fold. Each panel keeps
 * its own open state rather than lifting it out: nothing else reads it, and a
 * collapsed panel is a view preference, not Session state. That holds at every
 * width: below `md` the whole rail is behind a disclosure, so a panel never
 * needs to hide itself as well.
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
              className="-m-1 flex cursor-pointer items-center gap-1.5 p-1 hover:text-ui-text"
            >
              <ChevronDown
                className={`h-3 w-3 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
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
