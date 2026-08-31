// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/**
 * Drops several files (and, with a `path`, whole folders) in one gesture, the
 * way a folder drag delivers every entry at once. jsdom's `DataTransfer` has
 * no entries API, so a file's folder-relative path is carried the same way a
 * `webkitdirectory` picker carries it: `webkitRelativePath`.
 */
const dropMany = (entries: readonly { readonly file: File; readonly path?: string }[]): void => {
  for (const entry of entries) {
    if (entry.path !== undefined) {
      Object.defineProperty(entry.file, "webkitRelativePath", { value: entry.path });
    }
  }
  const target = screen.getByText("drop a .jsonl transcript").closest("section");
  if (target === null) throw new Error("the drop zone has no drop target");
  fireEvent.drop(target, {
    dataTransfer: { files: fileListOf(...entries.map((entry) => entry.file)) },
  });
};

/**
 * Drops several files (and, with a `path`, whole folders) onto the *loaded*
 * Workbench rather than the empty state's drop zone — the loaded Workbench
 * is a drop target of its own once a Session is open (`App.tsx`'s root),
 * which is exactly what a second folder drop lands on.
 */
const dropManyOntoWorkbench = (
  entries: readonly { readonly file: File; readonly path?: string }[],
): void => {
  for (const entry of entries) {
    if (entry.path !== undefined) {
      Object.defineProperty(entry.file, "webkitRelativePath", { value: entry.path });
    }
  }
  const workbench = screen.getByRole("banner", { name: "tviz" }).closest("div");
  if (workbench === null) throw new Error("the Workbench has no root element");
  fireEvent.drop(workbench, {
    dataTransfer: { files: fileListOf(...entries.map((entry) => entry.file)) },
  });
};

/**
 * The grid block, which is a group rather than an image now that its Cells are
 * buttons that can be hovered, focused and pinned.
 */
const contextGrid = (): HTMLElement => screen.getByRole("group", { name: /^Context grid/ });

const findContextGrid = (): Promise<HTMLElement> =>
  screen.findByRole("group", { name: /^Context grid/ });

const queryContextGrid = (): HTMLElement | null =>
  screen.queryByRole("group", { name: /^Context grid/ });

const cellTitles = (): readonly string[] =>
  Array.from(contextGrid().children, (cell) => cell.getAttribute("title") ?? "");

const cellAt = (index: number): HTMLElement => {
  const cell = contextGrid().children[index];
  if (!(cell instanceof HTMLElement)) throw new Error(`the grid has no Cell ${index}`);
  return cell;
};

const cellFill = (index: number): string =>
  cellAt(index)
    .className.split(" ")
    .find((name) => name.startsWith("bg-")) ?? "(none)";

