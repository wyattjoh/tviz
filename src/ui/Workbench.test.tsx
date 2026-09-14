// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RailPanel, Workbench } from "./Workbench.tsx";

afterEach(() => {
  cleanup();
});

const shell = () =>
  render(
    <Workbench
      header={<div>session strip</div>}
      grid={<div>grid pane</div>}
      rail={<RailPanel title="Categories">legend</RailPanel>}
      scrubber={<div>scrubber</div>}
    />,
  );

/** The body is the element holding both the grid pane and the rail. */
const body = (): HTMLElement => {
  const main = screen.getByRole("main");
  const parent = main.parentElement;
  if (parent === null) throw new Error("the grid pane has no body around it");
  return parent;
};

describe("the Workbench shell", () => {
  it("fills all four regions", () => {
    shell();

    expect(screen.getByText("session strip")).toBeDefined();
    expect(screen.getByText("grid pane")).toBeDefined();
    expect(screen.getByText("legend")).toBeDefined();
    expect(screen.getByText("scrubber")).toBeDefined();
  });

  // The geometry contract in `.claude/rules/ui-theme.md`: one column with the
  // rail underneath below `md`, the 340px rail beside the grid from `md` up.
  // jsdom applies no CSS, so the class names are the only thing a test can
  // see — the same reading `theme.test.ts` takes.
  it("stacks into one column below md and puts the rail beside the grid from md up", () => {
    shell();

    const className = body().className;
    expect(className).toContain("grid-rows-[minmax(0,1fr)_auto]");
    expect(className).toContain("md:grid-cols-[minmax(0,1fr)_340px]");
    expect(className).toContain("md:grid-rows-1");
  });

  it("caps the rail's height below md so the Scrubber stays on screen", () => {
    shell();

    const rail = screen.getByRole("complementary", { name: "Legend and Inspector" });
    expect(rail.className).toContain("max-h-[45vh]");
    expect(rail.className).toContain("overflow-y-auto");
    // Lifted at md, where the rail is a full-height column again.
    expect(rail.className).toContain("md:max-h-none");
  });

  // The narrow layout is CSS alone (ui-theme.md). A shell that had started
  // reading the viewport would need a `matchMedia` stand-in to render here,
  // and every component test that mounts it would need one too.
  it("renders without reading the viewport", () => {
    const seen: string[] = [];
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => {
      seen.push(query);
      return realMatchMedia.call(window, query);
    }) as typeof window.matchMedia;

    try {
      shell();
    } finally {
      window.matchMedia = realMatchMedia;
    }

    expect(seen).toEqual([]);
  });
});
