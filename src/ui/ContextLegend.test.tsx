// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
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
import { ContextLegend, FilterAllButton } from "./ContextLegend.tsx";
import {
  ALL_SHOWN,
  type GridFilters,
  toggleAllFilters,
  toggleCategory,
  toggleMessageKind,
} from "./filters.ts";
import { CATEGORY_FILL_CLASS, CATEGORY_RING_CLASS, MESSAGE_KIND_FILL_CLASS } from "./theme.ts";

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
  compaction: false,
};

const renderLegend = (
  filters: GridFilters = ALL_SHOWN,
  handlers: {
    readonly onToggleCategory?: (category: Category) => void;
    readonly onToggleMessageKind?: (kind: MessageKind) => void;
  } = {},
) => (
  <ContextLegend
    snapshot={snapshot}
    windowSize={200_000}
    filters={filters}
    onToggleCategory={handlers.onToggleCategory ?? (() => {})}
    onToggleMessageKind={handlers.onToggleMessageKind ?? (() => {})}
  />
);

const FilterHarness = () => {
  const [filters, setFilters] = useState<GridFilters>(ALL_SHOWN);

  return (
    <>
      <FilterAllButton
        filters={filters}
        onToggle={() => setFilters((current) => toggleAllFilters(current))}
      />
      <ContextLegend
        snapshot={snapshot}
        windowSize={200_000}
        filters={filters}
        onToggleCategory={(category) => setFilters((current) => toggleCategory(current, category))}
        onToggleMessageKind={(kind) => setFilters((current) => toggleMessageKind(current, kind))}
      />
    </>
  );
};

const row = (name: RegExp): HTMLElement => screen.getByRole("button", { name });

const swatch = (name: RegExp): HTMLElement =>
  row(name).querySelector("span[aria-hidden='true']") as HTMLElement;

const swatchClass = (name: RegExp): string => swatch(name).className;

const swatchBackground = (name: RegExp): string => swatch(name).style.background;

const labelClass = (name: RegExp): string =>
  row(name).querySelectorAll("span")[1]?.getAttribute("class") ?? "";

/**
 * The row around a button — where the pointer handlers live, so that a
 * disabled row still describes itself.
 */
const rowItem = (name: RegExp): HTMLElement => row(name).closest("li") as HTMLElement;

afterEach(cleanup);

