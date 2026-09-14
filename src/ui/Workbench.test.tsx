// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RailPanel, Workbench } from "./Workbench.tsx";

afterEach(cleanup);

const view = (revealInspector: boolean | undefined) => (
  <Workbench
    grid={<div>grid pane</div>}
    rail={<RailPanel title="Categories">legend</RailPanel>}
    inspector={<div>inspector</div>}
    scrubber={<div>scrubber</div>}
    revealInspector={revealInspector}
  />
);

const shell = (revealInspector: boolean | undefined = undefined) => render(view(revealInspector));

const body = (): HTMLElement => {
  const parent = screen.getByRole("main", { name: "Context grid" }).parentElement;
  if (parent === null) throw new Error("the grid pane has no body around it");
  return parent;
};

const rail = (): HTMLElement =>
  screen.getByRole("complementary", { name: "Legend and Context Window" });

const inspector = (): HTMLElement => screen.getByRole("region", { name: "Inspector" });

const tab = (name: "Legend" | "Inspector" | "Scrubber"): HTMLElement =>
  screen.getByRole("tab", { name });

const controlledPanel = (name: "Legend" | "Inspector" | "Scrubber"): HTMLElement => {
  const id = tab(name).getAttribute("aria-controls");
  const panel = id === null ? null : document.getElementById(id);
  if (panel === null) throw new Error(`${name} controls nothing`);
  return panel;
};

const inspectorBody = (): HTMLElement => {
  const body = Array.from(inspector().children).find((child) =>
    (child as HTMLElement).className.includes("p-3"),
  );
  if (!(body instanceof HTMLElement)) throw new Error("the Inspector has no drawer body");
  return body;
};

describe("the Workbench shell", () => {
  it("fills every region", () => {
    shell();

    expect(screen.getByText("grid pane")).toBeDefined();
    expect(screen.getByText("legend")).toBeDefined();
    expect(screen.getByText("inspector")).toBeDefined();
    expect(screen.getByText("scrubber")).toBeDefined();
  });

  it("keeps one full-height grid below md and lays the other regions around it from md up", () => {
    shell();

    expect(body().className).toContain("grid-cols-[minmax(0,1fr)]");
    expect(body().className).toContain("md:grid-cols-[minmax(0,1fr)_340px]");
    expect(body().className).toContain("md:grid-rows-[minmax(0,1fr)_auto_auto]");

    expect(rail().className).toContain("absolute");
    expect(rail().className).toContain("md:static");
    expect(rail().className).toContain("md:col-start-2");
    expect(inspector().className).toContain("md:col-span-2");
    expect(inspector().className).toContain("md:row-start-2");
    expect(controlledPanel("Scrubber").className).toContain("md:row-start-3");
  });

  it("floors the grid and rail at zero width so their contents cannot widen the page", () => {
    shell();

    expect(screen.getByRole("main", { name: "Context grid" }).className).toContain("min-w-0");
    expect(rail().className).toContain("min-w-0");
  });

  it("caps and scrolls the phone legend pane, then restores the desktop rail", () => {
    shell();

    expect(rail().className).toContain("max-h-[35vh]");
    expect(rail().className).toContain("md:max-h-none");
    expect(rail().querySelector(".overflow-y-auto")).not.toBeNull();
  });

  it("reserves the tab bar's height in the grid's scroll clearance", () => {
    shell();

    expect(body().style.getPropertyValue("--tviz-obscured-bottom")).toBe("36px");
    expect(body().className).toContain("md:[--tviz-obscured-bottom:0px]");
  });

  it("never measures the viewport", () => {
    const seen: string[] = [];
    const realMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => {
      seen.push(query);
      return realMatchMedia.call(window, query);
    }) as typeof window.matchMedia;

    try {
      shell();
      fireEvent.click(tab("Legend"));
    } finally {
      window.matchMedia = realMatchMedia;
    }

    expect(seen).toEqual([]);
  });
});

describe("the phone Info Pane tabs", () => {
  it("starts with every pane lowered", () => {
    shell();

    for (const name of ["Legend", "Inspector", "Scrubber"] as const) {
      expect(tab(name).getAttribute("aria-selected")).toBe("false");
      expect(tab(name).getAttribute("aria-expanded")).toBe("false");
      expect(controlledPanel(name).className).toContain("hidden");
    }
  });

  it("marks the raised tab by joining it to the pane surface", () => {
    shell();

    fireEvent.click(tab("Legend"));
    expect(tab("Legend").className).toContain("bg-ui-sunken");
    expect(tab("Inspector").className).not.toContain("bg-ui-sunken");
  });

  it("raises one pane at a time and lowers the raised pane when tapped again", () => {
    shell();

    fireEvent.click(tab("Legend"));
    expect(rail().className).not.toContain("hidden");
    expect(tab("Legend").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(tab("Inspector"));
    expect(rail().className).toContain("hidden");
    expect(inspector().className).not.toContain("hidden");
    expect(tab("Legend").getAttribute("aria-selected")).toBe("false");
    expect(tab("Inspector").getAttribute("aria-selected")).toBe("true");

    fireEvent.click(tab("Inspector"));
    expect(inspector().className).toContain("hidden");
    expect(tab("Inspector").getAttribute("aria-selected")).toBe("false");
  });

  it("raises the Inspector when the caller reveals it, without reopening it under the reader", () => {
    const { rerender } = shell(false);
    expect(inspector().className).toContain("hidden");

    rerender(view(true));
    expect(inspector().className).not.toContain("hidden");

    fireEvent.click(tab("Inspector"));
    expect(inspector().className).toContain("hidden");

    rerender(view(true));
    expect(inspector().className).toContain("hidden");
  });

  it("raises the Inspector again after the reveal reason clears and returns", () => {
    const { rerender } = shell(false);

    rerender(view(true));
    fireEvent.click(tab("Inspector"));
    expect(inspector().className).toContain("hidden");

    rerender(view(false));
    rerender(view(true));
    expect(inspector().className).not.toContain("hidden");
  });

  it("keeps the tab bar phone-only and points every tab at its pane", () => {
    shell();

    expect(screen.getByRole("tablist", { name: "Info panes" }).className).toContain("md:hidden");
    expect(rail().className).toContain("md:flex");
    expect(inspector().className).toContain("md:block");
    expect(controlledPanel("Scrubber").className).toContain("md:block");

    for (const name of ["Legend", "Inspector", "Scrubber"] as const) {
      expect(tab(name).getAttribute("aria-controls")).toBe(controlledPanel(name).id);
    }
  });
});

describe("the desktop Inspector drawer", () => {
  it("folds to its heading and opens again", () => {
    shell();
    const toggle = screen.getByRole("button", { name: "Inspector" });

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(inspectorBody().className).not.toContain("md:hidden");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(inspectorBody().className).toContain("md:hidden");

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(inspectorBody().className).not.toContain("md:hidden");
  });
});
