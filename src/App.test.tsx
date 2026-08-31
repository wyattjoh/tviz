// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App.tsx";
import * as Fixture from "./fixtures/transcript.ts";
import { parseTranscript } from "./parser/parse-transcript.ts";
import { fileListOf, transcriptFile } from "./ui/test-dom.ts";

// jsdom has no Web Worker, so the client is stubbed with the parser it runs.
// Everything either side of the Worker boundary is the real code.
vi.mock("./worker/parse-client.ts", () => ({
  parseTranscriptFile: async (file: File) => parseTranscript(file.name, await file.text()),
}));

afterEach(cleanup);
beforeEach(() => {
  Fixture.resetFixtureSequence();
});

const LAST_CALL_TOKENS = 45_000;

/**
 * A Session whose last API Call holds every Category, including two Categories
 * smaller than one Cell — Custom agents (375 tokens) and MCP (175) — which land
 * in different Cells, the case the grid's one-Cell floor exists for.
 *
 * The first API Call measures 30,400 rather than a round 30,000 so that it ends
 * *inside* a Cell, as a Session in the wild does. On the boundary, the Messages
 * item MCP shares its Cell with would hold that one Cell and stop dead there,
 * and the floor does not take a Category's only Cell.
 */
const transcript = (): string =>
  Fixture.toJsonl([
    Fixture.skillListing(9_000),
    Fixture.mcpInstructions(700),
    Fixture.agentListing(1_500),
    Fixture.nestedMemory(6_000),
    Fixture.userMessage(2_000),
    Fixture.assistantMessage({
      id: "m1",
      usage: { cacheRead: 30_400 },
      textCharacters: 600,
    }),
    Fixture.toolResult(40_000),
    Fixture.assistantMessage({ id: "m2", usage: { cacheRead: LAST_CALL_TOKENS } }),
  ]);

const drop = (file: File): void => {
  const target = screen.getByText("drop a .jsonl transcript").closest("section");
  if (target === null) throw new Error("the drop zone has no drop target");
  fireEvent.drop(target, { dataTransfer: { files: fileListOf(file) } });
};

const cellTitles = (): readonly string[] =>
  Array.from(document.querySelectorAll("[title]"), (cell) => cell.getAttribute("title") ?? "");

