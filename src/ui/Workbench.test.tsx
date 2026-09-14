// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RailPanel, Workbench } from "./Workbench.tsx";

afterEach(() => {
  cleanup();
});

const railToggle = (): HTMLElement => screen.getByRole("button", { name: "Legend and inspector" });

const rail = (): HTMLElement => screen.getByRole("complementary", { name: "Legend and Inspector" });

const scrubberToggle = (): HTMLElement => screen.getByRole("button", { name: "Scrubber" });

/** The wrapper the Scrubber's disclosure hides, found via the toggle. */
const scrubberPanel = (): HTMLElement => {
  const id = scrubberToggle().getAttribute("aria-controls");
  const panel = id === null ? null : document.getElementById(id);
  if (panel === null) throw new Error("the Scrubber toggle controls nothing");
  return panel;
};

const shell = (revealRail?: boolean) =>
  render(
    <Workbench
      header={<div>session strip</div>}
      grid={<div>grid pane</div>}
      rail={<RailPanel title="Categories">legend</RailPanel>}
      scrubber={<div>scrubber</div>}
      revealRail={revealRail}
    />,
  );

const rerenderShell = (rerender: (ui: React.ReactElement) => void, revealRail: boolean): void => {
  rerender(
    <Workbench
      header={<div>session strip</div>}
      grid={<div>grid pane</div>}
      rail={<RailPanel title="Categories">legend</RailPanel>}
      scrubber={<div>scrubber</div>}
      revealRail={revealRail}
    />,
  );
};

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
    // Three rows below md — grid, the disclosure toggle, the rail — collapsing
    // to a single row at md, where the rail is a column instead.
    expect(className).toContain("grid-rows-[minmax(0,1fr)_auto_auto]");
    expect(className).toContain("md:grid-cols-[minmax(0,1fr)_340px]");
    expect(className).toContain("md:grid-rows-1");
  });

  // A grid's implicit column is `auto`, which floors at its items' min-content
  // — one unbreakable string then widens the track past the viewport and
  // scrolls the page sideways. The `md:` track list always carried the
  // `minmax(0,1fr)` floor; the narrow layout has to carry it too.
  it("floors both regions at zero width so nothing inside can widen the page", () => {
    shell();

    expect(body().className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(screen.getByRole("main").className).toContain("min-w-0");
    expect(screen.getByRole("complementary", { name: "Legend and Inspector" }).className).toContain(
      "min-w-0",
    );
  });

  it("caps the rail's height below md so the Scrubber stays on screen", () => {
    shell();

    const rail = screen.getByRole("complementary", { name: "Legend and Inspector" });
    expect(rail.className).toContain("max-h-[45vh]");
    expect(rail.className).toContain("overflow-y-auto");
    // Lifted at md, where the rail is a full-height column again.
    expect(rail.className).toContain("md:max-h-none");
  });

  // Which layout is on screen is decided by media queries, never measured. A
  // shell that started reading the viewport would need a `matchMedia`
  // stand-in here, and so would every component test that mounts it.
  it("never measures the viewport", () => {
    const seen: string[] = [];
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => {
      seen.push(query);
      return realMatchMedia.call(window, query);
    }) as typeof window.matchMedia;

    try {
      shell();
      fireEvent.click(railToggle());
    } finally {
      window.matchMedia = realMatchMedia;
    }

    expect(seen).toEqual([]);
  });
});

describe("the rail disclosure", () => {
  // jsdom applies no CSS, so `hidden` and `md:block` are class names here
  // rather than a computed layout — the same reading `theme.test.ts` takes.
  // What the test can check for real is the toggle's state and its wiring.
  it("starts closed and says so", () => {
    shell();

    expect(railToggle().getAttribute("aria-expanded")).toBe("false");
    expect(rail().className).toContain("hidden");
  });

  it("opens on click and closes again", () => {
    shell();

    fireEvent.click(railToggle());
    expect(railToggle().getAttribute("aria-expanded")).toBe("true");
    expect(rail().className).not.toContain("hidden");

    fireEvent.click(railToggle());
    expect(railToggle().getAttribute("aria-expanded")).toBe("false");
    expect(rail().className).toContain("hidden");
  });

  // Pinning a Cell hands the rail to the Inspector, and a phone has no hover,
  // so pin is the only gesture that fills it. Landing that in a closed
  // disclosure makes the tap look like it did nothing.
  it("opens when the caller reveals it", () => {
    const { rerender } = shell(false);
    expect(rail().className).toContain("hidden");

    rerenderShell(rerender, true);

    expect(rail().className).not.toContain("hidden");
    expect(railToggle().getAttribute("aria-expanded")).toBe("true");
  });

  // The reader is allowed to close it again; re-opening under them would be
  // the shell arguing back.
  it("stays closed if the reader closes it while the reason still holds", () => {
    const { rerender } = shell(false);
    rerenderShell(rerender, true);

    fireEvent.click(railToggle());
    expect(rail().className).toContain("hidden");

    // Still revealed, still closed: the effect keys on the transition.
    rerenderShell(rerender, true);
    expect(rail().className).toContain("hidden");
  });

  // `md:block` is what keeps the disclosure phone-only: the same element is
  // the rail column on a wide window, so a closed toggle cannot hide it there.
  it("is a phone-only affordance", () => {
    shell();

    expect(rail().className).toContain("md:block");
    expect(railToggle().className).toContain("md:hidden");
  });

  // `display: none` rather than a translate or a zero height, so the rail's
  // controls leave the tab order without an `inert` to undo at `md`.
  it("points the toggle at the rail it controls", () => {
    shell();

    expect(railToggle().getAttribute("aria-controls")).toBe(rail().getAttribute("id"));
    expect(rail().getAttribute("id")).toBeTruthy();
  });
});

describe("the Scrubber disclosure", () => {
  // ~180px of chart and transport, the largest single thing competing with the
  // grid for a phone's height.
  it("starts closed below md and is a phone-only affordance", () => {
    shell();

    expect(scrubberToggle().getAttribute("aria-expanded")).toBe("false");
    expect(scrubberPanel().className).toContain("hidden");
    expect(scrubberPanel().className).toContain("md:block");
    expect(scrubberToggle().className).toContain("md:hidden");
  });

  it("opens on click and closes again", () => {
    shell();

    fireEvent.click(scrubberToggle());
    expect(scrubberToggle().getAttribute("aria-expanded")).toBe("true");
    expect(scrubberPanel().className).not.toContain("hidden");

    fireEvent.click(scrubberToggle());
    expect(scrubberPanel().className).toContain("hidden");
  });

  // The landing preview sells the tool by letting a visitor watch the chart
  // track the grid, so it opts out of the disclosure at every width.
  it("has no disclosure at all when the caller asks for it always visible", () => {
    render(
      <Workbench
        header={<div>session strip</div>}
        grid={<div>grid pane</div>}
        rail={<RailPanel title="Categories">legend</RailPanel>}
        scrubber={<div>scrubber</div>}
        scrubberAlwaysVisible
      />,
    );

    expect(screen.getByText("scrubber")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Scrubber" })).toBeNull();
  });
});
