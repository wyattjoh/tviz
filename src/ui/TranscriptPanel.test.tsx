// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  emptyCategoryTokens,
  emptyMessageKindTokens,
  type ContextSnapshot,
  type Session,
} from "../domain/context.ts";
import { TranscriptPanel } from "./TranscriptPanel.tsx";

afterEach(cleanup);

const call = (index: number, options: Partial<ContextSnapshot> = {}): ContextSnapshot => ({
  index,
  timestamp: `2026-01-01T10:${String(14 + index * 38).padStart(2, "0")}:00.000Z`,
  model: "claude-sonnet-4-5-20250929",
  measuredTotal: 30_000,
  byCategory: emptyCategoryTokens(),
  byKind: emptyMessageKindTokens(),
  added: [],
  reset: false,
  compaction: false,
  ...options,
});

const session = (calls: readonly ContextSnapshot[]): Session => ({
  id: "fixture-session",
  fileName: "fixture.jsonl",
  model: calls[0]?.model,
  claudeCodeVersion: "2.1.251",
  windowSize: 200_000,
  calls,
  recordCount: 8_203,
  malformedLines: 2,
  unknownRecordTypes: { future_record: 3, another_record: 1 },
  subagentCount: undefined,
});

describe("TranscriptPanel", () => {
  it("summarises the Session and shows context added on the selected API Call", () => {
    const calls = [
      call(0),
      call(1, {
        compaction: true,
        reset: true,
        added: [
          {
            category: "messages",
            kind: "user",
            label: "User message",
            tokens: 1_200,
          },
          {
            category: "messages",
            kind: "assistant",
            label: "Tool use: Read",
            tokens: 340,
          },
          {
            category: "messages",
            kind: "toolResult",
            label: "Tool result",
            tokens: 8_400,
          },
        ],
      }),
    ];

    render(
      <TranscriptPanel
        session={session(calls)}
        snapshot={calls[1] as ContextSnapshot}
        demoNote={undefined}
      />,
    );

    expect(screen.getByText("2 API Calls · 1 Compaction")).toBeDefined();
    expect(screen.getByText(/38m/)).toBeDefined();
    expect(screen.getByText("8,203 records · 2 malformed · 4 unknown")).toBeDefined();

    const selected = screen.getByRole("region", { name: "Selected API Call details" });
    expect(within(selected).getByText("Selected API Call 2 of 2")).toBeDefined();
    expect(within(selected).getByText("claude-sonnet-4-5-20250929")).toBeDefined();
    expect(within(selected).getByText("compaction")).toBeDefined();
    expect(within(selected).getByText("User message")).toBeDefined();
    expect(within(selected).getByText("1.2k")).toBeDefined();
    expect(within(selected).getByText("Tool use: Read")).toBeDefined();
    expect(within(selected).getByText("Tool result")).toBeDefined();
    expect(within(selected).getByText("8.4k")).toBeDefined();
  });

  it("updates the selected API Call details without changing the Session summary", () => {
    const calls = [
      call(0, {
        added: [
          {
            category: "skills",
            kind: undefined,
            label: "Skill listing (3 skills)",
            tokens: 900,
          },
        ],
      }),
      call(1, { model: "claude-opus-4-6" }),
    ];
    const loaded = session(calls);
    const { rerender } = render(
      <TranscriptPanel
        session={loaded}
        snapshot={calls[1] as ContextSnapshot}
        demoNote={undefined}
      />,
    );

    expect(screen.getByText("2 API Calls · 0 Compactions")).toBeDefined();
    expect(screen.getByText("Selected API Call 2 of 2")).toBeDefined();
    expect(screen.getByText("No new context items recorded on this API Call.")).toBeDefined();

    rerender(
      <TranscriptPanel
        session={loaded}
        snapshot={calls[0] as ContextSnapshot}
        demoNote={undefined}
      />,
    );

    expect(screen.getByText("2 API Calls · 0 Compactions")).toBeDefined();
    expect(screen.getByText("Selected API Call 1 of 2")).toBeDefined();
    expect(screen.getByText("Skill listing (3 skills)")).toBeDefined();
    expect(screen.queryByText("No new context items recorded on this API Call.")).toBeNull();
  });

  it("keeps the Demo Session note alongside transcript-derived details", () => {
    const calls = [call(0, { timestamp: undefined, model: undefined })];

    render(
      <TranscriptPanel
        session={session(calls)}
        snapshot={calls[0] as ContextSnapshot}
        demoNote="Synthetic Demo Session data."
      />,
    );

    expect(screen.getByText("1 API Call · 0 Compactions")).toBeDefined();
    expect(screen.getByText("Model not recorded")).toBeDefined();
    expect(screen.getByText("Synthetic Demo Session data.")).toBeDefined();
  });
});
