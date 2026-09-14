import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, MESSAGE_KIND_ORDER } from "../domain/context.ts";
import { ALL_SHOWN, toggleCategory, toggleMessageKind } from "./filters.ts";
import type { Cell } from "./grid.ts";
import {
  CATEGORY_FILL_CLASS,
  CATEGORY_RING_CLASS,
  CATEGORY_SVG_FILL_CLASS,
  cellFillClass,
  FREE_FILL_CLASS,
  HIDDEN_FILL_CLASS,
  MESSAGE_KIND_FILL_CLASS,
  MESSAGE_KIND_RING_CLASS,
  messageKindSwatchBackground,
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

    // The Cell states are semantic too, and the blanked one is more than a
    // fill: what those tokens resolve to is measured in `tokens.test.ts`.
    for (const name of [FREE_FILL_CLASS, ...HIDDEN_FILL_CLASS.split(" ")]) {
      expect.soft(name).toMatch(/^(bg-cell-|ring-cell-|ring-inset$|ring-1$)/);
      expect.soft(name).not.toContain("ctp-");
    }
  });
});

describe("messageKindSwatchBackground", () => {
  it("radiates one equal wedge from the center for every supplied Kind", () => {
    const background = messageKindSwatchBackground(MESSAGE_KIND_ORDER);

    expect(background).toMatch(/^conic-gradient\(from -45deg,/);
    for (const token of ["user", "assistant", "tool-result", "reminder"]) {
      expect(background).toContain(`--color-kind-${token}`);
    }
    expect(background).toContain("0% 25%");
    expect(background).toContain("75% 100%");
  });

  it("contains only enabled Kinds and leaves an empty selection unfilled", () => {
    expect(messageKindSwatchBackground(["user", "reminder"])).toContain("--color-kind-user");
    expect(messageKindSwatchBackground(["user", "reminder"])).toContain("--color-kind-reminder");
    expect(messageKindSwatchBackground(["user", "reminder"])).not.toContain(
      "--color-kind-assistant",
    );
    expect(messageKindSwatchBackground([])).toBeUndefined();
  });
});

describe("cellFillClass", () => {
  it("paints a Cell with its Category accent, and a Messages Cell with its Kind's", () => {
    expect(cellFillClass(cellOf("skills"), ALL_SHOWN)).toBe("bg-cat-skills");
    expect(cellFillClass(cellOf("messages", "user"), ALL_SHOWN)).toBe("bg-kind-user");
  });

  it("paints an empty Cell as free space", () => {
    expect(cellFillClass(cellOf("free"), ALL_SHOWN)).toBe("bg-cell-free");
  });

  it("blanks a Cell whose Category is hidden, distinctly from free space", () => {
    const blanked = cellFillClass(cellOf("skills"), toggleCategory(ALL_SHOWN, "skills"));
    expect(blanked).toContain("bg-cell-hidden");
    // A blanked Cell is drawn as an outline as well: against the pane behind
    // the grid its fill alone is imperceptible, and a Cell that looks removed
    // is the re-flow ADR-0006 rules out.
    expect(blanked).toContain("ring-cell-hidden-edge");
    expect(blanked).not.toBe(cellFillClass(cellOf("free"), ALL_SHOWN));
  });

  it("blanks a Cell whose Message Kind is hidden", () => {
    const filters = toggleMessageKind(ALL_SHOWN, "reminder");
    expect(cellFillClass(cellOf("messages", "reminder"), filters)).toBe(HIDDEN_FILL_CLASS);
    expect(cellFillClass(cellOf("messages", "user"), filters)).toBe("bg-kind-user");
  });

  it("uses Message Kind accents only for Messages Cells", () => {
    expect(cellFillClass(cellOf("messages", "toolResult"), ALL_SHOWN)).toBe("bg-kind-tool-result");
    expect(cellFillClass(cellOf("messages", "assistant"), ALL_SHOWN)).toBe("bg-kind-assistant");
    expect(cellFillClass(cellOf("skills"), ALL_SHOWN)).toBe("bg-cat-skills");
    expect(cellFillClass(cellOf("free"), ALL_SHOWN)).toBe("bg-cell-free");
  });

  it("blanks before choosing an accent, so a hidden Kind stays hidden", () => {
    const filters = toggleMessageKind(ALL_SHOWN, "user");
    expect(cellFillClass(cellOf("messages", "user"), filters)).toBe(HIDDEN_FILL_CLASS);
  });
});
