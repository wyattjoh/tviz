// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type ContextSnapshot,
  emptyCategoryTokens,
  emptyMessageKindTokens,
  type Session,
} from "../domain/context.ts";
import { SessionHeader } from "./SessionHeader.tsx";

afterEach(cleanup);

const snapshot: ContextSnapshot = {
  index: 0,
  timestamp: undefined,
  model: "claude-sonnet-5",
  measuredTotal: 45_000,
  byCategory: emptyCategoryTokens(),
  byKind: emptyMessageKindTokens(),
  added: [],
  reset: false,
};

const session: Session = {
  id: "s1",
  fileName: "session-a.jsonl",
  model: "claude-sonnet-5",
  claudeCodeVersion: "2.1.251",
  windowSize: 200_000,
  calls: [snapshot],
  recordCount: 10,
  malformedLines: 0,
  unknownRecordTypes: {},
  subagentCount: undefined,
};

describe("SessionHeader", () => {
  it("reads the fill level off the windowSize prop, not the Session's inferred one", () => {
    render(
      <SessionHeader
        session={session}
        snapshot={snapshot}
        windowSize={1_000_000}
        windowChoice={1_000_000}
        onWindowChoiceChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    expect(screen.getByText(/45\.0k \/ 1000\.0k tokens/)).toBeDefined();
  });

  it("marks the selected Context Window choice", () => {
    render(
      <SessionHeader
        session={session}
        snapshot={snapshot}
        windowSize={200_000}
        windowChoice="auto"
        onWindowChoiceChange={vi.fn()}
        onClear={vi.fn()}
      />,
    );

    const group = screen.getByRole("group", { name: "Context Window" });
    expect(screen.getByRole("button", { name: "auto" }).getAttribute("aria-pressed")).toBe("true");
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });

  it("changes the Context Window override on click", () => {
    const onWindowChoiceChange = vi.fn();
    render(
      <SessionHeader
        session={session}
        snapshot={snapshot}
        windowSize={200_000}
        windowChoice="auto"
        onWindowChoiceChange={onWindowChoiceChange}
        onClear={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1000.0k" }));
    expect(onWindowChoiceChange).toHaveBeenCalledWith(1_000_000);
  });
});
