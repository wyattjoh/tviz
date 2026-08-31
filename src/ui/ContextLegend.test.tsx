// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Category,
  CATEGORY_DESCRIPTIONS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ContextSnapshot,
  FREE_SPACE_DESCRIPTION,
  MESSAGE_KIND_DESCRIPTIONS,
  MESSAGE_KIND_LABELS,
  MESSAGE_KIND_ORDER,
  type MessageKind,
} from "../domain/context.ts";
import { ContextLegend } from "./ContextLegend.tsx";
import { ALL_SHOWN, type GridFilters, toggleCategory, toggleMessageKind } from "./filters.ts";

const snapshot: ContextSnapshot = {
  index: 0,
  timestamp: undefined,
  model: undefined,
  measuredTotal: 50_000,
  byCategory: {
    system: 20_000,
    customAgents: 1_000,
    memoryFiles: 4_000,
    skills: 5_000,
    mcp: 2_000,
    messages: 18_000,
  },
  byKind: { user: 6_000, assistant: 4_000, toolResult: 7_000, reminder: 1_000 },
  added: [],
  reset: false,
};

const renderLegend = (
  filters: GridFilters = ALL_SHOWN,
  handlers: {
    readonly onToggleCategory?: (category: Category) => void;
    readonly onToggleMessageKind?: (kind: MessageKind) => void;
    readonly onColourByKind?: (colourByKind: boolean) => void;
  } = {},
) => (
  <ContextLegend
    snapshot={snapshot}
    windowSize={200_000}
    filters={filters}
    onToggleCategory={handlers.onToggleCategory ?? (() => {})}
    onToggleMessageKind={handlers.onToggleMessageKind ?? (() => {})}
    onColourByKind={handlers.onColourByKind ?? (() => {})}
  />
);

const row = (name: RegExp): HTMLElement => screen.getByRole("button", { name });

/**
 * The row around a button — where the pointer handlers live, so that a
 * disabled row still describes itself.
 */
const rowItem = (name: RegExp): HTMLElement => row(name).closest("li") as HTMLElement;

afterEach(cleanup);

