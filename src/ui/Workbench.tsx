/**
 * The Workbench shell: the four regions the throwaway UI prototype settled on
 * (branch `wyattjoh/ui-prototype`, `src/prototype/README.md`), as slots.
 *
 * The menu bar sits above this, in `App`; what lives here is everything under
 * it — the Session strip, a body of `minmax(0,1fr)_340px` with the grid pane on
 * the flexible left and the fixed 340px right rail, and the Scrubber docked
 * across the bottom. It holds no state and no handlers: the regions are a
 * geometry, and both the loaded Session and the landing page's blurred preview
 * fill the same one.
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
export const Workbench = ({ header, grid, rail, scrubber }: WorkbenchProps) => (
  <div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto]">
    {header}

    <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px]">
      <main aria-label="Context grid" className="min-h-0 border-r border-ui-border">
        {grid}
      </main>

      <aside
        aria-label="Legend and Inspector"
        className="min-h-0 space-y-3 overflow-y-auto bg-ui-sunken p-3"
      >
        {rail}
      </aside>
    </div>

    {scrubber}
  </div>
);

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
 * The rail stacks four panels in a fixed 340px column, and on a short window
 * the ones a reader is not using push the ones they are below the fold. Each
 * panel keeps its own open state rather than lifting it out: nothing else
 * reads it, and a collapsed panel is a view preference, not Session state.
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
