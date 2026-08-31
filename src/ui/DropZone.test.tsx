// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DropZone } from "./DropZone.tsx";
import { fileListOf, transcriptFile } from "./test-dom.ts";

afterEach(cleanup);

const dropTarget = (): HTMLElement => {
  const target = screen.getByText("drop a .jsonl transcript").closest("section");
  if (target === null) throw new Error("the drop zone has no drop target");
  return target;
};

describe("DropZone", () => {
  it("hands a dropped transcript to its caller", async () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} pending={[]} errors={[]} />);

    const file = transcriptFile("session-a.jsonl", "{}\n");
    fireEvent.drop(dropTarget(), { dataTransfer: { files: fileListOf(file) } });

    // Collecting a drop's entries is async even for a flat file list, so the
    // recursive-folder walk always goes through one code path.
    await waitFor(() => expect(onFiles).toHaveBeenCalledWith([{ file, path: "session-a.jsonl" }]));
  });

  it("hands every picked transcript to its caller", () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} pending={[]} errors={[]} />);

    const fileA = transcriptFile("session-a.jsonl", "{}\n");
    const fileB = transcriptFile("session-b.jsonl", "{}\n");
    fireEvent.change(screen.getByLabelText("choose files"), {
      target: { files: fileListOf(fileA, fileB) },
    });

    expect(onFiles).toHaveBeenCalledWith([
      { file: fileA, path: "session-a.jsonl" },
      { file: fileB, path: "session-b.jsonl" },
    ]);
  });

  it("hands every folder-picked transcript to its caller, path included", () => {
    const onFiles = vi.fn();
    render(<DropZone onFiles={onFiles} pending={[]} errors={[]} />);

    const file = transcriptFile("session-a.jsonl", "{}\n");
    Object.defineProperty(file, "webkitRelativePath", { value: "project/session-a.jsonl" });
    fireEvent.change(screen.getByLabelText("choose a folder"), {
      target: { files: fileListOf(file) },
    });

    expect(onFiles).toHaveBeenCalledWith([{ file, path: "project/session-a.jsonl" }]);
  });

  it("names the single file it is parsing", () => {
    render(
      <DropZone
        onFiles={vi.fn()}
        pending={[{ id: "1", path: "session-c.jsonl", fileName: "session-c.jsonl" }]}
        errors={[]}
      />,
    );

    expect(screen.getByText(/parsing session-c\.jsonl/)).toBeDefined();
  });

  it("counts several files parsing at once", () => {
    render(
      <DropZone
        onFiles={vi.fn()}
        pending={[
          { id: "1", path: "a.jsonl", fileName: "a.jsonl" },
          { id: "2", path: "b.jsonl", fileName: "b.jsonl" },
        ]}
        errors={[]}
      />,
    );

    expect(screen.getByText(/parsing 2 files/)).toBeDefined();
  });

  it("announces each load failure in its own alert", () => {
    render(
      <DropZone
        onFiles={vi.fn()}
        pending={[]}
        errors={[
          {
            id: "1",
            path: "empty.jsonl",
            fileName: "empty.jsonl",
            message: "empty.jsonl is empty.",
          },
          {
            id: "2",
            path: "notes.txt",
            fileName: "notes.txt",
            message:
              "notes.txt is not a Claude Code transcript: no API calls found in 0 record(s), 0 malformed line(s).",
          },
        ]}
      />,
    );

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(alerts[0]?.textContent).toBe("empty.jsonl is empty.");
  });

  it("shows no alert when nothing has failed", () => {
    render(<DropZone onFiles={vi.fn()} pending={[]} errors={[]} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
