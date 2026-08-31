import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, MESSAGE_KIND_ORDER } from "../domain/context.ts";
import { ALL_SHOWN, toggleCategory, toggleMessageKind, withColourByKind } from "./filters.ts";
import type { Cell } from "./grid.ts";
import {
  CATEGORY_FILL_CLASS,
  CATEGORY_RING_CLASS,
  CATEGORY_SVG_FILL_CLASS,
  cellFillClass,
  MESSAGE_KIND_FILL_CLASS,
  MESSAGE_KIND_RING_CLASS,
} from "./theme.ts";

const cellOf = (fill: Cell["fill"], kind: Cell["kind"] = undefined): Cell => ({
  index: 0,
  start: 0,
  end: 1_000,
  fill,
  kind,
  items: [],
});

describe("theme", () => {
  it("names a semantic token for every Category and Message Kind, never a colour", () => {
    // A component that reached for `ctp-mauve` or a hex value would have
    // skipped the semantic layer; the maps are the only bridge there is.
    const classes = [
      ...CATEGORY_ORDER.flatMap((category) => [
        CATEGORY_FILL_CLASS[category],
        CATEGORY_RING_CLASS[category],
        CATEGORY_SVG_FILL_CLASS[category],
      ]),
      ...MESSAGE_KIND_ORDER.flatMap((kind) => [
        MESSAGE_KIND_FILL_CLASS[kind],
        MESSAGE_KIND_RING_CLASS[kind],
      ]),
    ];

    for (const name of classes) {
      expect.soft(name, `${name} is not a semantic token`).toMatch(/^(bg|ring|fill)-(cat|kind)-/);
      expect.soft(name).not.toContain("ctp-");
      expect.soft(name).not.toContain("#");
    }
  });
});

describe("cellFillClass", () => {
  it("paints a Cell with its Category accent", () => {
    expect(cellFillClass(cellOf("skills"), ALL_SHOWN)).toBe("bg-cat-skills");
    expect(cellFillClass(cellOf("messages", "user"), ALL_SHOWN)).toBe("bg-cat-messages");
  });

  it("paints an empty Cell as free space", () => {
    expect(cellFillClass(cellOf("free"), ALL_SHOWN)).toBe("bg-cell-free");
  });

  it("blanks a Cell whose Category is hidden, distinctly from free space", () => {
    const blanked = cellFillClass(cellOf("skills"), toggleCategory(ALL_SHOWN, "skills"));
    expect(blanked).toBe("bg-cell-hidden");
    expect(blanked).not.toBe(cellFillClass(cellOf("free"), ALL_SHOWN));
  });

  it("blanks a Cell whose Message Kind is hidden", () => {
    const filters = toggleMessageKind(ALL_SHOWN, "reminder");
    expect(cellFillClass(cellOf("messages", "reminder"), filters)).toBe("bg-cell-hidden");
    expect(cellFillClass(cellOf("messages", "user"), filters)).toBe("bg-cat-messages");
  });

  it("recolours only Messages Cells when colouring by Message Kind", () => {
    const filters = withColourByKind(ALL_SHOWN, true);
    expect(cellFillClass(cellOf("messages", "toolResult"), filters)).toBe("bg-kind-tool-result");
    expect(cellFillClass(cellOf("messages", "assistant"), filters)).toBe("bg-kind-assistant");
    expect(cellFillClass(cellOf("skills"), filters)).toBe("bg-cat-skills");
    expect(cellFillClass(cellOf("free"), filters)).toBe("bg-cell-free");
  });

  it("blanks before it recolours, so a hidden Kind stays hidden", () => {
    const filters = withColourByKind(toggleMessageKind(ALL_SHOWN, "user"), true);
    expect(cellFillClass(cellOf("messages", "user"), filters)).toBe("bg-cell-hidden");
  });
});