describe("App", () => {
  it("renders the grid and legend for the last API Call of a dropped transcript", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));

    const grid = await findContextGrid();
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
    await findContextGrid();

    // 1 — menu bar, with the File menu Sessions will be opened from.
    const menuBar = screen.getByRole("banner", { name: "tviz" });
    expect(menuBar.contains(screen.getByRole("button", { name: "File" }))).toBe(true);

    // 2 — Session strip: which Session and which API Call. How full the window
    // is moved to the rail, so the strip stays one line on a narrow window.
    const strip = screen.getByRole("region", { name: "Session" });
    expect(strip.contains(screen.getByText("session-a.jsonl"))).toBe(true);
    expect(strip.contains(screen.getByRole("button", { name: "close" }))).toBe(true);
    expect(strip.textContent).not.toContain("tokens");

    // 3 — grid pane on the flexible left, scrolling under its own column count.
    const grid = contextGrid();
    const pane = screen.getByRole("main", { name: "Context grid" });
    expect(pane.contains(grid)).toBe(true);
    expect(grid.parentElement?.className).toContain("overflow-auto");

    // 4 — the fixed 340px right rail, holding the legend and the docked
    // Inspector panel the Inspector work fills.
    const rail = screen.getByRole("complementary", { name: "Legend and Inspector" });
    expect(rail.contains(screen.getByText("Free space"))).toBe(true);
    expect(rail.contains(screen.getByText("Inspector"))).toBe(true);
    // The fill meter and the Context Window override live under the legend,
    // whose Free space line is the other half of the same number.
    expect(rail.contains(screen.getByText(/45\.0k \/ 200\.0k tokens/))).toBe(true);
    expect(rail.contains(screen.getByRole("group", { name: "Context Window" }))).toBe(true);
    expect(pane.parentElement?.className).toContain("grid-cols-[minmax(0,1fr)_340px]");

    // 5 — the Scrubber across the bottom.
    const scrubber = screen.getByRole("region", { name: "Scrubber" });
    expect(scrubber.contains(screen.getByLabelText("API call"))).toBe(true);
  });

  it("opens and closes the File menu the Session list will fill", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await findContextGrid();

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
    await findContextGrid();

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
    await findContextGrid();

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
    await findContextGrid();

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
    await findContextGrid();

    expect(screen.queryByText(/subagent sessions/)).toBeNull();
  });

  it("shows the parser's message in an alert when the file is empty", async () => {
    render(<App />);
    drop(transcriptFile("empty.jsonl", "   \n\n"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("empty.jsonl is empty.");
    expect(queryContextGrid()).toBeNull();
  });

  it("shows the parser's message in an alert when a .jsonl file has no API Calls", async () => {
    render(<App />);
    drop(transcriptFile("notes.jsonl", '{"type":"local_command"}\n'));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("notes.jsonl is not a Claude Code transcript");
  });

  it("ignores a non-.jsonl file silently rather than surfacing an error", async () => {
    render(<App />);
    drop(transcriptFile("notes.txt", "hello, this is not a transcript\n"));

    // Nothing async is left in flight for an ignored file — flush the drop's
    // microtask so a false negative can't hide a bug that fires later.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.queryByRole("alert")).toBeNull();
    expect(queryContextGrid()).toBeNull();
  });

  it("returns to the drop zone when the only open Session is closed", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await findContextGrid();

    fireEvent.click(screen.getByRole("button", { name: "close" }));

    expect(screen.getByText("drop a .jsonl transcript")).toBeDefined();
    expect(queryContextGrid()).toBeNull();
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
      await findContextGrid();
      return screen.getByLabelText("API call") as HTMLInputElement;
    };

    const gridLabel = (): string => contextGrid().getAttribute("aria-label") ?? "";

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
      await findContextGrid();

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

  describe("filtering the grid from the legend", () => {
    const open = async (): Promise<HTMLElement> => {
      render(<App />);
      drop(transcriptFile("session-a.jsonl", transcript()));
      await findContextGrid();
      return screen.getByRole("complementary", { name: "Legend and Inspector" });
    };

    /**
     * A legend filter row, looked up inside the rail: a Cell's accessible name
     * starts with its Category too, so the whole document is ambiguous.
     */
    const row = (rail: HTMLElement, name: RegExp): HTMLElement =>
      within(rail).getByRole("button", { name });

    const firstCellOf = (label: string): number =>
      cellTitles().findIndex((title) => title.startsWith(`${label} ·`));

    /**
     * The last Cell anything reaches into. In this fixture that is the tool
     * result: it entered the context last and is the largest item in it.
     */
    const lastFilledCell = (): number =>
      cellTitles().findIndex((title) => title.startsWith("Free ·")) - 1;

    it("blanks a Category's Cells in place, moving no Cell and changing no total", async () => {
      const rail = await open();
      const before = cellTitles();
      const skills = firstCellOf("Skills");
      const legendBefore = row(rail, /^Skills/).textContent;
      expect(skills).toBeGreaterThanOrEqual(0);
      expect(cellFill(skills)).toBe("bg-cat-skills");

      fireEvent.click(row(rail, /^Skills/));

      expect(cellFill(skills)).toBe("bg-cell-hidden");
      // Every Cell still covers the token range it covered, so the proportions
      // are still read against the whole window (ADR-0006).
      expect(cellTitles().map((title) => title.replace(" · hidden", ""))).toEqual(before);
      expect(row(rail, /^Skills/).textContent).toBe(legendBefore);
      expect(row(rail, /^Skills/).getAttribute("aria-pressed")).toBe("false");

      fireEvent.click(row(rail, /^Skills/));
      expect(cellFill(skills)).toBe("bg-cat-skills");
    });

    it("blanks a Message Kind's Cells in place, leaving the Category and the totals alone", async () => {
      const rail = await open();
      const before = cellTitles();
      const toolResult = lastFilledCell();
      const legendBefore = row(rail, /^Tool result/).textContent;
      expect(cellTitles()[toolResult]).toContain("Tool result");
      expect(cellFill(toolResult)).toBe("bg-cat-messages");

      fireEvent.click(row(rail, /^Tool result/));

      expect(cellFill(toolResult)).toBe("bg-cell-hidden");
      expect(cellTitles().map((title) => title.replace(" · hidden", ""))).toEqual(before);
      expect(row(rail, /^Tool result/).textContent).toBe(legendBefore);
      // Hiding a Kind leaves the Messages Category itself shown.
      expect(row(rail, /^Messages/).getAttribute("aria-pressed")).toBe("true");
    });

    it("stops the Message Kind rows claiming to be shown once Messages is hidden", async () => {
      const rail = await open();
      const toolResult = lastFilledCell();
      expect(row(rail, /^Tool result/).getAttribute("aria-pressed")).toBe("true");

      fireEvent.click(row(rail, /^Messages/));

      // Every Messages Cell is blanked, so no Kind row may still say its Cells
      // are drawn — and none of them takes a click it could not act on.
      expect(cellFill(toolResult)).toBe("bg-cell-hidden");
      for (const kind of ["User", "Assistant", "Tool result", "Reminder"]) {
        const kindRow = row(rail, new RegExp(`^${kind}`));
        expect.soft(kindRow.getAttribute("aria-pressed")).toBe("false");
        expect.soft((kindRow as HTMLButtonElement).disabled).toBe(true);
      }

      // Showing Messages again hands the Kinds back exactly as they were.
      fireEvent.click(row(rail, /^Messages/));
      expect(row(rail, /^Tool result/).getAttribute("aria-pressed")).toBe("true");
      expect(cellFill(toolResult)).toBe("bg-cat-messages");
    });

    it("recolours Messages Cells with the Kind accents, leaving the Categories alone", async () => {
      await open();
      const toolResult = lastFilledCell();
      const skills = firstCellOf("Skills");
      expect(cellFill(toolResult)).toBe("bg-cat-messages");

      fireEvent.click(screen.getByLabelText("Colour Messages by kind"));

      expect(cellFill(toolResult)).toBe("bg-kind-tool-result");
      expect(cellTitles()[toolResult]).toContain("Messages · Tool result ·");
      expect(cellFill(skills)).toBe("bg-cat-skills");
    });

    it("says System is derived rather than logged", async () => {
      await open();
      expect(screen.getByText(/system prompt \+ built-in tools \+ root CLAUDE\.md/)).toBeDefined();
      expect(screen.getByText(/not logged; derived/)).toBeDefined();
    });
  });

  describe("inspecting a Cell in the right rail", () => {
    const open = async (): Promise<HTMLElement> => {
      render(<App />);
      drop(transcriptFile("session-a.jsonl", transcript()));
      await findContextGrid();
      return screen.getByRole("complementary", { name: "Legend and Inspector" });
    };

    const inspector = (): HTMLElement => {
      const panel = screen.getByRole("heading", { name: "Inspector" }).closest("section");
      if (panel === null) throw new Error("the Inspector has no panel");
      return panel;
    };

    it("reports an item's share of the hovered Cell, not the item's own size", async () => {
      await open();
      // A Cell well inside the tool result, which is far larger than the 1,000
      // tokens a Cell stands for: the Cell holds 1.0k of it, and the item's own
      // size is named as context rather than reported as the Cell's contents.
      const inside = cellTitles().findIndex((title) => title.startsWith("Free ·")) - 2;
      fireEvent.mouseOver(cellAt(inside));

      expect(inspector().textContent).toMatch(/Tool result1\.0kof \d+\.\dk/);
    });

    it("lists the items overlapping a hovered Cell", async () => {
      const rail = await open();
      expect(rail.textContent).toContain("Hover a Cell");

      const skills = cellTitles().findIndex((title) => title.startsWith("Skills ·"));
      fireEvent.mouseOver(cellAt(skills));

      expect(rail.textContent).toContain("Skills");
      expect(rail.textContent).toContain("Skill listing");
      expect(rail.textContent).toContain(`cell ${skills + 1}`);
    });

    it("calls an empty Cell free rather than listing items for it", async () => {
      const rail = await open();

      const free = cellTitles().findIndex((title) => title.startsWith("Free ·"));
      fireEvent.mouseOver(cellAt(free));

      expect(rail.textContent).toContain("free — nothing has reached this part");
    });

    it("pins a clicked Cell so its items survive the pointer leaving the grid", async () => {
      const rail = await open();
      const skills = cellTitles().findIndex((title) => title.startsWith("Skills ·"));

      fireEvent.click(cellAt(skills));
      fireEvent.mouseLeave(contextGrid());

      expect(rail.textContent).toContain("Skill listing");
      expect(rail.textContent).toContain("pinned");
      expect(cellAt(skills).getAttribute("aria-pressed")).toBe("true");

      // Clicking the pinned Cell again hands the rail back.
      fireEvent.click(cellAt(skills));
      fireEvent.mouseLeave(contextGrid());
      expect(rail.textContent).toContain("Hover a Cell");
    });
  });

  describe("folder drop, the Session list, and the Context Window override", () => {
    it("collects only .jsonl files from a multi-file drop, listing every Session in the File menu", async () => {
      render(<App />);
      Fixture.setFixtureSessionId("00000000-0000-4000-8000-0000000000a1");
      const fileA = transcriptFile("session-a.jsonl", transcript());
      Fixture.setFixtureSessionId("00000000-0000-4000-8000-0000000000a2");
      const fileB = transcriptFile("session-b.jsonl", transcript());
      Fixture.setFixtureSessionId(undefined);
      const notes = transcriptFile("README.md", "not a transcript at all\n");

      dropMany([{ file: fileA }, { file: fileB }, { file: notes }]);
      await findContextGrid();

      fireEvent.click(screen.getByRole("button", { name: "File" }));
      // The selected Session's file name is also in the Session strip behind
      // the menu, so the Session-list row is found by its button role.
      expect(screen.getByRole("button", { name: /session-a\.jsonl/ })).toBeDefined();
      expect(screen.getByRole("button", { name: /session-b\.jsonl/ })).toBeDefined();
      expect(screen.queryByText("README.md")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("counts Subagent Session sidecars on the parent Session; sidecars never appear as Sessions or errors", async () => {
      render(<App />);
      const parentId = "00000000-0000-4000-8000-0000000000b1";
      Fixture.setFixtureSessionId(parentId);
      const parent = transcriptFile(`${parentId}.jsonl`, transcript());
      const sidecarA = transcriptFile("agent-1.jsonl", transcript());
      const sidecarB = transcriptFile("agent-2.jsonl", transcript());
      const sidecarMeta = transcriptFile("agent-1.meta.json", "{}");
      const toolResult = transcriptFile("out.txt", "offloaded output\n");
      Fixture.setFixtureSessionId(undefined);

      dropMany([
        { file: parent, path: `project/${parentId}.jsonl` },
        { file: sidecarA, path: `project/${parentId}/subagents/agent-1.jsonl` },
        { file: sidecarB, path: `project/${parentId}/subagents/agent-2.jsonl` },
        { file: sidecarMeta, path: `project/${parentId}/subagents/agent-1.meta.json` },
        { file: toolResult, path: `project/${parentId}/tool-results/out.txt` },
      ]);
      await findContextGrid();

      expect(screen.getByText("2 subagent sessions")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "File" }));
      expect(screen.queryByText("agent-1.jsonl")).toBeNull();
      expect(screen.queryByText("agent-2.jsonl")).toBeNull();
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("switches the grid to a different Session from the File menu", async () => {
      render(<App />);
      Fixture.setFixtureSessionId("00000000-0000-4000-8000-0000000000c1");
      const fileA = transcriptFile("session-a.jsonl", transcript());
      Fixture.setFixtureSessionId("00000000-0000-4000-8000-0000000000c2");
      const fileB = transcriptFile("session-b.jsonl", transcript());
      Fixture.setFixtureSessionId(undefined);

      dropMany([{ file: fileA }, { file: fileB }]);
      await findContextGrid();

      const strip = screen.getByRole("region", { name: "Session" });
      expect(strip.textContent).toContain("session-a.jsonl");

      fireEvent.click(screen.getByRole("button", { name: "File" }));
      fireEvent.click(screen.getByText("session-b.jsonl"));

      expect(screen.getByRole("region", { name: "Session" }).textContent).toContain(
        "session-b.jsonl",
      );
    });

    it("closes only the Session on screen, leaving the rest open in the File menu", async () => {
      render(<App />);
      Fixture.setFixtureSessionId("00000000-0000-4000-8000-0000000000d1");
      const fileA = transcriptFile("session-a.jsonl", transcript());
      Fixture.setFixtureSessionId("00000000-0000-4000-8000-0000000000d2");
      const fileB = transcriptFile("session-b.jsonl", transcript());
      Fixture.setFixtureSessionId(undefined);

      dropMany([{ file: fileA }, { file: fileB }]);
      await findContextGrid();
      expect(screen.getByRole("region", { name: "Session" }).textContent).toContain(
        "session-a.jsonl",
      );

      fireEvent.click(screen.getByRole("button", { name: "close" }));

      // Still on the Workbench — session-b.jsonl took the vacated slot —
      // rather than dropped back to the empty state with an open Session
      // still parsed and waiting in the File menu.
      await findContextGrid();
      expect(screen.getByRole("region", { name: "Session" }).textContent).toContain(
        "session-b.jsonl",
      );

      fireEvent.click(screen.getByRole("button", { name: "File" }));
      expect(screen.queryByText("session-a.jsonl")).toBeNull();
      expect(screen.getByRole("button", { name: /session-b\.jsonl/ })).toBeDefined();
    });

    it("adds a second drop onto the loaded Workbench instead of losing it to the browser's default file-drop", async () => {
      render(<App />);
      Fixture.setFixtureSessionId("00000000-0000-4000-8000-0000000000e1");
      const fileA = transcriptFile("session-a.jsonl", transcript());
      Fixture.setFixtureSessionId("00000000-0000-4000-8000-0000000000e2");
      const fileB = transcriptFile("session-b.jsonl", transcript());
      Fixture.setFixtureSessionId(undefined);

      drop(fileA);
      await findContextGrid();

      // The drop target this time is the loaded Workbench itself, not the
      // (now unmounted) empty-state drop zone.
      dropManyOntoWorkbench([{ file: fileB }]);

      fireEvent.click(screen.getByRole("button", { name: "File" }));
      expect(screen.getByRole("button", { name: /session-a\.jsonl/ })).toBeDefined();
      // Collecting the drop's entries is async even for a flat file list, so
      // the second row arrives a tick after the drop event itself.
      expect(await screen.findByRole("button", { name: /session-b\.jsonl/ })).toBeDefined();
    });

    it("counts a Subagent Session sidecar once even when the same folder is dropped twice", async () => {
      render(<App />);
      const parentId = "00000000-0000-4000-8000-0000000000f1";
      Fixture.setFixtureSessionId(parentId);
      const parent = transcriptFile(`${parentId}.jsonl`, transcript());
      const sidecarA = transcriptFile("agent-1.jsonl", transcript());
      const sidecarB = transcriptFile("agent-2.jsonl", transcript());
      Fixture.setFixtureSessionId(undefined);

      const entries = [
        { file: parent, path: `project/${parentId}.jsonl` },
        { file: sidecarA, path: `project/${parentId}/subagents/agent-1.jsonl` },
        { file: sidecarB, path: `project/${parentId}/subagents/agent-2.jsonl` },
      ];
      dropMany(entries);
      await findContextGrid();
      expect(await screen.findByText("2 subagent sessions")).toBeDefined();

      // The same folder, dropped again — a real folder drop the user repeats
      // rather than a new one, this time landing on the loaded Workbench
      // instead of the (now unmounted) empty-state drop zone — must not add
      // to the count a second time.
      dropManyOntoWorkbench(entries);
      await waitFor(() => expect(screen.getByText("2 subagent sessions")).toBeDefined());
      expect(screen.queryByText("4 subagent sessions")).toBeNull();
    });

    it("changes the grid denominator and the legend percentages immediately on a Context Window override", async () => {
      render(<App />);
      drop(transcriptFile("session-a.jsonl", transcript()));
      await findContextGrid();

      expect(contextGrid().getAttribute("aria-label")).toBe(
        "Context grid: 45.0k of 200.0k tokens used",
      );

      fireEvent.click(screen.getByRole("button", { name: "1000.0k" }));

      expect(contextGrid().getAttribute("aria-label")).toBe(
        "Context grid: 45.0k of 1000.0k tokens used",
      );
      expect(screen.getByText(/45\.0k \/ 1000\.0k tokens/)).toBeDefined();
      // The legend's free-space line is the overridden window minus the total.
      expect(screen.getByText("955.0k")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "auto" }));
      expect(contextGrid().getAttribute("aria-label")).toBe(
        "Context grid: 45.0k of 200.0k tokens used",
      );
    });

    it("shows a progress indicator while a file is still parsing, per file rather than globally", async () => {
      render(<App />);
      const fileA = transcriptFile("session-a.jsonl", transcript());
      const stuck = transcriptFile("session-b.jsonl", transcript());
      // Never resolves, so `session-b.jsonl` stays "pending" for the rest of
      // the test — lets the progress indicator be asserted deterministically
      // rather than racing the mocked parse's own microtask queue.
      stuck.text = () => new Promise<string>(() => {});

      dropMany([{ file: fileA }, { file: stuck }]);
      await findContextGrid();

      fireEvent.click(screen.getByRole("button", { name: "File" }));
      // Scoped to the menu's own row: the always-mounted live region
      // (`[aria-live]`, covered in `MenuBar.test.tsx`) says the same thing.
      expect(screen.getByText(/parsing 1 file/, { selector: "div" })).toBeDefined();
    });

    it("surfaces a failure for one file without blocking the rest, per file rather than globally", async () => {
      render(<App />);
      const good = transcriptFile("good.jsonl", transcript());
      const bad = transcriptFile("bad.jsonl", "   \n\n");

      dropMany([{ file: good }, { file: bad }]);
      await findContextGrid();

      // The good file still loaded and is on screen despite the other failing.
      expect(screen.getByRole("region", { name: "Session" }).textContent).toContain("good.jsonl");

      // Once a Session is loaded, per-file failures surface from the File
      // menu rather than the (now unmounted) empty-state drop zone.
      fireEvent.click(screen.getByRole("button", { name: "File" }));
      const alert = await screen.findByRole("alert");
      expect(alert.textContent).toBe("bad.jsonl");
    });
  });
});

const DEMO_MANIFEST = {
  note: "Demo Sessions are synthetic.",
  defaultSessionId: "medium",
  sessions: [
    {
      id: "small",
      file: "small.jsonl",
      name: "Small session",
      description: "The smallest shape the grid can show.",
      bytes: 100,
      calls: 1,
      model: "claude-opus-4-7",
      claudeCodeVersion: "2.1.247",
    },
    {
      id: "medium",
      file: "medium.jsonl",
      name: "Medium session",
      description: "Every Category is present.",
      bytes: 200,
      calls: 1,
      model: "claude-opus-4-8",
      claudeCodeVersion: "2.1.209",
    },
    {
      id: "large",
      file: "large.jsonl",
      name: "Large session",
      description: "One compaction part-way through.",
      bytes: 300,
      calls: 1,
      model: "claude-fable-5",
      claudeCodeVersion: "2.1.217",
    },
  ],
};

const DEMO_SHAPES: Readonly<Record<string, { readonly tokens: number; readonly model: string }>> = {
  "small.jsonl": { tokens: 20_000, model: "claude-opus-4-7" },
  "medium.jsonl": { tokens: 60_000, model: "claude-opus-4-8" },
  // A Claude 5 model, so this Demo Session is the one on a 1M window.
  "large.jsonl": { tokens: 90_000, model: "claude-fable-5" },
};

const demoTranscript = (file: string): string => {
  const shape = DEMO_SHAPES[file] ?? { tokens: 0, model: "claude-opus-4-7" };
  Fixture.resetFixtureSequence();
  return Fixture.toJsonl([
    Fixture.skillListing(4_000),
    Fixture.assistantMessage({
      id: file,
      model: shape.model,
      usage: { cacheRead: shape.tokens },
    }),
  ]).replaceAll(/"sessionId":"[^"]+"/g, `"sessionId":"${file.replace(".jsonl", "")}-id"`);
};

const stubDemoFetch = (manifestBody: unknown = DEMO_MANIFEST): void => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const file = url.slice(url.lastIndexOf("/") + 1);
      if (file === "manifest.json") {
        return { ok: true, status: 200, json: async () => manifestBody } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        blob: async () => new Blob([demoTranscript(file)], { type: "application/jsonl" }),
      } as unknown as Response;
    }),
  );
};

