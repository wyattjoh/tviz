import { describe, expect, it } from "vitest";
import { CATEGORY_ORDER, MESSAGE_KIND_ORDER } from "../domain/context.ts";
import type { Cell } from "./grid.ts";
import {
  ALL_SHOWN,
  areAllFiltersHidden,
  isCategoryHidden,
  isCellHidden,
  isMessageKindHidden,
  toggleAllFilters,
  toggleCategory,
  toggleMessageKind,
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
  it("opens with every Category and Message Kind shown", () => {
    expect(ALL_SHOWN.hiddenCategories.size).toBe(0);
    expect(ALL_SHOWN.hiddenKinds.size).toBe(0);
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

  it("uses Messages as an all-or-none control for its Message Kinds", () => {
    const partiallyHidden = toggleMessageKind(ALL_SHOWN, "user");
    const allHidden = toggleCategory(partiallyHidden, "messages");

    expect(isCategoryHidden(allHidden, "messages")).toBe(true);
    for (const kind of MESSAGE_KIND_ORDER) {
      expect(isMessageKindHidden(allHidden, kind)).toBe(true);
      expect(allHidden.hiddenKinds.has(kind)).toBe(true);
    }

    const allShown = toggleCategory(allHidden, "messages");
    expect(isCategoryHidden(allShown, "messages")).toBe(false);
    for (const kind of MESSAGE_KIND_ORDER) expect(isMessageKindHidden(allShown, kind)).toBe(false);
  });

  it("selects all from a set whose Kinds were individually deselected", () => {
    const allKindsHidden = MESSAGE_KIND_ORDER.reduce(toggleMessageKind, ALL_SHOWN);

    expect(isCategoryHidden(allKindsHidden, "messages")).toBe(true);
    expect(toggleCategory(allKindsHidden, "messages")).toEqual(ALL_SHOWN);
  });

  it("deselects every filter while anything is shown, then selects all", () => {
    const partiallyHidden = toggleMessageKind(toggleCategory(ALL_SHOWN, "skills"), "user");
    expect(areAllFiltersHidden(partiallyHidden)).toBe(false);

    const allHidden = toggleAllFilters(partiallyHidden);
    expect(areAllFiltersHidden(allHidden)).toBe(true);
    for (const category of CATEGORY_ORDER) expect(isCategoryHidden(allHidden, category)).toBe(true);
    for (const kind of MESSAGE_KIND_ORDER) expect(isMessageKindHidden(allHidden, kind)).toBe(true);

    expect(toggleAllFilters(allHidden)).toEqual(ALL_SHOWN);
  });

  it("leaves the filters it was given untouched, so a re-render sees a new value", () => {
    const hidden = toggleCategory(ALL_SHOWN, "skills");
    expect(ALL_SHOWN.hiddenCategories.size).toBe(0);
    expect(hidden).not.toBe(ALL_SHOWN);
    expect(hidden.hiddenKinds).toBe(ALL_SHOWN.hiddenKinds);
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
