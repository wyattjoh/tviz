// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextSnapshot, Session } from "../domain/context.ts";
import * as Fixture from "../fixtures/transcript.ts";
import { parseTranscript } from "../parser/parse-transcript.ts";
import { Scrubber } from "./Scrubber.tsx";

/**
 * View-box width the chart is stretched to in these tests, so a pointer at
 * `clientX` maps onto a known fraction of the Session. jsdom lays nothing out,
 * so the box has to be supplied.
 */
const CHART_PX = 400;

/**
 * Milliseconds the Scrubber waits between API Calls at 1x playback.
 */
const BASE_INTERVAL_MS = 260;

/**
 * Advances playback by exactly one API Call at 1x.
 *
 * Each step is its own `act`: the Scrubber arms one timer per API Call and only
 * arms the next once React has committed the step before it, which is what
 * stops a stale index from replaying the same API Call.
 */
const step1x = (): void => {
  act(() => {
    vi.advanceTimersByTime(BASE_INTERVAL_MS);
  });
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  Fixture.resetFixtureSequence();
});

/**
 * A Session of five API Calls, the third of which is a compaction.
 */
const session = (): Session => {
  const outcome = parseTranscript(
    "stepped.jsonl",
    Fixture.toJsonl([
      Fixture.skillListing(8_000),
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 30_000 } }),
      Fixture.toolResult(40_000),
      Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 60_000 } }),
      Fixture.compactSummary(6_000),
      Fixture.assistantMessage({ id: "m3", usage: { cacheRead: 25_000 } }),
      Fixture.userMessage(4_000),
      Fixture.assistantMessage({ id: "m4", usage: { cacheRead: 34_000 } }),
      Fixture.toolResult(20_000),
      Fixture.assistantMessage({ id: "m5", usage: { cacheRead: 41_000 } }),
    ]),
  );
  if (!outcome.ok) throw new Error(`expected a Session, got: ${outcome.message}`);
  return outcome.session;
};

/**
 * Every API Call the harness was asked to select, oldest first.
 */
let selected: number[] = [];

/**
 * Renders the Scrubber as the App does — the caller owns the selected API Call
 * — so a test drives the real control rather than a stub.
 */
const Harness = ({
  calls,
  windowSize,
}: {
  calls: readonly ContextSnapshot[];
  windowSize: number;
}) => {
  const [callIndex, setCallIndex] = useState(calls.length - 1);
  return (
    <Scrubber
      calls={calls}
      windowSize={windowSize}
      callIndex={callIndex}
      onSelectCall={(index) => {
        selected.push(index);
        setCallIndex(index);
      }}
    />
  );
};

const renderScrubber = (loaded: Session = session()) => {
  selected = [];
  const view = render(<Harness calls={loaded.calls} windowSize={loaded.windowSize} />);
  // By `data-chart`, not by tag: the transport controls are icons, so the
  // first `<svg>` in the Scrubber is a button's glyph rather than the chart.
  const chart = view.container.querySelector<SVGSVGElement>('[data-chart="calls"]');
  if (chart === null) throw new Error("the Scrubber has no chart");
  // jsdom reports a zero-sized box for everything, so the chart is given one.
  chart.getBoundingClientRect = () =>
    ({ left: 0, width: CHART_PX, top: 0, height: 110 }) as DOMRect;
  return { ...view, chart, calls: loaded.calls };
};

const range = (): HTMLInputElement => screen.getByLabelText("API call") as HTMLInputElement;

const position = (): string => screen.getByText(/^call \d+\/\d+/).textContent ?? "";

