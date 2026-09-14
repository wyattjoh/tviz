// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NARROW_VIEWPORT_QUERY } from "./viewport.ts";
import { RailPanel, Workbench } from "./Workbench.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/**
 * Puts the viewport on one side of the `md` breakpoint.
 *
 * Stubs `matchMedia` rather than the `isNarrowViewport` module export, so the
 * real query string and the real guard are both on the path under test.
 */
const viewportIsNarrow = (narrow: boolean): void => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: narrow && query === NARROW_VIEWPORT_QUERY,
    media: query,
  }));
};

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

  // The shell's geometry is CSS alone; the one viewport read is a panel's
  // *initial* fold, which CSS cannot express because folding unmounts the body.
  it("reads the viewport only to seed a panel's initial fold", () => {
    const seen: string[] = [];
    vi.stubGlobal("matchMedia", (query: string) => {
      seen.push(query);
      return { matches: false, media: query };
    });

    shell();

    // One read, for the one collapsible panel the shell was given — and no
    // listener, which is what keeps a rotation from re-folding an open panel.
    expect(seen).toEqual([NARROW_VIEWPORT_QUERY]);
  });
});

describe("a rail panel's initial fold", () => {
  const renderPanelAt = (narrow: boolean, collapsible = true) => {
    viewportIsNarrow(narrow);
    return render(
      <RailPanel title="Categories" collapsible={collapsible}>
        legend
      </RailPanel>,
    );
  };

  it("mounts open on a wide window", () => {
    renderPanelAt(false);

    expect(screen.getByText("legend")).toBeDefined();
    expect(screen.getByRole("button", { name: /Categories/ }).getAttribute("aria-expanded")).toBe(
      "true",
    );
  });

  // Four open panels in a rail stacked under the grid push the Scrubber off a
  // phone screen, which is the height cap's whole job.
  it("mounts folded on a narrow one, body unmounted rather than hidden", () => {
    renderPanelAt(true);

    expect(screen.queryByText("legend")).toBeNull();
    expect(screen.getByRole("button", { name: /Categories/ }).getAttribute("aria-expanded")).toBe(
      "false",
    );
  });

  it("stays open once the reader opens it", () => {
    renderPanelAt(true);

    fireEvent.click(screen.getByRole("button", { name: /Categories/ }));

    expect(screen.getByText("legend")).toBeDefined();
  });

  // The pinned Inspector. Folding the only panel in the rail would leave an
  // empty rail under a lone heading row.
  it("ignores the viewport when the panel cannot be collapsed", () => {
    renderPanelAt(true, false);

    expect(screen.getByText("legend")).toBeDefined();
    expect(screen.queryByRole("button", { name: /Categories/ })).toBeNull();
  });
});
