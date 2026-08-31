// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ContextItem } from "../domain/context.ts";
import { ALL_SHOWN, toggleCategory, withColourByKind } from "./filters.ts";
import type { Cell, CellItem } from "./grid.ts";
import { Inspector } from "./Inspector.tsx";

/**
 * The part of an item that falls inside the Cell. `tokens` defaults to the whole
 * item, for the items small enough to fit in one Cell.
 */
const share = (item: ContextItem, tokens = item.tokens): CellItem => ({ item, tokens });

const cellOf = (
  fill: Cell["fill"],
  items: readonly CellItem[],
  kind: Cell["kind"] = undefined,
): Cell => ({ index: 11, start: 11_000, end: 12_000, fill, kind, items });

afterEach(cleanup);

describe("Inspector", () => {
  it("asks for a Cell when nothing is hovered or pinned", () => {
    render(<Inspector cell={undefined} filters={ALL_SHOWN} pinned={false} />);
    expect(screen.getByText(/Hover a Cell/)).toBeDefined();
  });

  it("lists the items overlapping a filled Cell with their tokens", () => {
    render(
      <Inspector
        cell={cellOf("messages", [
          share({ category: "messages", kind: "toolResult", label: "Tool result", tokens: 800 }),
          share({ category: "messages", kind: "user", label: "User message", tokens: 200 }),
        ])}
        filters={ALL_SHOWN}
        pinned={false}
      />,
    );

    expect(screen.getByText("Messages")).toBeDefined();
    expect(screen.getByText("Tool result")).toBeDefined();
    expect(screen.getByText("800")).toBeDefined();
    expect(screen.getByText("User message")).toBeDefined();
    expect(screen.getByText("200")).toBeDefined();
    // Cells are numbered from one, over the token range they cover.
    expect(screen.getByText(/cell 12 · 11\.0k–12\.0k/)).toBeDefined();
  });

  it("reports an item's share of the Cell, and says how big the item itself is", () => {
    // A 40k tool result covers this Cell and 39 others. The Cell is 1,000
    // tokens, so 1.0k is what it holds; the item's own size is context, not the
    // Cell's contents, and a list of full sizes would sum to 40 times the Cell.
    render(
      <Inspector
        cell={cellOf(
          "messages",
          [
            share(
              { category: "messages", kind: "toolResult", label: "Tool result", tokens: 40_000 },
              1_000,
            ),
          ],
          "toolResult",
        )}
        filters={ALL_SHOWN}
        pinned={false}
      />,
    );

    expect(screen.getByText("1.0k")).toBeDefined();
    expect(screen.getByText("of 40.0k")).toBeDefined();
    expect(screen.queryByText("40.0k")).toBeNull();
  });

  it("names the Message Kind holding most of a Messages Cell", () => {
    render(
      <Inspector
        cell={cellOf(
          "messages",
          [
            share({
              category: "messages",
              kind: "reminder",
              label: "System reminder",
              tokens: 900,
            }),
          ],
          "reminder",
        )}
        filters={ALL_SHOWN}
        pinned={false}
      />,
    );
    expect(screen.getByText("Reminder")).toBeDefined();
  });

  it("calls an empty Cell free rather than listing items", () => {
    render(<Inspector cell={cellOf("free", [])} filters={ALL_SHOWN} pinned={false} />);
    expect(screen.getByText(/free — nothing has reached this part/)).toBeDefined();
  });

  it("says a Cell is pinned, so a list that outlives the pointer is explained", () => {
    const cell = cellOf("skills", [
      share({ category: "skills", kind: undefined, label: "Skill listing", tokens: 1_000 }),
    ]);

    const { rerender } = render(<Inspector cell={cell} filters={ALL_SHOWN} pinned={false} />);
    expect(screen.queryByText(/pinned/)).toBeNull();

    rerender(<Inspector cell={cell} filters={ALL_SHOWN} pinned />);
    expect(screen.getByText(/pinned/)).toBeDefined();
  });

  it("still lists a blanked Cell's items, and says its tokens still count", () => {
    render(
      <Inspector
        cell={cellOf("skills", [
          share({ category: "skills", kind: undefined, label: "Skill listing", tokens: 1_000 }),
        ])}
        filters={toggleCategory(ALL_SHOWN, "skills")}
        pinned={false}
      />,
    );
    expect(screen.getByText("Skill listing")).toBeDefined();
    expect(screen.getByText(/blanked by a filter/)).toBeDefined();
  });

  it("takes its swatch from the same colour the Cell is painted with", () => {
    const cell = cellOf(
      "messages",
      [share({ category: "messages", kind: "user", label: "User message", tokens: 1_000 })],
      "user",
    );

    const { container, rerender } = render(
      <Inspector cell={cell} filters={ALL_SHOWN} pinned={false} />,
    );
    const swatch = (): string => container.querySelector("span")?.className ?? "";
    expect(swatch()).toContain("bg-cat-messages");

    rerender(<Inspector cell={cell} filters={withColourByKind(ALL_SHOWN, true)} pinned={false} />);
    expect(swatch()).toContain("bg-kind-user");
  });
});
