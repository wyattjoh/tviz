// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ContextItem,
  type ContextSnapshot,
  cumulativeItems,
  emptyCategoryTokens,
  emptyMessageKindTokens,
} from "../domain/context.ts";
import { ContextGrid } from "./ContextGrid.tsx";
import { ALL_SHOWN, type GridFilters, toggleCategory, toggleMessageKind } from "./filters.ts";
import { buildCells } from "./grid.ts";

/**
 * The observer callbacks jsdom cannot fire on its own, so a test can resize the
 * grid pane by hand.
 */
let resizes: ResizeObserverCallback[] = [];

class FakeResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    resizes.push(callback);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const resizePaneTo = (width: number): void => {
  act(() => {
    for (const callback of resizes) {
      callback(
        [{ contentRect: { width } } as ResizeObserverEntry],
        undefined as unknown as ResizeObserver,
      );
    }
  });
};

const snapshotOf = (
  items: readonly ContextItem[],
  measuredTotal = items.reduce((sum, item) => sum + item.tokens, 0),
): ContextSnapshot => ({
  index: 0,
  timestamp: undefined,
  model: undefined,
  measuredTotal,
  byCategory: emptyCategoryTokens(),
  byKind: emptyMessageKindTokens(),
  added: items,
  reset: false,
});

/**
 * Renders the grid the way `App` does: the layout is built outside the
 * component, so no filter can reach it.
 */
const renderGrid = (
  items: readonly ContextItem[],
  windowSize: number,
  filters: GridFilters = ALL_SHOWN,
  handlers: {
    readonly pinnedIndex?: number;
    readonly onInspect?: (index: number | undefined) => void;
    readonly onPin?: (index: number) => void;
  } = {},
) => (
  <ContextGrid
    cells={buildCells(items, windowSize)}
    windowSize={windowSize}
    measuredTotal={items.reduce((sum, item) => sum + item.tokens, 0)}
    filters={filters}
    pinnedIndex={handlers.pinnedIndex}
    onInspect={handlers.onInspect ?? (() => {})}
    onPin={handlers.onPin ?? (() => {})}
  />
);

const grid = (): HTMLElement => screen.getByRole("group", { name: /^Context grid/ });

const gridColumns = (): string => grid().style.getPropertyValue("grid-template-columns");

const cells = (): readonly HTMLElement[] => Array.from(grid().children) as HTMLElement[];

const titles = (): readonly string[] => cells().map((cell) => cell.getAttribute("title") ?? "");

const fills = (): readonly string[] =>
  cells().map(
    (cell) => cell.className.split(" ").find((name) => name.startsWith("bg-")) ?? "(none)",
  );

