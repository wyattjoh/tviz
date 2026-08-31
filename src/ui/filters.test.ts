import { describe, expect, it } from "vitest";
import type { Cell } from "./grid.ts";
import {
  ALL_SHOWN,
  isCategoryHidden,
  isCellHidden,
  isMessageKindHidden,
  toggleCategory,
  toggleMessageKind,
  withColourByKind,
} from "./filters.ts";

const cellOf = (fill: Cell["fill"], kind: Cell["kind"] = undefined): Cell => ({
  index: 0,
  start: 0,
  end: 1_000,
  fill,
  kind,
  items: [],
});

describe("GridFilters", () => {
  it("opens with everything shown and Cells coloured by Category", () => {
    expect(ALL_SHOWN.hiddenCategories.size).toBe(0);
    expect(ALL_SHOWN.hiddenKinds.size).toBe(0);
    expect(ALL_SHOWN.colourByKind).toBe(false);
  });

  it("hides a Category, then shows it again", () => {
    const hidden = toggleCategory(ALL_SHOWN, "skills");
    expect(isCategoryHidden(hidden, "skills")).toBe(true);
    expect(isCategoryHidden(hidden, "mcp")).toBe(false);
    expect(isCategoryHidden(toggleCategory(hidden, "skills"), "skills")).toBe(false);
  });

  it("hides a Message Kind, then shows it again", () => {
    const hidden = toggleMessageKind(ALL_SHOWN, "toolResult");
    expect(isMessageKindHidden(hidden, "toolResult")).toBe(true);
    expect(isMessageKindHidden(hidden, "user")).toBe(false);
    expect(isMessageKindHidden(toggleMessageKind(hidden, "toolResult"), "toolResult")).toBe(false);
  });

  it("leaves the filters it was given untouched, so a re-render sees a new value", () => {
    const hidden = toggleCategory(ALL_SHOWN, "skills");
    expect(ALL_SHOWN.hiddenCategories.size).toBe(0);
    expect(hidden).not.toBe(ALL_SHOWN);
    expect(hidden.hiddenKinds).toBe(ALL_SHOWN.hiddenKinds);
  });

  it("switches Messages between the Category accent and the Kind accents", () => {
    expect(withColourByKind(ALL_SHOWN, true).colourByKind).toBe(true);
    expect(withColourByKind(withColourByKind(ALL_SHOWN, true), false).colourByKind).toBe(false);
  });
});

describe("isCellHidden", () => {
  it("hides a Cell whose Category is toggled off", () => {
    const filters = toggleCategory(ALL_SHOWN, "skills");
    expect(isCellHidden(cellOf("skills"), filters)).toBe(true);
    expect(isCellHidden(cellOf("mcp"), filters)).toBe(false);
  });

  it("hides a Messages Cell whose Message Kind is toggled off", () => {
    const filters = toggleMessageKind(ALL_SHOWN, "toolResult");
    expect(isCellHidden(cellOf("messages", "toolResult"), filters)).toBe(true);
    expect(isCellHidden(cellOf("messages", "user"), filters)).toBe(false);
  });

  it("hides every Messages Cell when the whole Category is toggled off", () => {
    const filters = toggleCategory(ALL_SHOWN, "messages");
    expect(isCellHidden(cellOf("messages", "user"), filters)).toBe(true);
    expect(isCellHidden(cellOf("messages", "reminder"), filters)).toBe(true);
  });

  it("never hides free space, which is the headroom the grid exists to show", () => {
    const filters = toggleCategory(toggleMessageKind(ALL_SHOWN, "user"), "messages");
    expect(isCellHidden(cellOf("free"), filters)).toBe(false);
  });
});
