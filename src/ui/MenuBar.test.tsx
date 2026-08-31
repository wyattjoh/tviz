// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ContextSnapshot,
  emptyCategoryTokens,
  emptyMessageKindTokens,
  type Session,
} from "../domain/context.ts";
import { fileListOf, transcriptFile } from "./test-dom.ts";
import { MenuBar, type MenuBarProps } from "./MenuBar.tsx";

afterEach(cleanup);

const call = (measuredTotal: number): ContextSnapshot => ({
  index: 0,
  timestamp: undefined,
  model: undefined,
  measuredTotal,
  byCategory: emptyCategoryTokens(),
  byKind: emptyMessageKindTokens(),
  added: [],
  reset: false,
});

const session = (id: string, fileName: string, peak: number): Session => ({
  id,
  fileName,
  model: "claude-sonnet-5",
  claudeCodeVersion: "2.1.251",
  windowSize: 200_000,
  calls: [call(peak)],
  recordCount: 10,
  malformedLines: 0,
  unknownRecordTypes: {},
  subagentCount: undefined,
});

const baseProps = (overrides: Partial<MenuBarProps> = {}): MenuBarProps => ({
  sessions: [],
  selectedId: undefined,
  pending: [],
  errors: [],
  onFiles: vi.fn(),
  onSelectSession: vi.fn(),
  onCloseAll: vi.fn(),
  ...overrides,
});

const openMenu = (): HTMLElement => {
  const button = screen.getByRole("button", { name: "File" });
  fireEvent.click(button);
  return button;
};

describe("MenuBar", () => {
  it("opens the File menu and closes it on Escape", () => {
    render(<MenuBar {...baseProps()} />);

    const button = openMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Open files…")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("closes on a click outside the menu", () => {
    render(
      <div>
        <MenuBar {...baseProps()} />
        <div data-testid="outside" />
      </div>,
    );

    const button = openMenu();
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("lists every open Session with its call count and peak, checking the selected one", () => {
    const sessions = [
      session("s1", "session-a.jsonl", 45_000),
      session("s2", "session-b.jsonl", 9_000),
    ];
    render(<MenuBar {...baseProps({ sessions, selectedId: "s2" })} />);

    openMenu();

    const rowA = screen.getByText("session-a.jsonl").closest("button");
    const rowB = screen.getByText("session-b.jsonl").closest("button");
    expect(rowA?.textContent).toContain("1 · 45.0k");
    expect(rowB?.getAttribute("aria-pressed")).toBe("true");
    expect(rowA?.getAttribute("aria-pressed")).toBe("false");
  });

  it("switches the selected Session and closes the menu", () => {
    const onSelectSession = vi.fn();
    const sessions = [session("s1", "session-a.jsonl", 45_000)];
    render(<MenuBar {...baseProps({ sessions, onSelectSession })} />);

    const button = openMenu();
    fireEvent.click(screen.getByText("session-a.jsonl"));

    expect(onSelectSession).toHaveBeenCalledWith("s1");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows how many files are still parsing", () => {
    render(<MenuBar {...baseProps({ pending: [{ path: "a.jsonl", fileName: "a.jsonl" }] })} />);

    openMenu();
    expect(screen.getByText(/parsing 1 file/)).toBeDefined();
  });

  it("keeps the File button's accessible name plain even with a pending or failed count badge", () => {
    render(
      <MenuBar
        {...baseProps({
          pending: [{ path: "a.jsonl", fileName: "a.jsonl" }],
          errors: [{ path: "b.jsonl", fileName: "b.jsonl", message: "b.jsonl is empty." }],
        })}
      />,
    );

    // The count badges are `aria-hidden`, so they add a visible hint without
    // turning "File" into "File 1 1" for anyone using a screen reader.
    expect(screen.getByRole("button", { name: "File" })).toBeDefined();
  });

  it("lists a failed file as an error row", () => {
    render(
      <MenuBar
        {...baseProps({
          errors: [{ path: "bad.jsonl", fileName: "bad.jsonl", message: "bad.jsonl is empty." }],
        })}
      />,
    );

    openMenu();
    expect(screen.getByRole("alert").textContent).toBe("bad.jsonl");
  });

  it("disables Close all sessions until something is open, then closes everything", () => {
    const onCloseAll = vi.fn();
    const { rerender } = render(<MenuBar {...baseProps({ onCloseAll })} />);

    openMenu();
    const closeButton = screen.getByRole("button", { name: /Close all sessions/ });
    expect(closeButton).toHaveProperty("disabled", true);

    rerender(
      <MenuBar
        {...baseProps({ sessions: [session("s1", "session-a.jsonl", 1_000)], onCloseAll })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Close all sessions/ }));
    expect(onCloseAll).toHaveBeenCalled();
  });

  it("forwards files picked from Open files… to the caller", () => {
    const onFiles = vi.fn();
    render(<MenuBar {...baseProps({ onFiles })} />);

    openMenu();
    const file = transcriptFile("session-a.jsonl", "{}\n");
    fireEvent.change(screen.getByLabelText("Open files…"), { target: { files: fileListOf(file) } });

    expect(onFiles).toHaveBeenCalledWith([{ file, path: "session-a.jsonl" }]);
  });
});
