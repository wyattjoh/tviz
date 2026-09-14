/**
 * The landing page's background: a real Demo Session in the real Workbench,
 * stepping through its own API Calls behind the drop panel.
 *
 * Every region is the component the loaded view uses, fed by the same calls —
 * `effectiveWindowSize`, `cumulativeItems`, `buildCells` — so the landing page
 * is showing the tool rather than a picture of it. What it does not have is
 * state: no filters to change, no Cell to pin, no Scrubber to drag. `App`
 * renders it `inert` and `aria-hidden`, which is what keeps the grid's Cell
 * buttons and the Scrubber's transport out of the tab order and out of the
 * accessibility tree. It is scenery.
 *
 * The Inspector is pointed at a Cell rather than left on its "Hover a Cell."
 * line: the panel's job is to show what reading a Cell looks like, and an
 * empty rail panel behind a blur reads as a layout bug. The Cell it picks is a
 * real one from the current API Call — nothing here is fabricated.
 */
import { useMemo } from "react";
import { cumulativeItems, peakMeasuredTotal, type Session } from "../domain/context.ts";
import { ContextGrid } from "./ContextGrid.tsx";
import { ContextLegend } from "./ContextLegend.tsx";
import { ContextWindowMenu, ContextWindowPanel } from "./ContextWindowPanel.tsx";
import { ALL_SHOWN } from "./filters.ts";
import { buildCells, type Cell } from "./grid.ts";
import { Inspector } from "./Inspector.tsx";
import { usePreviewScrub } from "./preview-scrub.ts";
import { Scrubber } from "./Scrubber.tsx";
import { SessionHeader } from "./SessionHeader.tsx";
import { effectiveWindowSize } from "./window-choice.ts";
import { RailPanel, Workbench } from "./Workbench.tsx";

const noop = () => {};

/**
 * The Cell the preview's Inspector reads: the middle of what the current API
 * Call has used, so the list is neither the very first Cell (always System)
 * nor an empty one past the end of the context.
 */
const midUsedCell = (cells: readonly Cell[]): Cell | undefined => {
  const used = cells.filter((cell) => cell.fill !== "free");
  return used[Math.floor(used.length / 2)];
};

/**
 * Props for {@link LandingPreview}.
 */
export type LandingPreviewProps = {
  /**
   * The Demo Session to show. Not an open Session: it is never in the loader's
   * list, never in the File menu, and a dropped transcript replaces it.
   */
  readonly session: Session;
};

/**
 * The Workbench, filled with a Demo Session and driven by its own clock.
 */
export const LandingPreview = ({ session }: LandingPreviewProps) => {
  const callIndex = usePreviewScrub(session.calls.length);
  const windowSize = effectiveWindowSize(session, "auto");

  const cells = useMemo(
    () => buildCells(cumulativeItems(session.calls, callIndex), windowSize),
    [session.calls, callIndex, windowSize],
  );

  const snapshot = session.calls[callIndex];
  if (snapshot === undefined) return null;

  return (
    <Workbench
      // The preview's whole pitch is the chart tracking the grid as the window
      // fills, so it keeps the Scrubber at every width — a loaded Session on a
      // phone starts with it folded away instead.
      scrubberAlwaysVisible
      header={<SessionHeader session={session} snapshot={snapshot} onClose={noop} />}
      grid={
        <ContextGrid
          cells={cells}
          windowSize={windowSize}
          measuredTotal={snapshot.measuredTotal}
          filters={ALL_SHOWN}
          pinnedIndex={undefined}
          onInspect={noop}
          onPin={noop}
        />
      }
      rail={
        <>
          <RailPanel title="Categories">
            <ContextLegend
              snapshot={snapshot}
              windowSize={windowSize}
              filters={ALL_SHOWN}
              onToggleCategory={noop}
              onToggleMessageKind={noop}
              onColourByKind={noop}
            />
          </RailPanel>

          <RailPanel
            title="Context Window"
            action={<ContextWindowMenu windowChoice="auto" onWindowChoiceChange={noop} />}
          >
            <ContextWindowPanel
              measuredTotal={snapshot.measuredTotal}
              windowSize={windowSize}
              peak={peakMeasuredTotal(session.calls)}
              windowChoice="auto"
            />
          </RailPanel>

          <RailPanel title="Inspector">
            <Inspector cell={midUsedCell(cells)} filters={ALL_SHOWN} pinned={false} />
          </RailPanel>
        </>
      }
      scrubber={
        <Scrubber
          calls={session.calls}
          windowSize={windowSize}
          callIndex={callIndex}
          onSelectCall={noop}
        />
      }
    />
  );
};