/**
 * The empty state's own button. The File menu is the other entry point, and
 * the only one once a Session is open.
 */
const loadDemo = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "load demo sessions" }));
};

const openFileMenu = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "File" }));
};

const loadDemoFromFileMenu = (): void => {
  openFileMenu();
  fireEvent.click(screen.getByRole("button", { name: "Load demo sessions" }));
};

/**
 * The Session rows of the File menu, which is where the Workbench lists open
 * Sessions instead of a sidebar.
 */
const sessionMenuRows = (): readonly HTMLElement[] => {
  // The dropdown has no role of its own, so it is reached through the heading
  // that only ever exists inside it.
  const panel = screen.getByText("Open sessions").parentElement;
  if (panel === null) throw new Error("the File menu has no panel");
  return within(panel)
    .getAllByRole("button")
    .filter((button) => button.getAttribute("aria-pressed") !== null);
};

describe("App demo mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the Demo Sessions in the File menu and shows the medium one", async () => {
    stubDemoFetch();
    render(<App />);

    loadDemo();
    await findContextGrid();

    openFileMenu();
    const rows = sessionMenuRows();
    expect(rows).toHaveLength(3);
    expect(rows.map((row) => row.textContent?.startsWith("Small session"))).toEqual([
      true,
      false,
      false,
    ]);

    // The manifest asks for the medium Session, which is neither first nor last.
    const selected = rows.filter((row) => row.getAttribute("aria-pressed") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain("Medium session");
    expect(contextGrid().getAttribute("aria-label")).toBe(
      "Context grid: 60.0k of 200.0k tokens used",
    );
  });

  it("marks Demo Sessions as synthetic and shows the manifest's own note", async () => {
    stubDemoFetch();
    render(<App />);

    loadDemo();
    await findContextGrid();

    // The statement in the rail is the manifest's `note`, not a copy of it in
    // a component: change the manifest and the app says something else.
    expect(screen.getByText(DEMO_MANIFEST.note)).toBeDefined();

    openFileMenu();
    expect(sessionMenuRows().every((row) => row.textContent?.includes("(demo)"))).toBe(true);
  });

  it("shows no synthetic-data note for a Session the user supplied", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await findContextGrid();

    expect(screen.queryByText(DEMO_MANIFEST.note)).toBeNull();
  });

  it("switches the grid to another Demo Session when it is selected", async () => {
    stubDemoFetch();
    render(<App />);

    loadDemo();
    await findContextGrid();

    openFileMenu();
    fireEvent.click(screen.getByRole("button", { name: /^Large session \(demo\)/ }));

    expect(contextGrid().getAttribute("aria-label")).toBe(
      "Context grid: 90.0k of 1000.0k tokens used",
    );
  });

  it("reaches the demo from the File menu of a loaded Session", async () => {
    stubDemoFetch();
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await findContextGrid();

    loadDemoFromFileMenu();
    await screen.findByText(DEMO_MANIFEST.note);

    // The dropped Session stays open beside the Demo Sessions; the demo does
    // not replace what the user loaded.
    openFileMenu();
    expect(sessionMenuRows()).toHaveLength(4);
    expect(screen.getByRole("region", { name: "Session" }).textContent).toContain("medium.jsonl");
  });

  it("keeps the reviewer on the empty state with an alert when the demo cannot load", async () => {
    stubDemoFetch({ note: "incomplete" });
    render(<App />);

    loadDemo();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("demo manifest is unusable");
    expect(screen.getByText("drop a .jsonl transcript")).toBeDefined();
  });

  it("keeps the open Session when the demo fails to load", async () => {
    stubDemoFetch({ note: "incomplete" });
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await findContextGrid();

    loadDemoFromFileMenu();
    await waitFor(() => {
      expect(screen.queryByText(DEMO_MANIFEST.note)).toBeNull();
    });

    // A dropped transcript exists only in this tab: a failed demo fetch must
    // not be what throws it away.
    expect(screen.getByRole("region", { name: "Session" }).textContent).toContain(
      "session-a.jsonl",
    );
    expect(queryContextGrid()).not.toBeNull();
    expect(screen.queryByText("drop a .jsonl transcript")).toBeNull();
  });
});
