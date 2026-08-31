/**
 * Checks the semantic colour tokens of `src/index.css` as *colours*.
 *
 * `theme.test.ts` checks that components name the right token; nothing there
 * can tell that two tokens resolve to the same value, or that a Cell state is
 * invisible against the pane behind it. A token can be spelled correctly
 * everywhere and still say nothing on screen, so the resolved values are read
 * out of the stylesheet here and measured.
 */
import { describe, expect, it } from "vitest";
// The stylesheet as text, through Vite rather than through `node:fs`: the app
// is browser-only and its TypeScript project carries no Node types. `?raw` runs
// ahead of the Tailwind compiler, so this is the file as written — `test.css`
// in `vite.config.ts` is what stops Vitest blanking it.
import CSS from "../index.css?raw";
import { type Category, CATEGORY_ORDER, MESSAGE_KIND_ORDER } from "../domain/context.ts";

/**
 * Every `--color-*` declaration, as written: a hex literal in the palette
 * adapter, a `var(--color-ctp-*)` reference in the semantic layer.
 */
const DECLARED: ReadonlyMap<string, string> = new Map(
  [...CSS.matchAll(/--color-([\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [
    name ?? "",
    (value ?? "").trim(),
  ]),
);

/**
 * Follows a semantic token down to the hex literal its palette adapter holds.
 */
const colourOf = (name: string): string => {
  const value = DECLARED.get(name);
  if (value === undefined) throw new Error(`--color-${name} is not declared`);
  const reference = /^var\(--color-([\w-]+)\)$/.exec(value);
  return reference === null ? value : colourOf(reference[1] ?? "");
};

/**
 * WCAG relative luminance of a `#rrggbb` value.
 */
const luminance = (hex: string): number => {
  const channels = [1, 3, 5]
    .map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
};

/**
 * WCAG contrast ratio between two semantic tokens, 1:1 to 21:1.
 */
const contrast = (left: string, right: string): number => {
  const [lighter, darker] = [luminance(colourOf(left)), luminance(colourOf(right))].sort(
    (a, b) => b - a,
  );
  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05);
};

/**
 * WCAG's floor for a non-text element that carries meaning, which every Cell
 * state does: the grid says everything it says with 16px boxes.
 */
const NON_TEXT_CONTRAST = 3;

const CATEGORY_TOKEN: Readonly<Record<Category, string>> = {
  system: "cat-system",
  customAgents: "cat-agents",
  memoryFiles: "cat-memory",
  skills: "cat-skills",
  mcp: "cat-mcp",
  messages: "cat-messages",
};

const KIND_TOKENS = ["kind-user", "kind-assistant", "kind-tool-result", "kind-reminder"];

describe("semantic colour tokens", () => {
  it("reads the stylesheet as written", () => {
    // Vitest hands CSS imports an empty string unless `css` is on, and a
    // compiler in the way would drop the comments and the tokens nothing uses
    // yet. Either way the checks below would be measuring the wrong thing.
    expect(CSS).toContain("Layer 1: Catppuccin Mocha palette adapter");
    expect(DECLARED.size).toBeGreaterThan(CATEGORY_ORDER.length + KIND_TOKENS.length);
  });

  it("keeps the palette in the adapter layer, so a semantic token names no colour", () => {
    for (const [name, value] of DECLARED) {
      if (name.startsWith("ctp-")) continue;
      expect.soft(value, `--color-${name} skips the palette adapter`).toMatch(/^var\(--color-ctp-/);
    }
  });

  it("makes a blanked Cell visible against the pane behind the grid", () => {
    // The fill alone cannot do it: the darkest neutral there is sits at 1.1:1
    // against the canvas, which is why the state carries an outline. Without
    // one, "blanked in place" and "Cell removed" look identical, and the second
    // is the re-flow ADR-0006 exists to rule out.
    expect(contrast("cell-hidden", "ui-canvas")).toBeLessThan(NON_TEXT_CONTRAST);
    expect(contrast("cell-hidden-edge", "ui-canvas")).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
    expect(contrast("cell-hidden-edge", "cell-hidden")).toBeGreaterThanOrEqual(NON_TEXT_CONTRAST);
  });

  it("keeps a blanked Cell distinct from a free one, which holds no tokens", () => {
    expect(colourOf("cell-hidden")).not.toBe(colourOf("cell-free"));
    // The outline is the cue that does not rest on colour: a free Cell has none.
    expect(DECLARED.has("cell-free-edge")).toBe(false);
  });

  it("gives every Category and Message Kind an accent of its own", () => {
    // Two rows of the legend painted the same colour are one row as far as a
    // reader is concerned — and User sharing the Messages accent would leave
    // "colour Messages by kind" looking like it had done nothing to them.
    const tokens = [...CATEGORY_ORDER.map((category) => CATEGORY_TOKEN[category]), ...KIND_TOKENS];
    const byColour = new Map<string, string[]>();
    for (const token of tokens) {
      const colour = colourOf(token);
      byColour.set(colour, [...(byColour.get(colour) ?? []), token]);
    }

    for (const [colour, sharing] of byColour) {
      expect.soft(sharing, `${sharing.join(" and ")} are both ${colour}`).toHaveLength(1);
    }
  });

  it("declares an accent for every Message Kind the domain has", () => {
    expect(KIND_TOKENS).toHaveLength(MESSAGE_KIND_ORDER.length);
    for (const token of KIND_TOKENS) expect(colourOf(token)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