describe("ContextLegend", () => {
  it("lists every Category with its exact tokens and share of the window", () => {
    render(renderLegend());

    for (const category of CATEGORY_ORDER) {
      expect(
        screen.getByRole("button", { name: new RegExp(CATEGORY_LABELS[category]) }),
      ).toBeDefined();
    }
    expect(row(/^System/).textContent).toContain("20.0k");
    expect(row(/^System/).textContent).toContain("10.0%");
    expect(screen.getByText("Free space")).toBeDefined();
    expect(screen.getByText("150.0k")).toBeDefined();
  });

  it("expands Messages into its Message Kinds, which sum to the Category", () => {
    render(renderLegend());

    for (const kind of MESSAGE_KIND_ORDER) {
      expect(row(new RegExp(`^${MESSAGE_KIND_LABELS[kind]}`)).textContent).toBeDefined();
    }
    expect(row(/^Tool result/).textContent).toContain("7.0k");
    expect(row(/^Messages/).textContent).toContain("18.0k");
  });

  it("explains that System is derived rather than logged, but only on hover", () => {
    render(renderLegend());
    // Nothing is described until a row is pointed at: the rail is a column of
    // numbers, and six standing descriptions is what pushed them off-screen.
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.mouseOver(rowItem(/^System/));

    expect(screen.getByRole("tooltip").textContent).toContain(
      "system prompt, built-in tool schemas and root CLAUDE.md",
    );
    expect(screen.getByRole("tooltip").textContent).toContain("derived remainder");

    fireEvent.mouseOut(rowItem(/^System/));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("describes every other Category, Message Kind and free space too", () => {
    render(renderLegend());

    for (const category of CATEGORY_ORDER) {
      fireEvent.mouseOver(rowItem(new RegExp(`^${CATEGORY_LABELS[category]}`)));
      expect
        .soft(screen.getByRole("tooltip").textContent)
        .toContain(CATEGORY_DESCRIPTIONS[category]);
    }
    for (const kind of MESSAGE_KIND_ORDER) {
      fireEvent.mouseOver(rowItem(new RegExp(`^${MESSAGE_KIND_LABELS[kind]}`)));
      expect
        .soft(screen.getByRole("tooltip").textContent)
        .toContain(MESSAGE_KIND_DESCRIPTIONS[kind]);
    }

    const freeRow = screen.getByText("Free space").closest("li") as HTMLElement;
    fireEvent.mouseOver(freeRow);
    expect(screen.getByRole("tooltip").textContent).toContain(FREE_SPACE_DESCRIPTION);
  });

  it("describes a row on keyboard focus, and points the row at what describes it", () => {
    render(renderLegend());

    fireEvent.focus(row(/^Skills/));

    const card = screen.getByRole("tooltip");
    expect(card.textContent).toContain(CATEGORY_DESCRIPTIONS.skills);
    // The card is the row's description rather than a floating aside, so a
    // screen reader reads it with the row instead of never reaching it.
    expect(row(/^Skills/).getAttribute("aria-describedby")).toBe(card.getAttribute("id"));

    fireEvent.blur(row(/^Skills/));
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("describes only one row at a time, keeping the row the pointer moved onto", () => {
    render(renderLegend());

    fireEvent.mouseOver(rowItem(/^Skills/));
    fireEvent.mouseOver(rowItem(/^MCP/));
    // The pointer enters the next row before it leaves the last, so a stale
    // leave must not blank the card that just opened.
    fireEvent.mouseOut(rowItem(/^Skills/));

    const cards = screen.getAllByRole("tooltip");
    expect(cards.length).toBe(1);
    expect(cards[0]?.textContent).toContain(CATEGORY_DESCRIPTIONS.mcp);
  });

  it("still says what a Message Kind counts while its Category is hidden", () => {
    render(renderLegend(toggleCategory(ALL_SHOWN, "messages")));

    // The row's own button is disabled and fires no mouse events, so the card
    // has to hang off the row rather than the control.
    fireEvent.mouseOver(rowItem(/^Tool result/));

    const card = screen.getByRole("tooltip");
    expect(card.textContent).toContain(MESSAGE_KIND_DESCRIPTIONS.toolResult);
    // And it is where the row explains why its toggle is inert, rather than a
    // second native tooltip saying it.
    expect(card.textContent).toContain("Messages is hidden");
    expect(row(/^Tool result/).getAttribute("title")).toBeNull();
  });

  it("toggles a Category and a Message Kind from their rows", () => {
    const onToggleCategory = vi.fn();
    const onToggleMessageKind = vi.fn();
    render(renderLegend(ALL_SHOWN, { onToggleCategory, onToggleMessageKind }));

    fireEvent.click(row(/^Skills/));
    expect(onToggleCategory).toHaveBeenCalledWith("skills");

    fireEvent.click(row(/^Reminder/));
    expect(onToggleMessageKind).toHaveBeenCalledWith("reminder");
  });

  it("keeps a hidden row's total, because hiding is only a paint decision", () => {
    const { rerender } = render(renderLegend());
    const before = row(/^Skills/).textContent;
    expect(row(/^Skills/).getAttribute("aria-pressed")).toBe("true");

    rerender(renderLegend(toggleCategory(ALL_SHOWN, "skills")));

    expect(row(/^Skills/).textContent).toBe(before);
    expect(row(/^Skills/).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps a hidden Message Kind's total too, and leaves its Category shown", () => {
    const { rerender } = render(renderLegend());
    const before = row(/^Tool result/).textContent;

    rerender(renderLegend(toggleMessageKind(ALL_SHOWN, "toolResult")));

    expect(row(/^Tool result/).textContent).toBe(before);
    expect(row(/^Tool result/).getAttribute("aria-pressed")).toBe("false");
    expect(row(/^Messages/).getAttribute("aria-pressed")).toBe("true");
  });

  it("stops a Message Kind claiming to be shown when Messages itself is hidden", () => {
    const onToggleMessageKind = vi.fn();
    render(renderLegend(toggleCategory(ALL_SHOWN, "messages"), { onToggleMessageKind }));

    for (const kind of MESSAGE_KIND_ORDER) {
      const kindRow = row(new RegExp(`^${MESSAGE_KIND_LABELS[kind]}`));
      // None of these Cells are drawn, so none of these rows may say they are.
      expect.soft(kindRow.getAttribute("aria-pressed")).toBe("false");
      // And a toggle that cannot change the grid does not quietly record a
      // state the reader will meet again when they show Messages.
      expect.soft((kindRow as HTMLButtonElement).disabled).toBe(true);
    }

    fireEvent.click(row(/^Tool result/));
    expect(onToggleMessageKind).not.toHaveBeenCalled();
  });

  it("offers colouring Messages by kind", () => {
    const onColourByKind = vi.fn();
    render(renderLegend(ALL_SHOWN, { onColourByKind }));

    const toggle = screen.getByLabelText("Colour Messages by kind") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    fireEvent.click(toggle);
    expect(onColourByKind).toHaveBeenCalledWith(true);
  });

  it("has nothing to toggle on free space, which the grid always shows", () => {
    render(renderLegend());
    expect(screen.queryByRole("button", { name: /Free space/ })).toBeNull();
  });
});
