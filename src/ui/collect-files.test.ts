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
    });
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
    expect(partition.subagentCounts).toEqual(new Map([["session-a", 2]]));
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
