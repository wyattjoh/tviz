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

/**
 * A Session with three API Calls and a distinct id/model/version, so the
 * strip's id, model, version, call index and timestamp can each be pinned
 * against a value nothing else in the fixture could produce by accident.
 */
const identifiableSession: Session = {
  id: "00000000-0000-4000-8000-00000000ab12",
  fileName: "session-b.jsonl",
  model: "claude-opus-4-9",
  claudeCodeVersion: "2.1.140",
  windowSize: 200_000,
  calls: [
    { ...snapshot, index: 0 },
    { ...snapshot, index: 1 },
    { ...snapshot, index: 2, timestamp: "2026-01-15T09:30:00.000Z" },
  ],
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
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
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "1000.0k" }));
    expect(onWindowChoiceChange).toHaveBeenCalledWith(1_000_000);
  });

  it("carries the Session's id, model, CC version, call index and timestamp", () => {
    render(
      <SessionHeader
        session={identifiableSession}
        snapshot={identifiableSession.calls[2] as ContextSnapshot}
        windowSize={200_000}
        windowChoice="auto"
        onWindowChoiceChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const strip = screen.getByRole("region", { name: "Session" });
    expect(strip.textContent).toContain(identifiableSession.id);
    expect(strip.textContent).toContain("claude-opus-4-9");
    expect(strip.textContent).toContain("cc 2.1.140");
    // Call index is 1-based against the total ("call 3/3"), not the raw
    // zero-based `ContextSnapshot.index` a reader would have to decode.
    expect(strip.textContent).toContain("call 3");
    expect(strip.textContent).toContain("/3");
    expect(strip.textContent).toContain(new Date("2026-01-15T09:30:00.000Z").toLocaleString());
  });

  it("falls back to an em dash rather than blanking the row when a Call has no timestamp", () => {
    render(
      <SessionHeader
        session={identifiableSession}
        snapshot={identifiableSession.calls[0] as ContextSnapshot}
        windowSize={200_000}
        windowChoice="auto"
        onWindowChoiceChange={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const strip = screen.getByRole("region", { name: "Session" });
    expect(strip.textContent).toContain("call 1");
    expect(strip.textContent).toContain("—");
  });

  it("closes this Session, and only this one, when the close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <SessionHeader
        session={session}
        snapshot={snapshot}
        windowSize={200_000}
        windowChoice="auto"
        onWindowChoiceChange={vi.fn()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
