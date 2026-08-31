// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextWindowMenu, ContextWindowPanel } from "./ContextWindowPanel.tsx";

afterEach(cleanup);

const openMenu = (): void => {
  fireEvent.click(screen.getByRole("button", { name: "Context Window override" }));
};

const choices = (): HTMLElement | null => screen.queryByRole("group", { name: "Context Window" });

describe("ContextWindowPanel", () => {
  it("reads the fill level off the windowSize prop, not the Session's inferred one", () => {
    render(
      <ContextWindowPanel
        measuredTotal={45_000}
        windowSize={1_000_000}
        peak={90_000}
        windowChoice={1_000_000}
      />,
    );

    expect(screen.getByText(/45\.0k \/ 1000\.0k tokens/)).toBeDefined();
    expect(screen.getByText(/4\.5% full/)).toBeDefined();
  });

  it("names the window as inferred or overridden, without the menu being opened", () => {
    const { rerender } = render(
      <ContextWindowPanel
        measuredTotal={45_000}
        windowSize={200_000}
        peak={90_000}
        windowChoice="auto"
      />,
    );

    expect(screen.getByText(/window 200\.0k \(inferred\)/)).toBeDefined();
    // The peak is the Session's high-water mark, so a call below it still says
    // how close the Session ever came to filling the window.
    expect(screen.getByText(/peak 90\.0k/)).toBeDefined();

    rerender(
      <ContextWindowPanel
        measuredTotal={45_000}
        windowSize={1_000_000}
        peak={90_000}
        windowChoice={1_000_000}
      />,
    );

    expect(screen.getByText(/window 1000\.0k \(override\)/)).toBeDefined();
  });
});

describe("ContextWindowMenu", () => {
  it("keeps the choices behind the cog until it is clicked", () => {
    render(<ContextWindowMenu windowChoice="auto" onWindowChoiceChange={vi.fn()} />);

    expect(choices()).toBeNull();
    const cog = screen.getByRole("button", { name: "Context Window override" });
    expect(cog.getAttribute("aria-expanded")).toBe("false");

    openMenu();
    expect(choices()).not.toBeNull();
    expect(cog.getAttribute("aria-expanded")).toBe("true");
  });

  it("marks the selected Context Window choice", () => {
    render(<ContextWindowMenu windowChoice="auto" onWindowChoiceChange={vi.fn()} />);
    openMenu();

    expect(screen.getByRole("button", { name: "auto" }).getAttribute("aria-pressed")).toBe("true");
    expect(choices()?.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });

  it("changes the Context Window override on click, and closes", () => {
    const onWindowChoiceChange = vi.fn();
    render(<ContextWindowMenu windowChoice="auto" onWindowChoiceChange={onWindowChoiceChange} />);
    openMenu();

    fireEvent.click(screen.getByRole("button", { name: "1000.0k" }));

    expect(onWindowChoiceChange).toHaveBeenCalledWith(1_000_000);
    expect(choices()).toBeNull();
  });

  it("closes on Escape and on a click outside, the way the File menu does", () => {
    render(<ContextWindowMenu windowChoice="auto" onWindowChoiceChange={vi.fn()} />);

    openMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(choices()).toBeNull();

    openMenu();
    fireEvent.pointerDown(document.body);
    expect(choices()).toBeNull();
  });
});
