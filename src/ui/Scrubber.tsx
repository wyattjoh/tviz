/**
 * The Scrubber: the control that selects which API Call's Context Snapshot the
 * grid and legend show.
 *
 * It is a stacked-area chart of Category totals across the whole Session rather
 * than a bare slider, because the shape of the chart is the answer to "when did
 * the context fill up" — and because a compaction, the one event that rewrites
 * the append-only grid (ADR-0006), is visible in it as a drop.
 *
 * Three ways in, all landing on the same `onSelectCall`: drag the chart, use
 * the transport buttons, or step the range input with the arrow keys. Playback
 * lives here too; any manual scrub pauses it.
 */
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ContextSnapshot } from "../domain/context.ts";
import { formatTokens } from "./format.ts";
import {
  bandsFor,
  callIndexAtRatio,
  CHART_HEIGHT,
  CHART_WIDTH,
  compactionIndices,
  playheadX,
} from "./scrubber.ts";
import { CATEGORY_SVG_FILL_CLASS } from "./theme.ts";

/**
 * Milliseconds between API Calls at 1× playback.
 */
const BASE_INTERVAL_MS = 260;

/**
 * Playback speeds offered, as multiples of {@link BASE_INTERVAL_MS}.
 */
const SPEEDS = [0.5, 1, 2, 4] as const;

/**
 * Steps the selected API Call forward while playing.
 *
 * One timeout per API Call, re-armed by the effect once the step it scheduled
 * has landed, rather than a free-running interval reading the index out of a
 * ref: the selected API Call is owned by the caller, so a repeating timer would
 * be racing a value it cannot see, and the first stale tick would replay the
 * same API Call for the rest of the Session. Re-arming also means a speed
 * change takes effect on the very next step.
 *
 * Playback stops on its own at the last API Call; pressing play there rewinds
 * to the first, so a Session can be watched again without touching the
 * transport.
 */
const usePlayback = (
  callIndex: number,
  lastIndex: number,
  onSelectCall: (index: number) => void,
) => {
  const [requested, setRequested] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  // Reaching the last API Call ends playback by derivation rather than by
  // clearing the flag from inside the effect: the end of a Session is a fact
  // about the selected API Call, not a state to keep in sync with one.
  const atEnd = callIndex >= lastIndex;
  const playing = requested && !atEnd;

  useEffect(() => {
    if (!playing) return;
    const timer = setTimeout(() => onSelectCall(callIndex + 1), BASE_INTERVAL_MS / speed);
    return () => clearTimeout(timer);
  }, [playing, speed, callIndex, onSelectCall]);

  const pause = useCallback(() => setRequested(false), []);
  const toggle = useCallback(() => {
    if (playing) {
      setRequested(false);
      return;
    }
    // Pressing play at the end replays the Session from the first API Call.
    if (atEnd) onSelectCall(0);
    setRequested(true);
  }, [playing, atEnd, onSelectCall]);

  return { playing, toggle, pause, speed, setSpeed };
};

/**
 * Props for {@link Scrubber}.
 */
export type ScrubberProps = {
  /**
   * Context Snapshots of the Session, in transcript order.
   */
  readonly calls: readonly ContextSnapshot[];
  /**
   * The Context Window the chart's full height stands for.
   */
  readonly windowSize: number;
  /**
   * Which API Call is selected.
   */
  readonly callIndex: number;
  /**
   * Selects an API Call. The Scrubber never clamps for the caller; it only ever
   * passes an index that exists.
   */
  readonly onSelectCall: (index: number) => void;
};

/**
 * Steps through the API Calls of a Session, showing how the context grew.
 */
