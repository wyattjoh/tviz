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
 * smaller than one Cell.
 */
const transcript = (): string =>
  Fixture.toJsonl([
    Fixture.skillListing(9_000),
    Fixture.agentListing(1_500),
    Fixture.nestedMemory(3_000),
    Fixture.mcpInstructions(700),
    Fixture.userMessage(2_000),
    Fixture.assistantMessage({
      id: "m1",
      usage: { cacheRead: 30_000 },
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

const openFileMenu = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "file" }));
};

const clickMenuItem = (name: string): void => {
  fireEvent.click(screen.getByRole("menuitem", { name }));
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

  it("gives every Category the legend lists at least one Cell", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    for (const label of ["System", "Custom agents", "Memory files", "Skills", "MCP", "Messages"]) {
      expect
        .soft(
          cellTitles().some((title) => title.startsWith(`${label} ·`)),
          `${label} has no Cell in the grid`,
        )
        .toBe(true);
    }
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

  it("returns to the drop zone when the File menu closes every Session", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    openFileMenu();
    clickMenuItem("close all sessions");

    expect(screen.getByText("drop a .jsonl transcript")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });
});

const closeAllSessionsItem = (): HTMLElement =>
  screen.getByRole("menuitem", { name: "close all sessions" });

describe("File menu", () => {
  it("offers no way to close Sessions until one is open", async () => {
    render(<App />);

    openFileMenu();
    expect(closeAllSessionsItem().hasAttribute("disabled")).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });

    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    openFileMenu();
    expect(closeAllSessionsItem().hasAttribute("disabled")).toBe(false);
  });

  it("closes on Escape", () => {
    render(<App />);

    openFileMenu();
    expect(screen.getByRole("menu", { name: "File" })).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes on a click outside it", () => {
    render(<App />);

    openFileMenu();
    fireEvent.mouseDown(screen.getByText("drop a .jsonl transcript"));

    expect(screen.queryByRole("menu")).toBeNull();
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

const loadDemoFromFileMenu = (): void => {
  openFileMenu();
  clickMenuItem("load demo sessions");
};

describe("App demo mode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists the Demo Sessions and shows the medium one when the demo is loaded", async () => {
    stubDemoFetch();
    render(<App />);

    loadDemo();
    await screen.findByRole("img");

    const list = screen.getByRole("navigation", { name: "Sessions" });
    const rows = Array.from(list.querySelectorAll("button"));
    expect(rows.map((row) => row.textContent?.startsWith("Small session"))).toEqual([
      true,
      false,
      false,
    ]);
    expect(rows).toHaveLength(3);

    // The manifest asks for the medium Session, which is neither first nor last.
    const selected = rows.filter((row) => row.getAttribute("aria-current") === "true");
    expect(selected).toHaveLength(1);
    expect(selected[0]?.textContent).toContain("Medium session");
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Context grid: 60.0k of 200.0k tokens used",
    );
  });

  it("marks Demo Sessions as synthetic and shows the manifest's own note", async () => {
    stubDemoFetch();
    render(<App />);

    loadDemo();
    await screen.findByRole("img");

    expect(screen.getAllByText("synthetic demo")).toHaveLength(3);
    expect(screen.getByText("Every Category is present.")).toBeDefined();
    // The statement under the grid is the manifest's `note`, not a copy of it
    // in a component: change the manifest and the app says something else.
    expect(screen.getByText(DEMO_MANIFEST.note)).toBeDefined();
  });

  it("shows no synthetic-data note for a Session the user supplied", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    expect(screen.queryByText(DEMO_MANIFEST.note)).toBeNull();
  });

  it("switches the grid to another Demo Session when it is selected", async () => {
    stubDemoFetch();
    render(<App />);

    loadDemo();
    await screen.findByRole("img");
    fireEvent.click(screen.getByText("Large session"));

    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Context grid: 90.0k of 1000.0k tokens used",
    );
  });

  it("reaches the demo from the File menu of a loaded Session", async () => {
    stubDemoFetch();
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    loadDemoFromFileMenu();
    await screen.findByRole("navigation", { name: "Sessions" });

    expect(screen.queryByText("session-a.jsonl")).toBeNull();
    expect(screen.getByText("Medium session")).toBeDefined();
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
    await screen.findByRole("img");

    loadDemoFromFileMenu();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("demo manifest is unusable");
    // A dropped transcript exists only in this tab: a failed demo fetch must
    // not be what throws it away.
    expect(screen.getByText("session-a.jsonl")).toBeDefined();
    expect(screen.getByRole("img")).toBeDefined();
    expect(screen.queryByText("drop a .jsonl transcript")).toBeNull();
  });
});