describe("Scrubber", () => {
  it("starts on the last API Call of the Session", () => {
    const { calls } = renderScrubber();

    expect(range().value).toBe(String(calls.length - 1));
    expect(position()).toContain(`call ${calls.length}/${calls.length}`);
  });

  it("scrubs to the API Call under the pointer when the chart is dragged", () => {
    const { chart, calls } = renderScrubber();

    fireEvent.pointerDown(chart, { clientX: 0, pointerId: 1 });
    expect(range().value).toBe("0");

    fireEvent.pointerMove(chart, { clientX: CHART_PX / 2, pointerId: 1 });
    expect(range().value).toBe(String(Math.round((calls.length - 1) / 2)));

    fireEvent.pointerUp(chart, { clientX: CHART_PX / 2, pointerId: 1 });
    // The pointer is up: moving over the chart no longer scrubs.
    fireEvent.pointerMove(chart, { clientX: CHART_PX, pointerId: 1 });
    expect(range().value).toBe(String(Math.round((calls.length - 1) / 2)));
  });

  it("parks on an end when the drag runs past the chart", () => {
    const { chart, calls } = renderScrubber();

    fireEvent.pointerDown(chart, { clientX: CHART_PX / 2, pointerId: 1 });
    fireEvent.pointerMove(chart, { clientX: -500, pointerId: 1 });
    expect(range().value).toBe("0");

    fireEvent.pointerMove(chart, { clientX: CHART_PX + 500, pointerId: 1 });
    expect(range().value).toBe(String(calls.length - 1));
  });

  it("moves one API Call at a time with the arrow keys", () => {
    const { calls } = renderScrubber();
    const last = calls.length - 1;

    fireEvent.keyDown(range(), { key: "ArrowLeft" });
    expect(range().value).toBe(String(last - 1));

    fireEvent.keyDown(range(), { key: "ArrowLeft" });
    expect(range().value).toBe(String(last - 2));

    fireEvent.keyDown(range(), { key: "ArrowRight" });
    expect(range().value).toBe(String(last - 1));
  });

  it("steps with the arrow keys straight after the chart was dragged", () => {
    const { chart, calls } = renderScrubber();

    // Dragging the chart is the advertised way in, and the caption promises
    // ←/→ steps next: the chart is not focusable, so the drag has to leave
    // focus on a Scrubber control rather than on the document.
    fireEvent.pointerDown(chart, { clientX: CHART_PX / 2, pointerId: 1 });
    fireEvent.pointerUp(chart, { clientX: CHART_PX / 2, pointerId: 1 });
    const middle = Math.round((calls.length - 1) / 2);
    expect(range().value).toBe(String(middle));
    expect(document.activeElement).toBe(range());

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowRight" });
    expect(range().value).toBe(String(middle + 1));

    fireEvent.keyDown(document.activeElement ?? document.body, { key: "ArrowLeft" });
    expect(range().value).toBe(String(middle));
  });

  it("stops at the ends rather than stepping outside the Session", () => {
    const { calls } = renderScrubber();

    fireEvent.keyDown(range(), { key: "Home" });
    expect(range().value).toBe("0");
    fireEvent.keyDown(range(), { key: "ArrowLeft" });
    expect(range().value).toBe("0");

    fireEvent.keyDown(range(), { key: "End" });
    expect(range().value).toBe(String(calls.length - 1));
    fireEvent.keyDown(range(), { key: "ArrowRight" });
    expect(range().value).toBe(String(calls.length - 1));
  });

  it("jumps to the first and last API Call from the transport", () => {
    const { calls } = renderScrubber();

    fireEvent.click(screen.getByLabelText("First call"));
    expect(range().value).toBe("0");

    fireEvent.click(screen.getByLabelText("Last call"));
    expect(range().value).toBe(String(calls.length - 1));
  });

  it("plays call by call and stops at the last API Call", () => {
    vi.useFakeTimers();
    const { calls } = renderScrubber();

    fireEvent.click(screen.getByLabelText("First call"));
    fireEvent.click(screen.getByLabelText("Play"));
    // Pressing play from the first call starts there rather than rewinding.
    expect(range().value).toBe("0");

    // One API Call per step, in order, all the way to the end.
    for (let step = 1; step < calls.length; step += 1) {
      step1x();
      expect(range().value).toBe(String(step));
    }
    expect(selected).toEqual([0, 1, 2, 3, 4]);

    // The last API Call is the end of the Session: playback stops on its own.
    step1x();
    step1x();
    expect(range().value).toBe(String(calls.length - 1));
    expect(screen.getByLabelText("Play")).toBeDefined();
  });

  it("advances faster at a higher playback speed", () => {
    vi.useFakeTimers();
    renderScrubber();

    fireEvent.click(screen.getByLabelText("First call"));
    fireEvent.click(screen.getByLabelText("Play"));

    // A quarter of the base interval is not yet a step at 1x.
    act(() => {
      vi.advanceTimersByTime(BASE_INTERVAL_MS / 4);
    });
    expect(range().value).toBe("0");

    // At 4x it is exactly one, and the change takes effect on the next step.
    fireEvent.click(screen.getByText("4×"));
    act(() => {
      vi.advanceTimersByTime(BASE_INTERVAL_MS / 4);
    });
    expect(range().value).toBe("1");
  });

  it("restarts from the first API Call when play is pressed at the end", () => {
    vi.useFakeTimers();
    const { calls } = renderScrubber();

    expect(range().value).toBe(String(calls.length - 1));
    fireEvent.click(screen.getByLabelText("Play"));
    expect(range().value).toBe("0");

    step1x();
    expect(range().value).toBe("1");
  });

  it("pauses playback on any manual scrub", () => {
    vi.useFakeTimers();
    const { chart } = renderScrubber();

    fireEvent.click(screen.getByLabelText("First call"));
    fireEvent.click(screen.getByLabelText("Play"));
    step1x();
    expect(range().value).toBe("1");

    fireEvent.pointerDown(chart, { clientX: 0, pointerId: 1 });
    expect(screen.getByLabelText("Play")).toBeDefined();
    for (let tick = 0; tick < 4; tick += 1) step1x();
    expect(range().value).toBe("0");
  });

  it("pauses playback when the range input is stepped", () => {
    vi.useFakeTimers();
    renderScrubber();

    fireEvent.click(screen.getByLabelText("First call"));
    fireEvent.click(screen.getByLabelText("Play"));
    fireEvent.keyDown(range(), { key: "ArrowRight" });

    const stepped = range().value;
    for (let tick = 0; tick < 4; tick += 1) step1x();
    expect(range().value).toBe(stepped);
  });

  it("marks every compaction on the chart and counts them in the caption", () => {
    const { chart, calls } = renderScrubber();
    const compactions = calls.filter((call) => call.reset);

    expect(compactions).toHaveLength(1);
    // One dashed rule per compaction, plus the solid playhead.
    const rules = chart.querySelectorAll("line");
    expect(rules).toHaveLength(compactions.length + 1);
    expect(chart.querySelectorAll("line[stroke-dasharray]")).toHaveLength(compactions.length);
    expect(screen.getByText(/dashed rule = compaction \(1\)/)).toBeDefined();
  });

  it("names the selected API Call as a compaction for assistive technology", () => {
    const { calls } = renderScrubber();
    const compaction = calls.findIndex((call) => call.reset);

    fireEvent.change(range(), { target: { value: String(compaction) } });
    expect(range().getAttribute("aria-valuetext")).toContain("compaction");

    fireEvent.keyDown(range(), { key: "ArrowLeft" });
    expect(range().getAttribute("aria-valuetext")).not.toContain("compaction");
  });

  it("draws one band per Category regardless of the Session", () => {
    const { chart } = renderScrubber();
    expect(chart.querySelectorAll("polygon")).toHaveLength(6);
  });
});