export const Scrubber = ({ calls, windowSize, callIndex, onSelectCall }: ScrubberProps) => {
  const lastIndex = calls.length - 1;
  const play = usePlayback(callIndex, lastIndex, onSelectCall);
  const chartRef = useRef<SVGSVGElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  const bands = useMemo(() => bandsFor(calls, windowSize), [calls, windowSize]);
  const compactions = useMemo(() => compactionIndices(calls), [calls]);

  /**
   * Selects an API Call on behalf of the user, which always pauses playback:
   * scrubbing by hand while the timer keeps stepping would fight the pointer.
   */
  const pause = play.pause;
  const scrubTo = useCallback(
    (index: number) => {
      pause();
      onSelectCall(Math.max(0, Math.min(lastIndex, index)));
    },
    [pause, onSelectCall, lastIndex],
  );

  const scrubToPointer = useCallback(
    (clientX: number) => {
      const bounds = chartRef.current?.getBoundingClientRect();
      if (bounds === undefined || bounds.width <= 0) return;
      scrubTo(callIndexAtRatio((clientX - bounds.left) / bounds.width, calls.length));
    },
    [scrubTo, calls.length],
  );

  const onPointerDown = (event: PointerEvent<SVGSVGElement>) => {
    dragging.current = true;
    // The chart is a drag surface, not a control: pressing it would otherwise
    // leave focus on the document and the arrow keys dead. Focus goes to the
    // range input — the Scrubber's one real slider — so dragging and then
    // stepping with ←/→ works as the caption promises. The `mousedown` that
    // follows this event is suppressed below, or its default action would take
    // the focus straight back off again.
    rangeRef.current?.focus({ preventScroll: true });
    // Capturing keeps the drag alive past the edges of the chart, so scrubbing
    // too far parks on the first or last API Call instead of stopping dead.
    // jsdom has no capture API, hence the guard.
    if (typeof event.currentTarget.setPointerCapture === "function") {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    scrubToPointer(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
    if (dragging.current) scrubToPointer(event.clientX);
  };

  const endDrag = (event: PointerEvent<SVGSVGElement>) => {
    dragging.current = false;
    if (typeof event.currentTarget.releasePointerCapture === "function") {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  /**
   * Arrow keys step one API Call at a time, Home and End jump to either end.
   *
   * Handled on the Scrubber as a whole rather than left to the range input's
   * native behaviour, so that a step pauses playback like every other manual
   * scrub and so the keys also work while focus sits on a transport button.
   * Nothing inside the Scrubber takes focus except its controls — the chart
   * hands focus to the range input when it is dragged — so every route in
   * reaches this handler.
   */
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const step =
      event.key === "ArrowLeft" || event.key === "ArrowDown"
        ? -1
        : event.key === "ArrowRight" || event.key === "ArrowUp"
          ? 1
          : 0;
    if (step !== 0) {
      event.preventDefault();
      scrubTo(callIndex + step);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      scrubTo(event.key === "Home" ? 0 : lastIndex);
    }
  };

  const selected = calls[callIndex];

  return (
    <section
      aria-label="Scrubber"
      onKeyDown={onKeyDown}
      className="border-t border-ui-border bg-ui-sunken px-4 py-2.5"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => scrubTo(0)}
            aria-label="First call"
            className="rounded px-2 py-1.5 text-ui-text-muted hover:bg-ui-panel hover:text-ui-text"
          >
            {/* The icons are `aria-hidden`: every transport button already
                carries its own label, and "Play" flipping to "Pause" is what a
                screen reader follows rather than the glyph. */}
            <SkipBack aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={play.toggle}
            aria-label={play.playing ? "Pause" : "Play"}
            className="rounded bg-ui-action px-3 py-1.5 text-ui-shell hover:opacity-90"
          >
            {play.playing ? (
              <Pause aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play aria-hidden="true" className="h-3.5 w-3.5 fill-current" />
            )}
          </button>
          <button
            type="button"
            onClick={() => scrubTo(lastIndex)}
            aria-label="Last call"
            className="rounded px-2 py-1.5 text-ui-text-muted hover:bg-ui-panel hover:text-ui-text"
          >
            <SkipForward aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>

        <div
          role="group"
          aria-label="Playback speed"
          className="flex overflow-hidden rounded border border-ui-border text-[11px]"
        >
          {SPEEDS.map((speed) => (
            <button
              type="button"
              key={speed}
              onClick={() => play.setSpeed(speed)}
              aria-pressed={play.speed === speed}
              className={`px-2 py-1 font-mono ${
                play.speed === speed
                  ? "bg-ui-panel-active text-ui-text"
                  : "text-ui-text-muted hover:bg-ui-panel"
              }`}
            >
              {speed}×
            </button>
          ))}
        </div>

        <span className="font-mono text-xs text-ui-text-secondary">
          call {callIndex + 1}/{calls.length}
          {selected === undefined ? null : ` · ${formatTokens(selected.measuredTotal)}`}
        </span>

        <span className="ml-auto text-[11px] text-ui-text-faint">
          drag the chart to scrub · ←/→ to step
          {compactions.length === 0 ? null : ` · dashed rule = compaction (${compactions.length})`}
        </span>
      </div>

      <div className="mt-2 rounded border border-ui-border bg-ui-canvas">
        {/* The chart is a drag surface and a picture; the range input below
            carries the slider semantics, so screen readers get one control
            rather than two that set the same value. That leaves it with no
            accessible name to be found by, so `data-chart` is how a test
            addresses it — the transport icons are `<svg>` elements too. */}
        <svg
          ref={chartRef}
          data-chart="calls"
          aria-hidden="true"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="h-[110px] w-full cursor-crosshair touch-none"
          onPointerDown={onPointerDown}
          // Keeps the browser's own focus handling — which would move focus to
          // the chart's nearest focusable ancestor, i.e. off the range input —
          // and its text selection out of the drag.
          onMouseDown={(event) => event.preventDefault()}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {bands.map((band) => (
            // No `<title>`: the chart is aria-hidden, and the legend under the
            // grid already names every Category and colour.
            <polygon
              key={band.category}
              points={band.points}
              className={CATEGORY_SVG_FILL_CLASS[band.category]}
              fillOpacity={0.85}
            />
          ))}
          {compactions.map((index) => (
            <line
              key={`compaction-${index}`}
              x1={playheadX(index, calls.length)}
              x2={playheadX(index, calls.length)}
              y1={0}
              y2={CHART_HEIGHT}
              className="stroke-ui-warning"
              strokeWidth={2}
              strokeDasharray="4 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <line
            x1={playheadX(callIndex, calls.length)}
            x2={playheadX(callIndex, calls.length)}
            y1={0}
            y2={CHART_HEIGHT}
            className="stroke-ui-text"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <input
        ref={rangeRef}
        type="range"
        min={0}
        max={lastIndex}
        step={1}
        value={callIndex}
        onChange={(event) => scrubTo(Number(event.target.value))}
        aria-label="API call"
        aria-valuetext={`Call ${callIndex + 1} of ${calls.length}${
          selected?.reset === true ? ", compaction" : ""
        }`}
        className="mt-2 w-full accent-ui-action"
      />
    </section>
  );
};
