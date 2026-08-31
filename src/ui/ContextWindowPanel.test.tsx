// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ContextWindowPanel } from "./ContextWindowPanel.tsx";

afterEach(cleanup);

describe("ContextWindowPanel", () => {
  it("reads the fill level off the windowSize prop, not the Session's inferred one", () => {
    render(
      <ContextWindowPanel
        measuredTotal={45_000}
        windowSize={1_000_000}
        peak={90_000}
        windowChoice={1_000_000}
        onWindowChoiceChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/45\.0k \/ 1000\.0k tokens/)).toBeDefined();
    expect(screen.getByText(/4\.5% full/)).toBeDefined();
  });

  it("names the window as inferred or overridden, beside the control that sets it", () => {
    const { rerender } = render(
      <ContextWindowPanel
        measuredTotal={45_000}
        windowSize={200_000}
        peak={90_000}
        windowChoice="auto"
        onWindowChoiceChange={vi.fn()}
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
        onWindowChoiceChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/window 1000\.0k \(override\)/)).toBeDefined();
  });

  it("marks the selected Context Window choice", () => {
    render(
      <ContextWindowPanel
        measuredTotal={45_000}
        windowSize={200_000}
        peak={90_000}
        windowChoice="auto"
        onWindowChoiceChange={vi.fn()}
      />,
    );

    const group = screen.getByRole("group", { name: "Context Window" });
    expect(screen.getByRole("button", { name: "auto" }).getAttribute("aria-pressed")).toBe("true");
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });

  it("changes the Context Window override on click", () => {
    const onWindowChoiceChange = vi.fn();
    render(
      <ContextWindowPanel
        measuredTotal={45_000}
        windowSize={200_000}
        peak={90_000}
        windowChoice="auto"
        onWindowChoiceChange={onWindowChoiceChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1000.0k" }));
    expect(onWindowChoiceChange).toHaveBeenCalledWith(1_000_000);
  });
});
