// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ContextItem,
  type ContextSnapshot,
  emptyCategoryTokens,
  emptyMessageKindTokens,
} from "../domain/context.ts";
import { ContextGrid } from "./ContextGrid.tsx";

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
  items,
  reset: false,
});

const gridColumns = (): string =>
  screen.getByRole("img").style.getPropertyValue("grid-template-columns");

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

    const { rerender } = render(<ContextGrid snapshot={snapshotOf(items)} windowSize={200_000} />);
    expect(screen.getByRole("img").childElementCount).toBe(200);
    expect(gridColumns()).toContain("16px");

    rerender(<ContextGrid snapshot={snapshotOf(items)} windowSize={1_000_000} />);
    expect(screen.getByRole("img").childElementCount).toBe(1_000);
    // Same physical Cell, four times the Cells.
    expect(gridColumns()).toContain("16px");
  });

  it("follows the width of the grid pane with its column count", () => {
    render(<ContextGrid snapshot={snapshotOf([])} windowSize={200_000} />);
    expect(gridColumns()).toBe("repeat(20, 16px)");

    // 16px Cells with a 3px gap: 42 of them fit in 800px.
    resizePaneTo(800);
    expect(gridColumns()).toBe("repeat(42, 16px)");

    resizePaneTo(400);
    expect(gridColumns()).toBe("repeat(21, 16px)");
  });

  it("names the Category and token range of every Cell, and the items in it", () => {
    render(
      <ContextGrid
        snapshot={snapshotOf([
          { category: "system", kind: undefined, label: "System prompt", tokens: 1_000 },
          { category: "skills", kind: undefined, label: "Skill listing", tokens: 1_000 },
        ])}
        windowSize={200_000}
      />,
    );

    const titles = Array.from(
      screen.getByRole("img").children,
      (cell) => cell.getAttribute("title") ?? "",
    );
    expect(titles[0]).toBe("System · 0–1.0k · System prompt");
    expect(titles[1]).toBe("Skills · 1.0k–2.0k · Skill listing");
    expect(titles[2]).toBe("Free · 2.0k–3.0k");
  });
});
