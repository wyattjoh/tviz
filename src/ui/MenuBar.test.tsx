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
  compaction: false,
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
  onCloseSession: vi.fn(),
  onCloseAll: vi.fn(),
  onLoadDemo: vi.fn(),
  demoBusy: false,
  demoLabels: new Map(),
  ...overrides,
});

const openFileMenu = (): HTMLElement => {
  const button = screen.getByRole("button", { name: "File" });
  fireEvent.click(button);
  return button;
};

const openSessionMenu = (fileName: string): HTMLElement => {
  const button = screen.getByRole("button", { name: fileName });
  fireEvent.click(button);
  return button;
};

const sessionRow = (fileName: RegExp): HTMLElement => {
  const row = screen
    .getAllByRole("button", { name: fileName })
    .find((button) => button.getAttribute("aria-pressed") !== null);
  if (row === undefined) throw new Error(`no Session row matched ${fileName}`);
  return row;
};

describe("MenuBar", () => {
  it("opens the unified file dropdown and closes it on Escape", () => {
    render(<MenuBar {...baseProps()} />);

    const button = openFileMenu();
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Open session…")).toBeDefined();
    expect(screen.getByText("Open folder…")).toBeDefined();
    expect(screen.getByText("Load demo sessions")).toBeDefined();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("gives the file trigger and dropdown choices mobile-sized targets", () => {
    const selected = session("s1", "session-a.jsonl", 45_000);
    render(<MenuBar {...baseProps({ sessions: [selected], selectedId: selected.id })} />);

    const trigger = openSessionMenu(selected.fileName);
    const pickerRow = screen.getByText("Open session…").closest("label");
    const actionRow = screen.getByRole("button", { name: "Close all sessions" });

    expect(trigger.className).toContain("min-h-11");
    expect(trigger.className).toContain("md:min-h-0");
    expect(pickerRow?.className).toContain("min-h-11");
    expect(pickerRow?.className).toContain("md:min-h-0");
    expect(actionRow.className).toContain("min-h-11");
    expect(actionRow.className).toContain("md:min-h-0");
  });

  it("merges the selected Session into the bar with its filename at the far right", () => {
    const selected = session("s1", "session-a.jsonl", 45_000);
    render(<MenuBar {...baseProps({ sessions: [selected], selectedId: selected.id })} />);

    const bar = screen.getByRole("banner", { name: "tviz" });
    const details = screen.getByRole("region", { name: "Session" });
    const filename = screen.getByRole("button", { name: "session-a.jsonl" });
    expect(bar.contains(details)).toBe(true);
    expect(filename.parentElement?.className).toContain("ml-auto");
    expect(details.lastElementChild).toBe(filename.parentElement);
    expect(details.textContent).not.toContain("call 1/1");
    expect(screen.queryByRole("button", { name: /^close$/i })).toBeNull();
  });

  it("closes on a click outside the menu", () => {
    render(
      <div>
        <MenuBar {...baseProps()} />
        <div data-testid="outside" />
      </div>,
    );

    const button = openFileMenu();
    fireEvent.pointerDown(screen.getByTestId("outside"));
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("lists every open Session with its call count and peak, checking the selected one", () => {
    const sessions = [
      session("s1", "session-a.jsonl", 45_000),
      session("s2", "session-b.jsonl", 9_000),
    ];
    render(<MenuBar {...baseProps({ sessions, selectedId: "s2" })} />);

    openSessionMenu("session-b.jsonl");

    const rowA = sessionRow(/^session-a\.jsonl/);
    const rowB = sessionRow(/^session-b\.jsonl/);
    expect(rowA?.textContent).toContain("1 · 45.0k");
    expect(rowB?.getAttribute("aria-pressed")).toBe("true");
    expect(rowA?.getAttribute("aria-pressed")).toBe("false");
  });

  it("switches the selected Session and closes the menu", () => {
    const onSelectSession = vi.fn();
    const sessions = [
      session("s1", "session-a.jsonl", 45_000),
      session("s2", "session-b.jsonl", 9_000),
    ];
    render(<MenuBar {...baseProps({ sessions, selectedId: "s1", onSelectSession })} />);

    const button = openSessionMenu("session-a.jsonl");
    fireEvent.click(sessionRow(/^session-b\.jsonl/));

    expect(onSelectSession).toHaveBeenCalledWith("s2");
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("shows how many files are still parsing", () => {
    const selected = session("s1", "session-a.jsonl", 45_000);
    render(
      <MenuBar
        {...baseProps({
          sessions: [selected],
          selectedId: selected.id,
          pending: [{ id: "1", path: "a.jsonl", fileName: "a.jsonl" }],
        })}
      />,
    );

    openSessionMenu(selected.fileName);
    // Scoped to the menu's own row: the always-mounted live region
    // (`[aria-live]`, covered separately below) says the same thing.
    expect(screen.getByText(/parsing 1 file/, { selector: "div" })).toBeDefined();
  });

  it("keeps the filename button's accessible name plain with status badges", () => {
    const selected = session("s1", "session-a.jsonl", 45_000);
    render(
      <MenuBar
        {...baseProps({
          sessions: [selected],
          selectedId: selected.id,
          pending: [{ id: "1", path: "a.jsonl", fileName: "a.jsonl" }],
          errors: [{ id: "2", path: "b.jsonl", fileName: "b.jsonl", message: "b.jsonl is empty." }],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: selected.fileName })).toBeDefined();
  });

  it("lists a failed file as an error row", () => {
    const selected = session("s1", "session-a.jsonl", 45_000);
    render(
      <MenuBar
        {...baseProps({
          sessions: [selected],
          selectedId: selected.id,
          errors: [
            { id: "1", path: "bad.jsonl", fileName: "bad.jsonl", message: "bad.jsonl is empty." },
          ],
        })}
      />,
    );

    openSessionMenu(selected.fileName);
    expect(screen.getByRole("alert").textContent).toBe("bad.jsonl");
  });

  it("closes only the selected Session from the filename dropdown", () => {
    const selected = session("s1", "session-a.jsonl", 1_000);
    const onCloseSession = vi.fn();
    render(
      <MenuBar
        {...baseProps({
          sessions: [selected],
          selectedId: selected.id,
          onCloseSession,
        })}
      />,
    );

    openSessionMenu(selected.fileName);
    expect(screen.queryByRole("button", { name: "File" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Close session" }));
    expect(onCloseSession).toHaveBeenCalledWith(selected.id);
  });

  it("disables Close all sessions until something is open, then closes everything", () => {
    const onCloseAll = vi.fn();
    const { rerender } = render(<MenuBar {...baseProps({ onCloseAll })} />);

    openFileMenu();
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

  it("opens a new transcript from the filename menu", () => {
    const onFiles = vi.fn();
    const selected = session("s1", "session-a.jsonl", 45_000);
    render(<MenuBar {...baseProps({ sessions: [selected], selectedId: selected.id, onFiles })} />);

    openSessionMenu(selected.fileName);
    const file = transcriptFile("session-b.jsonl", "{}\n");
    fireEvent.change(screen.getByLabelText("Open session…"), {
      target: { files: fileListOf(file) },
    });

    expect(onFiles).toHaveBeenCalledWith([{ file, path: "session-b.jsonl" }]);
  });

  it("forwards folders picked from Open folder… to the caller, reading webkitRelativePath", () => {
    const onFiles = vi.fn();
    render(<MenuBar {...baseProps({ onFiles })} />);

    openFileMenu();
    const input = screen.getByLabelText("Open folder…") as HTMLInputElement;
    // The folder picker's directory attribute is applied through an untyped
    // spread (`webkitdirectory` is not in `lib.dom`), so a regression that
    // drops it would still typecheck — only this assertion catches it.
    expect(input.hasAttribute("webkitdirectory")).toBe(true);

    const file = transcriptFile("session-a.jsonl", "{}\n");
    Object.defineProperty(file, "webkitRelativePath", { value: "project/session-a.jsonl" });
    fireEvent.change(input, { target: { files: fileListOf(file) } });

    expect(onFiles).toHaveBeenCalledWith([{ file, path: "project/session-a.jsonl" }]);
  });

  it("does not advertise a keyboard shortcut nothing in the app implements", () => {
    render(<MenuBar {...baseProps()} />);

    openFileMenu();
    // No `metaKey`/`ctrlKey` handler exists anywhere in the app; a hint here
    // would send someone at the browser's own ⌘O/⌘W instead.
    expect(screen.queryByText("⌘O")).toBeNull();
    expect(screen.queryByText("⇧⌘O")).toBeNull();
    expect(screen.queryByText("⌘W")).toBeNull();
  });

  it("announces parsing progress and failures to a screen reader even while the menu is closed", () => {
    const selected = session("s1", "session-a.jsonl", 45_000);
    const { rerender } = render(
      <MenuBar
        {...baseProps({
          sessions: [selected],
          selectedId: selected.id,
          pending: [{ id: "1", path: "a.jsonl", fileName: "a.jsonl" }],
        })}
      />,
    );

    // The Session menu is closed, so only its always-mounted live region can
    // carry this update.
    expect(
      screen.getByRole("button", { name: selected.fileName }).getAttribute("aria-expanded"),
    ).toBe("false");
    expect(screen.getByText(/parsing 1 file/, { selector: "[aria-live]" })).toBeDefined();

    rerender(
      <MenuBar
        {...baseProps({
          sessions: [selected],
          selectedId: selected.id,
          errors: [{ id: "1", path: "b.jsonl", fileName: "b.jsonl", message: "b.jsonl is empty." }],
        })}
      />,
    );
    expect(screen.getByText(/1 file failed to parse/, { selector: "[aria-live]" })).toBeDefined();
  });

  it("gives each error row a stable key even when two failures share a path", () => {
    // Two entries with the same `path` (the same file dropped twice) must
    // not collide on a shared React key — each carries its own `id`.
    const selected = session("s1", "session-a.jsonl", 45_000);
    render(
      <MenuBar
        {...baseProps({
          sessions: [selected],
          selectedId: selected.id,
          errors: [
            { id: "1", path: "dup.jsonl", fileName: "dup.jsonl", message: "dup.jsonl is empty." },
            { id: "2", path: "dup.jsonl", fileName: "dup.jsonl", message: "dup.jsonl is empty." },
          ],
        })}
      />,
    );

    openSessionMenu(selected.fileName);
    expect(screen.getAllByRole("alert")).toHaveLength(2);
  });

  it("loads the Demo Sessions and names them from the manifest", () => {
    const onLoadDemo = vi.fn();
    render(
      <MenuBar
        {...baseProps({
          sessions: [session("s1", "medium.jsonl", 60_000)],
          selectedId: "s1",
          demoLabels: new Map([["s1", "Medium session"]]),
          onLoadDemo,
        })}
      />,
    );
    openSessionMenu("medium.jsonl");

    // A Demo Session is named by the manifest and says so, rather than showing
    // the file name it happens to be served under.
    expect(sessionRow(/^Medium session \(demo\)/)).toBeDefined();
    fireEvent.keyDown(document, { key: "Escape" });

    openSessionMenu("medium.jsonl");
    fireEvent.click(screen.getByRole("button", { name: "Load demo sessions" }));
    expect(onLoadDemo).toHaveBeenCalledTimes(1);
  });

  it("does not start a second demo load while one is in flight", () => {
    render(<MenuBar {...baseProps({ demoBusy: true })} />);
    openFileMenu();

    expect(
      screen.getByRole("button", { name: "Load demo sessions" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(screen.getByText("loading demo sessions…")).toBeDefined();
  });
});
