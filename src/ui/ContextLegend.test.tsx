// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Category,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  type ContextSnapshot,
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

  it("explains that System is derived rather than logged", () => {
    render(renderLegend());
    expect(screen.getByText(/system prompt \+ built-in tools \+ root CLAUDE\.md/)).toBeDefined();
    expect(screen.getByText(/not logged; derived/)).toBeDefined();
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
