import { beforeEach, describe, expect, it } from "vitest";
import {
  CATEGORY_ORDER,
  type ContextItem,
  type ContextSnapshot,
  cumulativeItems,
  MESSAGE_KIND_ORDER,
  type Session,
} from "../domain/context.ts";
import * as Fixture from "../fixtures/transcript.ts";
import { parseTranscript } from "./parse-transcript.ts";
import { DEFAULT_CONTEXT_WINDOW, LARGE_CONTEXT_WINDOW } from "./window.ts";

const parseSession = (
  records: readonly Fixture.FixtureRecord[],
  fileName = "fixture.jsonl",
): Session => {
  const outcome = parseTranscript(fileName, Fixture.toJsonl(records));
  if (!outcome.ok) throw new Error(`expected a Session, got: ${outcome.message}`);
  return outcome.session;
};

const categoryTotal = (snapshot: ContextSnapshot): number =>
  CATEGORY_ORDER.reduce((sum, category) => sum + snapshot.byCategory[category], 0);

const kindTotal = (snapshot: ContextSnapshot): number =>
  MESSAGE_KIND_ORDER.reduce((sum, kind) => sum + snapshot.byKind[kind], 0);

const labels = (snapshot: ContextSnapshot): readonly string[] =>
  snapshot.added.map((item) => item.label);

const itemsOf = (session: Session, index: number): readonly ContextItem[] =>
  cumulativeItems(session.calls, index);

const itemTotal = (session: Session, index: number): number =>
  itemsOf(session, index).reduce((sum, item) => sum + item.tokens, 0);

beforeEach(() => {
  Fixture.resetFixtureSequence();
});

