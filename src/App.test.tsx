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

  it("returns to the drop zone when the Session is cleared", async () => {
    render(<App />);
    drop(transcriptFile("session-a.jsonl", transcript()));
    await screen.findByRole("img");

    fireEvent.click(screen.getByRole("button", { name: "clear" }));

    expect(screen.getByText("drop a .jsonl transcript")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