describe("App", () => {
  it("renders the grid and legend for the last API Call of a dropped transcript", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));

    const grid = await screen.findByRole("img");
    expect(grid.getAttribute("aria-label")).toBe("Context grid: 45.0k of 200.0k tokens used");
    expect(grid.childElementCount).toBe(200);

    // The legend reads the same measured total as the grid's fill level.
    expect(screen.getByText("session-a.jsonl")).toBeDefined();
    expect(screen.getByText(/45\.0k \/ 200\.0k tokens/)).toBeDefined();
    expect(screen.getByText("Free space")).toBeDefined();
    expect(screen.getByText("155.0k")).toBeDefined();
  });

  it("lays a loaded Session out in the four Workbench regions", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    // 1 — menu bar, with the File menu Sessions will be opened from.
    const menuBar = screen.getByRole("banner", { name: "tviz" });
    expect(menuBar.contains(screen.getByRole("button", { name: "File" }))).toBe(true);

    // 2 — Session strip: which Session, which API Call, how full.
    const strip = screen.getByRole("region", { name: "Session" });
    expect(strip.contains(screen.getByText("session-a.jsonl"))).toBe(true);
    expect(strip.contains(screen.getByText(/45\.0k \/ 200\.0k tokens/))).toBe(true);

    // 3 — grid pane on the flexible left, scrolling under its own column count.
    const grid = screen.getByRole("img");
    const pane = screen.getByRole("main", { name: "Context grid" });
    expect(pane.contains(grid)).toBe(true);
    expect(grid.parentElement?.className).toContain("overflow-auto");

    // 4 — the fixed 340px right rail, holding the legend and the docked
    // Inspector panel the Inspector work fills.
    const rail = screen.getByRole("complementary", { name: "Legend and Inspector" });
    expect(rail.contains(screen.getByText("Free space"))).toBe(true);
    expect(rail.contains(screen.getByText("Inspector"))).toBe(true);
    expect(pane.parentElement?.className).toContain("grid-cols-[minmax(0,1fr)_340px]");

    // 5 — the Scrubber across the bottom.
    const scrubber = screen.getByRole("region", { name: "Scrubber" });
    expect(scrubber.contains(screen.getByLabelText("API call"))).toBe(true);
  });

  it("opens and closes the File menu the Session list will fill", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    const file = screen.getByRole("button", { name: "File" });
    expect(file.getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(file);
    expect(file.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Open files…")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(file.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Open files…")).toBeNull();
  });

  it("lays Cells out in the order items entered the context", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    // System is the front of every request, and the Skill listing that arrived
    // before the first API Call sits directly behind it — Categories are not
    // gathered into blocks (ADR-0006).
    const [first, ...rest] = cellTitles();
    expect(first).toMatch(/^System · 0–1\.0k/);
    expect(rest.find((title) => !title.startsWith("System ·"))).toMatch(/^Skills ·/);
    expect(cellTitles().at(-1)).toMatch(/^Free · 199\.0k–200\.0k/);
  });

  it("gives every Category the legend lists at least one Cell", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    // Custom agents (375 tokens) and MCP (175) are each smaller than a Cell, so
    // they lose every majority vote; the one-Cell floor still gives them the
    // Cell they have the strongest claim on, which changes that Cell's colour
    // without moving any Cell (ADR-0006).
    for (const label of ["System", "Custom agents", "Memory files", "Skills", "MCP", "Messages"]) {
      expect
        .soft(
          cellTitles().some((title) => title.startsWith(`${label} ·`)),
          `${label} has no Cell in the grid`,
        )
        .toBe(true);
    }
  });

  it("reads legend totals from the Context Snapshot, not from the Cell layout", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    // Both Categories hold a single Cell — 1,000 tokens of grid — while the
    // legend reports their exact totals. Proportions are read from the legend,
    // never counted off the grid (ADR-0006).
    const cellsFor = (label: string): number =>
      cellTitles().filter((title) => title.startsWith(`${label} ·`)).length;
    expect(cellsFor("Custom agents")).toBe(1);
    expect(cellsFor("MCP")).toBe(1);

    for (const label of ["Custom agents", "MCP"]) {
      expect(screen.getByText(label)).toBeDefined();
    }
    expect(screen.getByText("375")).toBeDefined();
    expect(screen.getByText("175")).toBeDefined();
  });

  it("does not claim a Subagent Session count nobody measured", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    expect(screen.queryByText(/subagent sessions/)).toBeNull();
  });

  it("shows the parser's message in an alert when the file is empty", async () => {
    render(<App />);
    drop(transcriptFile("empty.jsonl", "   \n\n"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("empty.jsonl is empty.");
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the parser's message in an alert when the file is not a transcript", async () => {
    render(<App />);
    drop(transcriptFile("notes.txt", "hello, this is not a transcript\n"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("notes.txt is not a Claude Code transcript");
  });

  it("returns to the drop zone when the Session is cleared", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    fireEvent.click(screen.getByRole("button", { name: "clear" }));

    expect(screen.getByText("drop a .jsonl transcript")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });

  describe("stepping through the Session with the Scrubber", () => {
    /**
     * Four API Calls, the third of which is a compaction, so the grid, the
     * legend and the header each have something different to say at every stop.
     */
    const steppedTranscript = (): string =>
      Fixture.toJsonl([
        Fixture.skillListing(9_000),
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 30_000 } }),
        Fixture.toolResult(60_000),
        Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 62_000 } }),
        Fixture.compactSummary(6_000),
        Fixture.assistantMessage({ id: "m3", usage: { cacheRead: 41_000 } }),
        Fixture.userMessage(8_000),
        Fixture.assistantMessage({ id: "m4", usage: { cacheRead: 53_000 } }),
      ]);

    const openStepped = async (): Promise<HTMLInputElement> => {
      render(<App />);
      drop(transcriptFile("stepped.jsonl", steppedTranscript()));
      await screen.findByRole("img");
      return screen.getByLabelText("API call") as HTMLInputElement;
    };

    const gridLabel = (): string => screen.getByRole("img").getAttribute("aria-label") ?? "";

    it("opens on the last API Call", async () => {
      const range = await openStepped();

      expect(range.value).toBe("3");
      expect(gridLabel()).toBe("Context grid: 53.0k of 200.0k tokens used");
    });

    it("redraws the grid and the legend for the API Call the Scrubber selects", async () => {
      const range = await openStepped();

      fireEvent.click(screen.getByLabelText("First call"));
      expect(gridLabel()).toBe("Context grid: 30.0k of 200.0k tokens used");
      // The legend's free-space line is the window minus the selected call.
      expect(screen.getByText("170.0k")).toBeDefined();

      fireEvent.keyDown(range, { key: "ArrowRight" });
      expect(gridLabel()).toBe("Context grid: 62.0k of 200.0k tokens used");
      expect(screen.getByText("138.0k")).toBeDefined();
    });

    it("grows at the frontier instead of re-flowing when a call is stepped", async () => {
      const range = await openStepped();

      fireEvent.click(screen.getByLabelText("First call"));
      const before = cellTitles();
      // The first API Call measures 30k, so its first 30 Cells are fully
      // covered and the 31st is the frontier the next call finishes.
      const frontier = 30;

      fireEvent.keyDown(range, { key: "ArrowRight" });
      const after = cellTitles();

      // Every Cell the first API Call fully covered says exactly what it said
      // before; only Cells at the frontier changed (ADR-0006).
      expect(after.slice(0, frontier)).toEqual(before.slice(0, frontier));
      expect(after.filter((title) => title.startsWith("Free ·")).length).toBeLessThan(
        before.filter((title) => title.startsWith("Free ·")).length,
      );
    });

    it("keeps a Cell the floor granted when that Category grows past a Cell", async () => {
      // MCP enters as 175 tokens — smaller than a Cell — and is only on the
      // grid because the floor granted it one. The next API Call adds 3,000
      // tokens of deferred tool names to the same Category, which wins Cells of
      // its own at the frontier. The granted Cell sits ~20 Cells behind that
      // frontier and must not change hands (ADR-0006).
      render(<App />);
      drop(
        transcriptFile(
          "floored.jsonl",
          Fixture.toJsonl([
            Fixture.mcpInstructions(700),
            Fixture.toolResult(80_000),
            Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 40_400 } }),
            Fixture.deferredTools(12_000),
            Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 44_000 } }),
          ]),
        ),
      );
      await screen.findByRole("img");

      const range = screen.getByLabelText("API call") as HTMLInputElement;
      fireEvent.click(screen.getByLabelText("First call"));
      const before = cellTitles();
      const granted = before.findIndex((title) => title.startsWith("MCP ·"));
      // The first API Call measures 40.4k, so its first 40 Cells are settled.
      const frontier = 40;
      expect(granted).toBeGreaterThanOrEqual(0);
      expect(granted).toBeLessThan(frontier);

      fireEvent.keyDown(range, { key: "ArrowRight" });
      const after = cellTitles();

      expect(after[granted]).toMatch(/^MCP ·/);
      expect(after.slice(0, frontier)).toEqual(before.slice(0, frontier));
    });

    it("names the compaction in the header on the API Call that compacted", async () => {
      const range = await openStepped();

      fireEvent.change(range, { target: { value: "2" } });
      expect(screen.getByText("· compaction")).toBeDefined();

      fireEvent.keyDown(range, { key: "ArrowLeft" });
      expect(screen.queryByText("· compaction")).toBeNull();
    });
  });
});