beforeEach(() => {
  resizes = [];
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ContextGrid", () => {
  it("draws a Cell per 1,000 tokens, so a 1M window is 1,000 Cells at the same size", () => {
    const items = [
      { category: "system", kind: undefined, label: "System", tokens: 20_000 },
    ] as const;

    const { rerender } = render(renderGrid(items, 200_000));
    expect(grid().childElementCount).toBe(200);
    expect(gridColumns()).toContain("16px");

    rerender(renderGrid(items, 1_000_000));
    expect(grid().childElementCount).toBe(1_000);
    // Same physical Cell, four times the Cells.
    expect(gridColumns()).toContain("16px");
  });

  it("follows the width of the grid pane with its column count", () => {
    render(renderGrid([], 200_000));
    expect(gridColumns()).toBe("repeat(20, 16px)");

    // 16px Cells with a 3px gap: 42 of them fit in 800px.
    resizePaneTo(800);
    expect(gridColumns()).toBe("repeat(42, 16px)");

    resizePaneTo(400);
    expect(gridColumns()).toBe("repeat(21, 16px)");
  });

  it("keeps every Cell at one physical size, in a pane that scrolls", () => {
    const items = [
      { category: "system", kind: undefined, label: "System", tokens: 20_000 },
    ] as const;

    const { rerender } = render(renderGrid(items, 200_000));

    const sizes = (): ReadonlySet<string> =>
      new Set(cells().map((cell) => `${cell.style.width}×${cell.style.height}`));

    expect(sizes()).toEqual(new Set(["16px×16px"]));

    // The block is 200 Cells tall over 20 columns here and 1,000 over the same
    // columns at a 1M window, so the pane — not the Cell — absorbs the growth.
    const pane = grid().parentElement;
    expect(pane?.className).toContain("overflow-auto");
    // The pane fills the Workbench's grid region rather than sizing itself.
    expect(pane?.className).toContain("flex-1");

    rerender(renderGrid(items, 1_000_000));
    expect(sizes()).toEqual(new Set(["16px×16px"]));
  });

  it("draws the cumulative items of the selected API Call, not just what it added", () => {
    const system = { category: "system", kind: undefined, label: "System", tokens: 2_000 } as const;
    const skill = { category: "skills", kind: undefined, label: "Skill", tokens: 1_000 } as const;
    const calls = [snapshotOf([system]), { ...snapshotOf([skill]), index: 1 }];

    render(renderGrid(cumulativeItems(calls, 1), 200_000));

    expect(titles().slice(0, 4)).toEqual([
      "System · 0–1.0k · System",
      "System · 1.0k–2.0k · System",
      "Skills · 2.0k–3.0k · Skill",
      "Free · 3.0k–4.0k",
    ]);
  });

  it("names the Category and token range of every Cell, and the items in it", () => {
    render(
      renderGrid(
        [
          { category: "system", kind: undefined, label: "System prompt", tokens: 1_000 },
          { category: "skills", kind: undefined, label: "Skill listing", tokens: 1_000 },
        ],
        200_000,
      ),
    );

    expect(titles()[0]).toBe("System · 0–1.0k · System prompt");
    expect(titles()[1]).toBe("Skills · 1.0k–2.0k · Skill listing");
    expect(titles()[2]).toBe("Free · 2.0k–3.0k");
  });

  describe("filtering", () => {
    const items = [
      { category: "system", kind: undefined, label: "System", tokens: 1_000 },
      { category: "skills", kind: undefined, label: "Skill listing", tokens: 1_000 },
      { category: "messages", kind: "user", label: "User message", tokens: 1_000 },
      { category: "messages", kind: "toolResult", label: "Tool result", tokens: 1_000 },
    ] as const;

    it("blanks a hidden Category's Cells in place, moving nothing", () => {
      const { rerender } = render(renderGrid(items, 200_000));
      const before = titles();
      expect(fills().slice(0, 4)).toEqual([
        "bg-cat-system",
        "bg-cat-skills",
        "bg-cat-messages",
        "bg-cat-messages",
      ]);

      rerender(renderGrid(items, 200_000, toggleCategory(ALL_SHOWN, "skills")));

      // Only the Skills Cell changed colour; every Cell kept its token range,
      // so nothing re-flowed (ADR-0006).
      expect(fills().slice(0, 4)).toEqual([
        "bg-cat-system",
        "bg-cell-hidden",
        "bg-cat-messages",
        "bg-cat-messages",
      ]);
      expect(titles().map((title) => title.replace(" · hidden", ""))).toEqual(before);
    });

    it("blanks a hidden Message Kind's Cells in place, leaving the other Kinds alone", () => {
      const { rerender } = render(renderGrid(items, 200_000));
      const before = titles();

      rerender(renderGrid(items, 200_000, toggleMessageKind(ALL_SHOWN, "toolResult")));

      expect(fills().slice(0, 4)).toEqual([
        "bg-cat-system",
        "bg-cat-skills",
        "bg-cat-messages",
        "bg-cell-hidden",
      ]);
      expect(titles().map((title) => title.replace(" · hidden", ""))).toEqual(before);
    });

    it("keeps free Cells free rather than blanking them with the rest", () => {
      render(renderGrid(items, 200_000, toggleCategory(ALL_SHOWN, "messages")));
      // A hidden Cell is not free space: the tokens are still there.
      expect(fills()[2]).toBe("bg-cell-hidden");
      expect(fills()[4]).toBe("bg-cell-free");
    });

    it("recolours Messages Cells by Message Kind, leaving the other Categories alone", () => {
      render(renderGrid(items, 200_000, { ...ALL_SHOWN, colourByKind: true }));

      expect(fills().slice(0, 4)).toEqual([
        "bg-cat-system",
        "bg-cat-skills",
        "bg-kind-user",
        "bg-kind-tool-result",
      ]);
      expect(titles()[2]).toBe("Messages · User · 2.0k–3.0k · User message");
    });
  });

  describe("inspecting a Cell", () => {
    const items = [
      { category: "system", kind: undefined, label: "System", tokens: 1_000 },
      { category: "skills", kind: undefined, label: "Skill listing", tokens: 1_000 },
    ] as const;

    it("reports the Cell under the pointer, and nothing once the pointer leaves", () => {
      const onInspect = vi.fn();
      render(renderGrid(items, 200_000, ALL_SHOWN, { onInspect }));

      const skillCell = cells()[1];
      if (skillCell === undefined) throw new Error("the grid drew no second Cell");
      fireEvent.mouseOver(skillCell);
      expect(onInspect).toHaveBeenLastCalledWith(1);

      fireEvent.mouseLeave(grid());
      expect(onInspect).toHaveBeenLastCalledWith(undefined);
    });

    it("reports a Cell reached by the keyboard too", () => {
      const onInspect = vi.fn();
      render(renderGrid(items, 200_000, ALL_SHOWN, { onInspect }));

      const firstCell = cells()[0];
      if (firstCell === undefined) throw new Error("the grid drew no Cells");
      // One Cell at a time is in the tab order; the arrow keys move between them.
      expect(firstCell.tabIndex).toBe(0);
      expect(cells()[1]?.tabIndex).toBe(-1);

      fireEvent.focus(firstCell);
      expect(onInspect).toHaveBeenLastCalledWith(0);

      fireEvent.keyDown(firstCell, { key: "ArrowRight" });
      expect(document.activeElement).toBe(cells()[1]);
    });

    it("pins the Cell that is clicked and marks it as pinned", () => {
      const onPin = vi.fn();
      const { rerender } = render(renderGrid(items, 200_000, ALL_SHOWN, { onPin }));

      const skillCell = cells()[1];
      if (skillCell === undefined) throw new Error("the grid drew no second Cell");
      fireEvent.click(skillCell);
      expect(onPin).toHaveBeenCalledWith(1);

      rerender(renderGrid(items, 200_000, ALL_SHOWN, { onPin, pinnedIndex: 1 }));
      expect(cells()[1]?.getAttribute("aria-pressed")).toBe("true");
      expect(cells()[0]?.getAttribute("aria-pressed")).toBe("false");
      expect(cells()[1]?.className).toContain("outline-ui-focus");
    });
  });
});
