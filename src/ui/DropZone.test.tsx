// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
  it("hands a dropped transcript to its caller", () => {
    const onFile = vi.fn();
    render(<DropZone onFile={onFile} onLoadDemo={vi.fn()} parsing={undefined} error={undefined} />);

    const file = transcriptFile("session-a.jsonl", "{}\n");
    fireEvent.drop(dropTarget(), { dataTransfer: { files: fileListOf(file) } });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("hands a picked transcript to its caller", () => {
    const onFile = vi.fn();
    render(<DropZone onFile={onFile} onLoadDemo={vi.fn()} parsing={undefined} error={undefined} />);

    const file = transcriptFile("session-b.jsonl", "{}\n");
    fireEvent.change(screen.getByLabelText("choose a transcript"), {
      target: { files: fileListOf(file) },
    });

    expect(onFile).toHaveBeenCalledWith(file);
  });

  it("names the file it is parsing", () => {
    render(
      <DropZone
        onFile={vi.fn()}
        onLoadDemo={vi.fn()}
        parsing="session-c.jsonl"
        error={undefined}
      />,
    );

    expect(screen.getByText(/parsing session-c\.jsonl/)).toBeDefined();
  });

  it("announces a load failure in an alert", () => {
    render(
      <DropZone
        onFile={vi.fn()}
        onLoadDemo={vi.fn()}
        parsing={undefined}
        error="empty.jsonl is empty."
      />,
    );

    expect(screen.getByRole("alert").textContent).toBe("empty.jsonl is empty.");
  });

  it("shows no alert when nothing has failed", () => {
    render(
      <DropZone onFile={vi.fn()} onLoadDemo={vi.fn()} parsing={undefined} error={undefined} />,
    );

    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("asks for the Demo Sessions when the demo button is pressed", () => {
    const onLoadDemo = vi.fn();
    render(
      <DropZone onFile={vi.fn()} onLoadDemo={onLoadDemo} parsing={undefined} error={undefined} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "load demo sessions" }));

    expect(onLoadDemo).toHaveBeenCalledTimes(1);
  });

  it("does not offer the Demo Sessions while something is loading", () => {
    render(
      <DropZone onFile={vi.fn()} onLoadDemo={vi.fn()} parsing="small.jsonl" error={undefined} />,
    );

    expect(
      screen.getByRole("button", { name: "load demo sessions" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  // Both notes are acceptance criteria: the privacy promise and the statement
  // that the Demo Sessions are synthetic.
  it("states that transcripts stay in the tab and that the demo data is synthetic", () => {
    render(
      <DropZone onFile={vi.fn()} onLoadDemo={vi.fn()} parsing={undefined} error={undefined} />,
    );

    expect(screen.getByText(/nothing is uploaded, nothing is stored/)).toBeDefined();
    expect(screen.getByText(/demo sessions are synthetic/)).toBeDefined();
  });
});