describe("parseTranscript", () => {
  it("reports the measured total of every API Call as input + cache read + cache creation", () => {
    const session = parseSession([
      Fixture.userMessage(400),
      Fixture.assistantMessage({
        id: "m1",
        usage: { input: 7, cacheRead: 12_000, cacheCreation: 993 },
      }),
      Fixture.userMessage(800),
      Fixture.assistantMessage({
        id: "m2",
        usage: { input: 11, cacheRead: 13_000, cacheCreation: 1_489 },
      }),
    ]);

    expect(session.calls.map((call) => call.measuredTotal)).toEqual([13_000, 14_500]);
    expect(session.calls.at(-1)?.measuredTotal).toBe(14_500);
  });

  it("keeps the Category totals summing to the measured total on every API Call", () => {
    const session = parseSession([
      Fixture.skillListing(9_000),
      Fixture.agentListing(1_500),
      Fixture.nestedMemory(3_000),
      Fixture.mcpInstructions(700),
      Fixture.deferredTools(500),
      Fixture.otherAttachment("hook_success", 300),
      Fixture.userMessage(2_000),
      Fixture.assistantMessage({
        id: "m1",
        usage: { input: 4, cacheRead: 18_000, cacheCreation: 2_996 },
        textCharacters: 600,
        toolUse: "Read",
      }),
      Fixture.toolResult(40_000),
      Fixture.assistantMessage({
        id: "m2",
        usage: { input: 9, cacheRead: 21_000, cacheCreation: 9_991 },
        textCharacters: 300,
      }),
      Fixture.reminderMessage(1_200),
      Fixture.assistantMessage({
        id: "m3",
        usage: { input: 3, cacheRead: 31_500, cacheCreation: 497 },
      }),
    ]);

    expect(session.calls).toHaveLength(3);
    for (const call of session.calls) {
      expect(categoryTotal(call)).toBe(call.measuredTotal);
      expect(kindTotal(call)).toBe(call.byCategory.messages);
    }
  });

  it("gives the first API Call's leftover to System", () => {
    const session = parseSession([
      // 4000 characters of skill listing ≈ 1000 Estimated Tokens.
      Fixture.skillListing(4_000),
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 12_000 } }),
    ]);

    const first = session.calls[0];
    expect(first?.byCategory.skills).toBe(1_000);
    expect(first?.byCategory.system).toBe(11_000);
  });

  it("floors System at zero when the logged parts already exceed the first measured total", () => {
    const session = parseSession([
      Fixture.skillListing(40_000),
      Fixture.nestedMemory(40_000),
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 5_000 } }),
    ]);

    const first = session.calls[0];
    expect(first?.byCategory.system).toBe(0);
    expect(categoryTotal(first as ContextSnapshot)).toBe(5_000);
  });

  it("treats consecutive assistant Records sharing one message.id as a single API Call", () => {
    const session = parseSession([
      Fixture.userMessage(400),
      Fixture.assistantMessage({
        id: "m1",
        usage: { cacheRead: 10_000 },
        thinkingCharacters: 4_000,
        textCharacters: 200,
      }),
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 10_000 }, toolUse: "Bash" }),
      Fixture.toolResult(4_000),
      Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 12_000 } }),
    ]);

    expect(session.calls).toHaveLength(2);
    expect(session.calls[0]?.measuredTotal).toBe(10_000);
    // The tool_use block of the second Record still enters the next API Call.
    expect(labels(session.calls[1] as ContextSnapshot)).toContain("Tool use: Bash");
  });

  it("excludes thinking blocks, which are never re-sent", () => {
    const session = parseSession([
      Fixture.assistantMessage({
        id: "m1",
        usage: { cacheRead: 10_000 },
        thinkingCharacters: 40_000,
      }),
      Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 10_000 } }),
    ]);

    expect(session.calls[1]?.byKind.assistant).toBe(0);
    expect(labels(session.calls[1] as ContextSnapshot)).not.toContain("thinking");
  });

  it("maps each attachment kind to its Category", () => {
    const session = parseSession([
      Fixture.skillListing(4_000),
      Fixture.agentListing(4_000),
      Fixture.nestedMemory(4_000),
      Fixture.mcpInstructions(2_000),
      Fixture.deferredTools(2_000),
      Fixture.otherAttachment("total_tokens_reminder", 400),
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 40_000 } }),
    ]);

    const first = session.calls[0] as ContextSnapshot;
    expect(first.byCategory.skills).toBe(1_000);
    expect(first.byCategory.customAgents).toBe(1_000);
    expect(first.byCategory.memoryFiles).toBe(1_000);
    expect(first.byCategory.mcp).toBe(1_000);
    expect(first.byKind.reminder).toBeGreaterThan(0);
    expect(first.byCategory.messages).toBe(first.byKind.reminder);
  });

  it("splits Messages into User, Assistant, Tool Result and Reminder", () => {
    const session = parseSession([
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 10_000 } }),
      Fixture.userMessage(4_000),
      Fixture.reminderMessage(4_000),
      Fixture.toolResult(4_000),
      Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 14_000 }, textCharacters: 4_000 }),
      Fixture.assistantMessage({ id: "m3", usage: { cacheRead: 16_000 } }),
    ]);

    const last = session.calls.at(-1) as ContextSnapshot;
    for (const kind of MESSAGE_KIND_ORDER) {
      expect(last.byKind[kind]).toBeGreaterThan(0);
    }
  });

  it("counts unknown Record types and malformed lines instead of failing", () => {
    const jsonl = [
      JSON.stringify(Fixture.metadataRecord("system")),
      "{ not json",
      JSON.stringify(Fixture.metadataRecord("file-history-snapshot")),
      JSON.stringify(Fixture.metadataRecord("system")),
      JSON.stringify(Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 10_000 } })),
    ].join("\n");

    const outcome = parseTranscript("fixture.jsonl", jsonl);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.session.malformedLines).toBe(1);
    expect(outcome.session.unknownRecordTypes).toEqual({ system: 2, "file-history-snapshot": 1 });
    expect(outcome.session.calls).toHaveLength(1);
  });

  it("reports an error for an empty file", () => {
    const outcome = parseTranscript("empty.jsonl", "   \n\n");
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("empty");
    expect(outcome.message).toContain("empty.jsonl");
  });

  it("reports an error for a file that holds no API Calls", () => {
    const outcome = parseTranscript(
      "notes.jsonl",
      "hello, this is not a transcript\nnor is this\n",
    );
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.reason).toBe("notATranscript");
    expect(outcome.message).toContain("notes.jsonl");
  });

  describe("Context Snapshot items", () => {
    it("carries every item in the window, in the order it entered, summing to the measured total", () => {
      const session = parseSession([
        Fixture.skillListing(8_000),
        Fixture.nestedMemory(4_000),
        Fixture.userMessage(2_000),
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 40_000 } }),
      ]);

      const first = session.calls[0] as ContextSnapshot;
      expect(itemsOf(session, 0).map((entry) => entry.category)).toEqual([
        "system",
        "skills",
        "memoryFiles",
        "messages",
      ]);
      expect(itemTotal(session, 0)).toBe(first.measuredTotal);
    });

    it("extends the previous API Call's items rather than re-ordering them", () => {
      const session = parseSession([
        Fixture.skillListing(8_000),
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 40_000 } }),
        Fixture.toolResult(20_000),
        Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 55_000 } }),
        // A Skill loading mid-Session appends; it does not jump ahead of the
        // Messages already in the window (ADR-0006).
        Fixture.skillListing(6_000),
        Fixture.assistantMessage({ id: "m3", usage: { cacheRead: 62_000 } }),
      ]);

      let previous: readonly ContextItem[] = [];
      for (const call of session.calls) {
        expect(call.reset).toBe(false);
        const items = itemsOf(session, call.index);
        expect(items.slice(0, previous.length)).toEqual(previous);
        expect(itemTotal(session, call.index)).toBe(call.measuredTotal);
        previous = items;
      }

      expect(itemsOf(session, session.calls.length - 1).map((entry) => entry.category)).toEqual([
        "system",
        "skills",
        "messages",
        "skills",
      ]);
    });

    it("replaces the items on a compaction, keeping System at the front", () => {
      const session = parseSession([
        Fixture.skillListing(8_000),
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 40_000 } }),
        Fixture.toolResult(120_000),
        Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 90_000 } }),
        Fixture.compactSummary(6_000),
        Fixture.assistantMessage({ id: "m3", usage: { cacheRead: 45_000 } }),
      ]);

      const compacted = session.calls[2] as ContextSnapshot;
      expect(compacted.reset).toBe(true);
      expect(itemsOf(session, 2).length).toBeLessThan(itemsOf(session, 1).length);
      expect(itemsOf(session, 2).map((entry) => entry.category)).toEqual(["system", "messages"]);
      expect(itemTotal(session, 2)).toBe(compacted.measuredTotal);
    });

    it("leaves out an item scaling left with no tokens", () => {
      const session = parseSession([
        Fixture.skillListing(4_000),
        // Too small to win a token once the delta is split.
        Fixture.mcpInstructions(1),
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 12_000 } }),
        Fixture.userMessage(400_000),
        Fixture.mcpInstructions(1),
        Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 12_002 } }),
      ]);

      const second = session.calls[1] as ContextSnapshot;
      expect(second.added.some((entry) => entry.tokens === 0)).toBe(true);
      expect(itemsOf(session, 1).every((entry) => entry.tokens > 0)).toBe(true);
      expect(itemTotal(session, 1)).toBe(second.measuredTotal);
    });

    it("keeps a Session linear in the number of API Calls", () => {
      // A cumulative copy of the items on every Context Snapshot is quadratic:
      // it is what makes a 13 MB transcript freeze the tab when the Worker
      // structured-clones the Session back to the page. Four times the API
      // Calls must not cost anywhere near sixteen times the Session.
      const sessionOf = (callCount: number): Session =>
        parseSession(
          Array.from({ length: callCount }, (_unused, call) => [
            Fixture.userMessage(400),
            Fixture.assistantMessage({
              id: `m${call}`,
              usage: { cacheRead: 10_000 + call * 100 },
            }),
          ]).flat(),
        );

      const small = JSON.stringify(sessionOf(50)).length;
      const large = JSON.stringify(sessionOf(200)).length;

      expect(large).toBeLessThan(small * 6);
    });
  });

  describe("Context Window inference", () => {
    it("defaults to 200k", () => {
      const session = parseSession([
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 10_000 } }),
      ]);
      expect(session.windowSize).toBe(DEFAULT_CONTEXT_WINDOW);
    });

    it("uses 1M for the Claude 5 family", () => {
      const session = parseSession([
        Fixture.assistantMessage({
          id: "m1",
          model: "claude-opus-5-20260401",
          usage: { cacheRead: 10_000 },
        }),
      ]);
      expect(session.windowSize).toBe(LARGE_CONTEXT_WINDOW);
    });

    it("uses 1M for a [1m] model id", () => {
      const session = parseSession([
        Fixture.assistantMessage({
          id: "m1",
          model: "claude-sonnet-4-5-20250929[1m]",
          usage: { cacheRead: 10_000 },
        }),
      ]);
      expect(session.windowSize).toBe(LARGE_CONTEXT_WINDOW);
    });

    it("bumps to 1M when a measured total exceeds 200k", () => {
      const session = parseSession([
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 210_000 } }),
      ]);
      expect(session.windowSize).toBe(LARGE_CONTEXT_WINDOW);
    });
  });

  describe("compaction", () => {
    it("resets every Category but System when the context shrinks", () => {
      const session = parseSession([
        Fixture.skillListing(4_000),
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 50_000 } }),
        Fixture.toolResult(200_000),
        Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 120_000 } }),
        Fixture.compactSummary(8_000),
        Fixture.assistantMessage({ id: "m3", usage: { cacheRead: 55_000 } }),
      ]);

      const compacted = session.calls[2] as ContextSnapshot;
      expect(compacted.reset).toBe(true);
      expect(compacted.byCategory.system).toBe(session.calls[0]?.byCategory.system);
      expect(compacted.byCategory.skills).toBe(0);
      expect(categoryTotal(compacted)).toBe(compacted.measuredTotal);
      expect(session.calls[1]?.reset).toBe(false);
    });

    it("resets on an isCompactSummary Record even when the total grew", () => {
      const session = parseSession([
        Fixture.skillListing(4_000),
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 50_000 } }),
        Fixture.compactSummary(8_000),
        Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 60_000 } }),
      ]);

      const compacted = session.calls[1] as ContextSnapshot;
      expect(compacted.reset).toBe(true);
      expect(compacted.byCategory.skills).toBe(0);
      expect(categoryTotal(compacted)).toBe(compacted.measuredTotal);
    });
  });

  describe("Subagent Sessions", () => {
    it("leaves inlined Subagent Session Records out of the parent's API Calls", () => {
      const session = parseSession([
        Fixture.userMessage(400),
        Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 10_000 } }),
        Fixture.sidechain(Fixture.userMessage(4_000)),
        Fixture.sidechain(Fixture.assistantMessage({ id: "sub1", usage: { cacheRead: 90_000 } })),
        Fixture.userMessage(800),
        Fixture.assistantMessage({ id: "m2", usage: { cacheRead: 12_000 } }),
      ]);

      expect(session.calls.map((call) => call.measuredTotal)).toEqual([10_000, 12_000]);
      expect(session.calls.at(-1)?.measuredTotal).toBe(12_000);
    });

    it("parses a transcript made entirely of Subagent Session Records on its own terms", () => {
      const session = parseSession(
        [
          Fixture.sidechain(Fixture.userMessage(400)),
          Fixture.sidechain(Fixture.assistantMessage({ id: "sub1", usage: { cacheRead: 9_000 } })),
        ],
        "agent-1.jsonl",
      );

      expect(session.calls).toHaveLength(1);
      expect(session.calls[0]?.measuredTotal).toBe(9_000);
    });
  });

  it("carries the Session identity through", () => {
    const session = parseSession(
      [Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 10_000 } })],
      "session-a.jsonl",
    );

    expect(session.fileName).toBe("session-a.jsonl");
    expect(session.claudeCodeVersion).toBe("2.1.251");
    expect(session.model).toBe("claude-sonnet-4-5-20250929");
    // A single dropped file has no sidecar `subagents/` directory to count.
    expect(session.subagentCount).toBeUndefined();
  });
});
