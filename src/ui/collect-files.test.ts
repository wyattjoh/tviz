import { describe, expect, it } from "vitest";
import {
  classifyEntry,
  collectDataTransferEntries,
  collectFileListEntries,
  partitionEntries,
} from "./collect-files.ts";
import { fileListOf } from "./test-dom.ts";

const jsonlFile = (name: string): File => new File(["{}\n"], name, { type: "application/jsonl" });

describe("classifyEntry", () => {
  it("classifies a top-level transcript", () => {
    expect(classifyEntry({ file: jsonlFile("session-a.jsonl"), path: "session-a.jsonl" })).toEqual({
      kind: "transcript",
      file: expect.any(File),
      path: "session-a.jsonl",
    });
  });

  it("classifies a Subagent Session sidecar by its enclosing directory", () => {
    const path = "project/session-a/subagents/agent-1.jsonl";
    expect(classifyEntry({ file: jsonlFile("agent-1.jsonl"), path })).toEqual({
      kind: "subagent",
      parentId: "session-a",
      sidecarId: "subagents/agent-1.jsonl",
    });
  });

  it("gives the same sidecarId regardless of how much ancestor path precedes it", () => {
    // The same sidecar, dropped once as part of the whole project folder and
    // once as part of just the Session's own folder, carries a different
    // `path` (a different amount of the drop's root survives) but the same
    // `sidecarId` — what a caller dedupes repeat drops on.
    const viaProject = classifyEntry({
      file: jsonlFile("agent-1.jsonl"),
      path: "project/session-a/subagents/agent-1.jsonl",
    });
    const viaSessionFolder = classifyEntry({
      file: jsonlFile("agent-1.jsonl"),
      path: "session-a/subagents/agent-1.jsonl",
    });
    expect(viaProject.kind).toBe("subagent");
    expect(viaSessionFolder.kind).toBe("subagent");
    expect(viaProject).toEqual(viaSessionFolder);
  });

  it("ignores a subagents-rooted drop with no enclosing Session directory to attribute it to", () => {
    // Dragging the `subagents/` directory itself onto the page, rather than
    // the Session's folder or the project folder above it — `fullPath` then
    // starts at `subagents/`, with nothing ahead of it to read a parentId
    // from. It must not fall through to the transcript branch and be parsed
    // and listed as its own Session.
    const path = "subagents/agent-1.jsonl";
    expect(classifyEntry({ file: jsonlFile("agent-1.jsonl"), path })).toEqual({ kind: "ignored" });
  });

  it("ignores a Subagent Session's .meta.json sidecar", () => {
    const path = "project/session-a/subagents/agent-1.meta.json";
    expect(classifyEntry({ file: jsonlFile("agent-1.meta.json"), path })).toEqual({
      kind: "ignored",
    });
  });

  it("ignores tool-results contents regardless of extension", () => {
    const path = "project/session-a/tool-results/out.txt";
    expect(classifyEntry({ file: jsonlFile("out.txt"), path })).toEqual({ kind: "ignored" });
  });

  it("ignores a non-.jsonl file", () => {
    expect(classifyEntry({ file: jsonlFile("README.md"), path: "README.md" })).toEqual({
      kind: "ignored",
    });
  });
});

describe("partitionEntries", () => {
  it("separates transcripts from Subagent Session counts and drops everything else", () => {
    const partition = partitionEntries([
      { file: jsonlFile("session-a.jsonl"), path: "project/session-a.jsonl" },
      { file: jsonlFile("agent-1.jsonl"), path: "project/session-a/subagents/agent-1.jsonl" },
      { file: jsonlFile("agent-2.jsonl"), path: "project/session-a/subagents/agent-2.jsonl" },
      {
        file: jsonlFile("agent-1.meta.json"),
        path: "project/session-a/subagents/agent-1.meta.json",
      },
      { file: jsonlFile("out.txt"), path: "project/session-a/tool-results/out.txt" },
      { file: jsonlFile("session-b.jsonl"), path: "project/session-b.jsonl" },
    ]);

    expect(partition.transcripts.map((entry) => entry.path)).toEqual([
      "project/session-a.jsonl",
      "project/session-b.jsonl",
    ]);
    expect(partition.subagentPaths).toEqual(
      new Map([["session-a", new Set(["subagents/agent-1.jsonl", "subagents/agent-2.jsonl"])]]),
    );
  });

  it("dedupes a sidecar seen twice in the same batch by its sidecarId, not its path", () => {
    // The same file appearing under two different roots in one batch — a
    // project folder and, nested inside it, the Session's own folder dropped
    // a second time alongside it — must count once.
    const partition = partitionEntries([
      { file: jsonlFile("agent-1.jsonl"), path: "project/session-a/subagents/agent-1.jsonl" },
      { file: jsonlFile("agent-1.jsonl"), path: "session-a/subagents/agent-1.jsonl" },
    ]);

    expect(partition.subagentPaths).toEqual(
      new Map([["session-a", new Set(["subagents/agent-1.jsonl"])]]),
    );
  });
});

describe("collectFileListEntries", () => {
  it("uses webkitRelativePath when a folder picker set one", () => {
    const file = jsonlFile("session-a.jsonl");
    Object.defineProperty(file, "webkitRelativePath", { value: "project/session-a.jsonl" });

    expect(collectFileListEntries(fileListOf(file))).toEqual([
      { file, path: "project/session-a.jsonl" },
    ]);
  });

  it("falls back to the file name for a flat file picker", () => {
    const file = jsonlFile("session-a.jsonl");

    expect(collectFileListEntries(fileListOf(file))).toEqual([{ file, path: "session-a.jsonl" }]);
  });

  it("returns nothing for a null FileList", () => {
    expect(collectFileListEntries(null)).toEqual([]);
  });
});

describe("collectDataTransferEntries", () => {
  it("falls back to the flat files list when the entries API is unavailable", async () => {
    const file = jsonlFile("session-a.jsonl");
    const dataTransfer = { files: fileListOf(file) } as unknown as DataTransfer;

    expect(await collectDataTransferEntries(dataTransfer)).toEqual([
      { file, path: "session-a.jsonl" },
    ]);
  });

  it("recurses into a dropped directory through the entries API", async () => {
    const childFile = jsonlFile("session-a.jsonl");
    const fileEntry = {
      isFile: true,
      isDirectory: false,
      fullPath: "/project/session-a.jsonl",
      file: (success: (file: File) => void) => success(childFile),
    };
    let read = false;
    const dirEntry = {
      isFile: false,
      isDirectory: true,
      fullPath: "/project",
      createReader: () => ({
        readEntries: (success: (entries: readonly unknown[]) => void) => {
          if (read) {
            success([]);
            return;
          }
          read = true;
          success([fileEntry]);
        },
      }),
    };
    const item = { webkitGetAsEntry: () => dirEntry };
    const items = {
      length: 1,
      [Symbol.iterator]: () => [item][Symbol.iterator](),
    } as unknown as DataTransferItemList;
    const dataTransfer = { items, files: fileListOf() } as unknown as DataTransfer;

    expect(await collectDataTransferEntries(dataTransfer)).toEqual([
      { file: childFile, path: "project/session-a.jsonl" },
    ]);
  });
});
