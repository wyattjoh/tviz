// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "../domain/context.ts";
import * as Fixture from "../fixtures/transcript.ts";
import { parseTranscript } from "../parser/parse-transcript.ts";
import { LandingPreview } from "./LandingPreview.tsx";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  Fixture.resetFixtureSequence();
  vi.useFakeTimers();
});

/**
 * A Session of three API Calls, which is enough to watch the preview step and
 * enough to watch it wrap.
 */
const session = (): Session => {
  const outcome = parseTranscript(
    "preview.jsonl",
    Fixture.toJsonl([
      Fixture.skillListing(8_000),
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 30_000 } }),
      Fixture.toolResult(40_000),
      Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 60_000 } }),
      Fixture.userMessage(4_000),
      Fixture.assistantMessage({ id: "m3", usage: { cacheRead: 90_000 } }),
    ]),
  );
  if (!outcome.ok) throw new Error(`expected a Session, got: ${outcome.message}`);
  return outcome.session;
};

/**
 * Which API Call the preview is showing, read off the Session strip.
 */
const shownCall = (): string => {
  const strip = screen.getByRole("region", { name: "Session" });
  const match = /call (\d+)\/(\d+)/.exec(strip.textContent ?? "");
  if (match === null) throw new Error("the Session strip names no API Call");
  return `${match[1]}/${match[2]}`;
};

/**
 * Steps the preview on by one API Call. Each step is its own `act`: the hook
 * arms one timer per API Call and only arms the next once React has committed
 * the step before it.
 */
const step = (ms: number): void => {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
};

describe("LandingPreview", () => {
  it("opens on the first API Call and steps forward on its own", () => {
    render(<LandingPreview session={session()} />);
    expect(shownCall()).toBe("1/3");

    step(1_100);
    expect(shownCall()).toBe("2/3");

    step(1_100);
    expect(shownCall()).toBe("3/3");
  });

  it("wraps back to the first API Call instead of stopping at the end", () => {
    render(<LandingPreview session={session()} />);
    step(1_100);
    step(1_100);
    expect(shownCall()).toBe("3/3");

    // The finished Session is held longer than a step, so a plain step is not
    // enough to leave it.
    step(1_100);
    expect(shownCall()).toBe("3/3");

    step(1_100);
    expect(shownCall()).toBe("1/3");
  });

  // The whole claim of the landing page is that it is showing the interface,
  // so every region of the Workbench has to be in it. Its controls are real
  // components with no-op handlers rather than omitted: `App` renders the whole
  // layer `inert`, which is what makes an unreachable control safe, and a
  // preview missing the strip's close button would be showing a layout the
  // loaded view never has.
  it("fills every region of the Workbench", () => {
    render(<LandingPreview session={session()} />);

    expect(screen.getByRole("region", { name: "Session" })).toBeDefined();
    expect(screen.getByRole("main", { name: "Context grid" })).toBeDefined();
    expect(screen.getByRole("complementary", { name: "Legend and Inspector" })).toBeDefined();
    expect(screen.getByRole("group", { name: /^Context grid:/ })).toBeDefined();
    expect(screen.getByRole("region", { name: "Scrubber" })).toBeDefined();
  });

  it("fills the Inspector from a Cell of the Session rather than leaving it empty", () => {
    render(<LandingPreview session={session()} />);

    // The docked Inspector's unfilled state. A rail panel showing it behind a
    // blur reads as a layout bug rather than as the panel doing its job.
    expect(screen.queryByText("Hover a Cell.")).toBeNull();
  });

  it("parks on the finished Session and starts no timer under prefers-reduced-motion", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );

    render(<LandingPreview session={session()} />);
    expect(shownCall()).toBe("3/3");

    step(10_000);
    expect(shownCall()).toBe("3/3");

    vi.unstubAllGlobals();
  });
});