describe("FilterAllButton", () => {
  it("changes its action and icon when every filter is hidden", () => {
    const onToggle = vi.fn();
    const { rerender } = render(<FilterAllButton filters={ALL_SHOWN} onToggle={onToggle} />);

    const deselect = screen.getByRole("button", { name: "Deselect all filters" });
    expect(deselect.querySelector('[data-icon="deselect-all"]')).not.toBeNull();
    expect(deselect.className).toContain("touch-manipulation");
    fireEvent.click(deselect);
    expect(onToggle).toHaveBeenCalledOnce();

    rerender(<FilterAllButton filters={toggleAllFilters(ALL_SHOWN)} onToggle={onToggle} />);
    const select = screen.getByRole("button", { name: "Select all filters" });
    expect(select.querySelector('[data-icon="select-all"]')).not.toBeNull();
  });

  it("deselects and selects every legend row", () => {
    render(<FilterHarness />);

    fireEvent.click(screen.getByRole("button", { name: "Deselect all filters" }));
    for (const category of CATEGORY_ORDER) {
      expect(row(new RegExp(`^${CATEGORY_LABELS[category]}`)).getAttribute("aria-pressed")).toBe(
        "false",
      );
    }
    for (const kind of MESSAGE_KIND_ORDER) {
      expect(row(new RegExp(`^${MESSAGE_KIND_LABELS[kind]}`)).getAttribute("aria-pressed")).toBe(
        "false",
      );
    }

    fireEvent.click(screen.getByRole("button", { name: "Select all filters" }));
    for (const category of CATEGORY_ORDER) {
      expect(row(new RegExp(`^${CATEGORY_LABELS[category]}`)).getAttribute("aria-pressed")).toBe(
        "true",
      );
    }
    for (const kind of MESSAGE_KIND_ORDER) {
      expect(row(new RegExp(`^${MESSAGE_KIND_LABELS[kind]}`)).getAttribute("aria-pressed")).toBe(
        "true",
      );
    }
  });
});

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

  it("summarises enabled Message Kinds as radial colour wedges", () => {
    render(renderLegend());

    for (const kind of MESSAGE_KIND_ORDER) {
      const kindName = new RegExp(`^${MESSAGE_KIND_LABELS[kind]}`);
      expect(row(kindName).textContent).toBeDefined();
      expect(swatchClass(kindName)).toContain(MESSAGE_KIND_FILL_CLASS[kind]);
    }
    expect(row(/^Tool result/).textContent).toContain("7.0k");
    expect(row(/^Messages/).textContent).toContain("18.0k");
    expect(swatchClass(/^Messages/)).not.toContain(CATEGORY_FILL_CLASS.messages);
    expect(swatchBackground(/^Messages/)).toContain("conic-gradient");
    expect(swatchBackground(/^Messages/)).toContain("--color-kind-user");
    expect(swatchBackground(/^Messages/)).toContain("--color-kind-tool-result");
  });

  it("removes individually hidden Kinds from the Messages swatch", () => {
    const { rerender } = render(renderLegend());

    rerender(renderLegend(toggleMessageKind(ALL_SHOWN, "toolResult")));

    expect(swatchBackground(/^Messages/)).toContain("--color-kind-user");
    expect(swatchBackground(/^Messages/)).not.toContain("--color-kind-tool-result");

    const allKindsHidden = MESSAGE_KIND_ORDER.reduce(toggleMessageKind, ALL_SHOWN);
    rerender(renderLegend(allKindsHidden));
    expect(swatchBackground(/^Messages/)).toBe("");
    expect(swatchClass(/^Messages/)).toContain(CATEGORY_RING_CLASS.messages);
    expect(row(/^Messages/).getAttribute("aria-pressed")).toBe("false");
  });

  it("does not offer an alternate Category-colour mode for Messages", () => {
    render(renderLegend());

    expect(screen.queryByLabelText("Colour Messages by kind")).toBeNull();
  });

  it("gives filter rows phone-sized targets without enlarging the desktop rail", () => {
    render(renderLegend());

    expect(row(/^System/).className).toContain("min-h-11");
    expect(row(/^System/).className).toContain("touch-manipulation");
    expect(row(/^System/).className).toContain("md:min-h-0");
    expect(row(/^System/).className).toContain("text-base");
    expect(swatchClass(/^System/)).toContain("h-4");
    expect(row(/^Tool result/).className).toContain("min-h-11");
    expect(row(/^Tool result/).className).toContain("text-sm");
    expect(row(/^Tool result/).className).toContain("md:text-[11px]");
    expect(swatchClass(/^Tool result/)).toContain("h-4");
  });

  it("lets Category names use the available row width instead of truncating them", () => {
    render(renderLegend());

    expect(labelClass(/^Custom agents/)).toContain("flex-1");
    expect(labelClass(/^Custom agents/)).not.toContain("truncate");
    expect(labelClass(/^Memory files/)).not.toContain("truncate");
  });

  it("explains that System is derived, but only for a hover-capable pointer", () => {
    render(renderLegend());
    // Nothing is described until a row is pointed at: the rail is a column of
    // numbers, and six standing descriptions is what pushed them off-screen.
    expect(screen.queryByRole("tooltip")).toBeNull();

    fireEvent.pointerEnter(rowItem(/^System/), { pointerType: "mouse" });

    expect(screen.getByRole("tooltip").textContent).toContain(
      "system prompt, built-in tool schemas and root CLAUDE.md",
    );
    expect(screen.getByRole("tooltip").textContent).toContain("derived remainder");

    fireEvent.pointerLeave(rowItem(/^System/), { pointerType: "mouse" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("describes every other Category, Message Kind and free space too", () => {
    render(renderLegend());

    for (const category of CATEGORY_ORDER) {
      fireEvent.pointerEnter(rowItem(new RegExp(`^${CATEGORY_LABELS[category]}`)), {
        pointerType: "mouse",
      });
      expect
        .soft(screen.getByRole("tooltip").textContent)
        .toContain(CATEGORY_DESCRIPTIONS[category]);
    }
    for (const kind of MESSAGE_KIND_ORDER) {
      fireEvent.pointerEnter(rowItem(new RegExp(`^${MESSAGE_KIND_LABELS[kind]}`)), {
        pointerType: "mouse",
      });
      expect
        .soft(screen.getByRole("tooltip").textContent)
        .toContain(MESSAGE_KIND_DESCRIPTIONS[kind]);
    }

    const freeRow = screen.getByText("Free space").closest("li") as HTMLElement;
    fireEvent.pointerEnter(freeRow, { pointerType: "mouse" });
    expect(screen.getByRole("tooltip").textContent).toContain(FREE_SPACE_DESCRIPTION);
  });

  it("describes a row on keyboard focus, and points the row at what describes it", () => {
    render(renderLegend());
    const skills = row(/^Skills/);
    // jsdom has no input-modality heuristic, so say this focus came from the
    // keyboard — the condition browsers expose through `:focus-visible`.
    const matches = skills.matches.bind(skills);
    vi.spyOn(skills, "matches").mockImplementation((selector) =>
      selector === ":focus-visible" ? true : matches(selector),
    );

    fireEvent.focus(skills);

    const card = screen.getByRole("tooltip");
    expect(card.textContent).toContain(CATEGORY_DESCRIPTIONS.skills);
    // The card is the row's description rather than a floating aside, so a
    // screen reader reads it with the row instead of never reaching it.
    expect(skills.getAttribute("aria-describedby")).toBe(card.getAttribute("id"));

    fireEvent.blur(skills);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("does not turn a touch tap into a floating description", () => {
    const onToggleCategory = vi.fn();
    render(renderLegend(ALL_SHOWN, { onToggleCategory }));
    const skills = row(/^Skills/);

    fireEvent.pointerEnter(rowItem(/^Skills/), { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    // Pointer-focused buttons are not `:focus-visible` in a browser. Stub that
    // browser heuristic because jsdom treats every focused button as visible.
    const matches = skills.matches.bind(skills);
    vi.spyOn(skills, "matches").mockImplementation((selector) =>
      selector === ":focus-visible" ? false : matches(selector),
    );
    fireEvent.focus(skills);
    fireEvent.click(skills);

    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(onToggleCategory).toHaveBeenCalledWith("skills");
  });

  it("describes only one row at a time, keeping the row the pointer moved onto", () => {
    render(renderLegend());

    fireEvent.pointerEnter(rowItem(/^Skills/), { pointerType: "mouse" });
    fireEvent.pointerEnter(rowItem(/^MCP/), { pointerType: "mouse" });
    // The pointer enters the next row before it leaves the last, so a stale
    // leave must not blank the card that just opened.
    fireEvent.pointerLeave(rowItem(/^Skills/), { pointerType: "mouse" });

    const cards = screen.getAllByRole("tooltip");
    expect(cards.length).toBe(1);
    expect(cards[0]?.textContent).toContain(CATEGORY_DESCRIPTIONS.mcp);
  });

  it("still says what a Message Kind counts while its Category is hidden", () => {
    render(renderLegend(toggleCategory(ALL_SHOWN, "messages")));

    // The row's own button is disabled and fires no pointer events, so the card
    // has to hang off the row rather than the control.
    fireEvent.pointerEnter(rowItem(/^Tool result/), { pointerType: "mouse" });

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

  it("has nothing to toggle on free space, which the grid always shows", () => {
    render(renderLegend());
    expect(screen.queryByRole("button", { name: /Free space/ })).toBeNull();
  });
});
