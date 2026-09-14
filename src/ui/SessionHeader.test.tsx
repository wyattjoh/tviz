// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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
  compaction: false,
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
 * A Session with a distinct id/model/version, so the header's static identity
 * can be pinned against values nothing else in the fixture produces.
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
  it("carries static identity and leaves the Session menu at the right edge", () => {
    render(
      <SessionHeader
        session={identifiableSession}
        sessionMenu={<button type="button">{identifiableSession.fileName}</button>}
      />,
    );

    const details = screen.getByRole("region", { name: "Session" });
    expect(details.textContent).toContain(identifiableSession.id);
    expect(details.textContent).toContain("claude-opus-4-9");
    expect(details.textContent).toContain("cc 2.1.140");
    expect(details.lastElementChild?.textContent).toBe(identifiableSession.fileName);
  });

  it("leaves API Call state and close actions out of the header", () => {
    render(
      <SessionHeader
        session={session}
        sessionMenu={<button type="button">{session.fileName}</button>}
      />,
    );

    const details = screen.getByRole("region", { name: "Session" });
    expect(details.textContent).not.toContain("call 1/1");
    expect(screen.queryByRole("button", { name: /close/i })).toBeNull();
  });
});
