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

const resizePaneTo = (width: number, height: number): void => {
  act(() => {
    for (const callback of resizes) {
      callback(
        [{ contentRect: { width, height } } as ResizeObserverEntry],
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

/**
 * The one size every Cell is drawn at, as `width×height`.
 */
const cellSize = (): string => {
  const sizes = new Set(cells().map((cell) => `${cell.style.width}×${cell.style.height}`));
  expect(sizes.size).toBe(1);
  return [...sizes][0] ?? "";
};

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
  it("draws a Cell per 1,000 tokens, so a 1M window is five times the Cells", () => {
    const items = [
      { category: "system", kind: undefined, label: "System", tokens: 20_000 },
    ] as const;

    const { rerender } = render(renderGrid(items, 200_000));
    expect(grid().childElementCount).toBe(200);

    rerender(renderGrid(items, 1_000_000));
    expect(grid().childElementCount).toBe(1_000);
  });

  it("sizes the Cells to fill the grid pane, in both directions", () => {
    render(renderGrid([], 200_000));

    // Before the pane is measured the grid falls back to the fixed Cell it was
    // drawn at when Cell size was a constant.
    expect(gridColumns()).toBe("repeat(20, 16px)");
    expect(cellSize()).toBe("16px\u00d716px");

    resizePaneTo(1_360, 660);
    const wide = cellSize();
    expect(wide).not.toBe("16px\u00d716px");

    // A taller pane is more room for the same 200 Cells, so the Cell grows
    // until it hits the clamp rather than leaving the space empty.
    resizePaneTo(1_360, 200);
    const short = cellSize();
    expect(Number.parseInt(short, 10)).toBeLessThan(Number.parseInt(wide, 10));

    // Narrowing the pane still takes columns away.
    const columnsIn = (): number => Number.parseInt(gridColumns().slice("repeat(".length), 10);
    resizePaneTo(1_360, 660);
    const columns = columnsIn();
    resizePaneTo(400, 660);
    expect(columnsIn()).toBeLessThan(columns);
  });

  it("gives a bigger Context Window smaller Cells in the same pane", () => {
    const items = [
      { category: "system", kind: undefined, label: "System", tokens: 20_000 },
    ] as const;

    const { rerender } = render(renderGrid(items, 200_000));
    resizePaneTo(1_360, 660);
    const small = Number.parseInt(cellSize(), 10);

    rerender(renderGrid(items, 1_000_000));
    resizePaneTo(1_360, 660);
    expect(Number.parseInt(cellSize(), 10)).toBeLessThan(small);
  });

  it("keeps every Cell at one size, in a pane that scrolls once they cannot shrink", () => {
    const items = [
      { category: "system", kind: undefined, label: "System", tokens: 20_000 },
    ] as const;

    render(renderGrid(items, 1_000_000));

    // 1,000 Cells cannot fit a pane this short even at the smallest Cell, so
    // the Cell bottoms out and the pane — not the Cell — absorbs the rest.
    resizePaneTo(600, 120);
    expect(cellSize()).toBe("8px\u00d78px");

    const pane = grid().parentElement;
    expect(pane?.className).toContain("overflow-auto");
    // The pane fills the Workbench's grid region rather than sizing itself.
    expect(pane?.className).toContain("flex-1");
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
