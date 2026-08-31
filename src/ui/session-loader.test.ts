// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Fixture from "../fixtures/transcript.ts";
import { parseTranscript } from "../parser/parse-transcript.ts";
import { useSessionLoader } from "./session-loader.ts";

// jsdom has no Web Worker, so the client is stubbed with the parser it runs —
// the same seam App.test.tsx crosses for a single dropped file.
vi.mock("../worker/parse-client.ts", () => ({
  parseTranscriptFile: async (file: File) => parseTranscript(file.name, await file.text()),
}));

beforeEach(() => {
  Fixture.resetFixtureSequence();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const transcriptFile = (name: string, sessionId?: string): File => {
  Fixture.setFixtureSessionId(sessionId);
  const text = Fixture.toJsonl([
    Fixture.userMessage(1_000),
    Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 5_000 } }),
  ]);
  Fixture.setFixtureSessionId(undefined);
  return new File([text], name, { type: "application/jsonl" });
};

const notATranscriptFile = (name: string): File =>
  new File(["hello\n"], name, { type: "text/plain" });

describe("useSessionLoader", () => {
  it("starts empty and adds nothing until entries are queued", () => {
    const { result } = renderHook(() => useSessionLoader());

    expect(result.current.sessions).toEqual([]);
    expect(result.current.pending).toEqual([]);
    expect(result.current.selectedId).toBeUndefined();
  });

  it("parses a queued transcript and selects it", async () => {
    const { result } = renderHook(() => useSessionLoader());
    const file = transcriptFile("00000000-0000-4000-8000-000000000000.jsonl");

    act(() => {
      result.current.addEntries([{ file, path: file.name }]);
    });
    expect(result.current.pending).toEqual([{ path: file.name, fileName: file.name }]);

    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.pending).toEqual([]);
    expect(result.current.selectedId).toBe(result.current.sessions[0]?.id);
  });

  it("records a per-file error without losing an already-loaded Session", async () => {
    const { result } = renderHook(() => useSessionLoader());
    const good = transcriptFile("good.jsonl");
    const bad = notATranscriptFile("bad.jsonl");

    act(() => {
      result.current.addEntries([
        { file: good, path: good.name },
        { file: bad, path: bad.name },
      ]);
    });

    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    await waitFor(() => expect(result.current.errors).toHaveLength(1));
    expect(result.current.errors[0]?.fileName).toBe("bad.jsonl");
    expect(result.current.pending).toEqual([]);
  });

  it("merges a Subagent Session count onto its parent regardless of discovery order", async () => {
    const { result } = renderHook(() => useSessionLoader());
    const parentId = "00000000-0000-4000-8000-000000000000";
    const parent = transcriptFile(`${parentId}.jsonl`);
    const sidecarA = transcriptFile("agent-1.jsonl");
    const sidecarB = transcriptFile("agent-2.jsonl");

    act(() => {
      // The sidecars arrive in the same batch as their parent, as a real
      // folder drop would deliver them.
      result.current.addEntries([
        { file: sidecarA, path: `${parentId}/subagents/agent-1.jsonl` },
        { file: parent, path: parent.name },
        { file: sidecarB, path: `${parentId}/subagents/agent-2.jsonl` },
      ]);
    });

    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.sessions[0]?.subagentCount).toBe(2);
  });

  it("closeAll discards every Session, pending parse, and error", async () => {
    const { result } = renderHook(() => useSessionLoader());
    const file = transcriptFile("session-a.jsonl");

    act(() => {
      result.current.addEntries([{ file, path: file.name }]);
    });
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    act(() => {
      result.current.closeAll();
    });

    expect(result.current.sessions).toEqual([]);
    expect(result.current.selectedId).toBeUndefined();
  });

  it("ignores a parse that resolves after closeAll", async () => {
    const { result } = renderHook(() => useSessionLoader());
    const file = transcriptFile("session-a.jsonl");

    act(() => {
      result.current.addEntries([{ file, path: file.name }]);
    });
    act(() => {
      result.current.closeAll();
    });

    await waitFor(() => expect(result.current.pending).toEqual([]));
    expect(result.current.sessions).toEqual([]);
  });

  it("switches the selected Session", async () => {
    const { result } = renderHook(() => useSessionLoader());
    const first = transcriptFile("first.jsonl", "00000000-0000-4000-8000-000000000001");
    const second = transcriptFile("second.jsonl", "00000000-0000-4000-8000-000000000002");

    act(() => {
      result.current.addEntries([
        { file: first, path: first.name },
        { file: second, path: second.name },
      ]);
    });
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));

    const other = result.current.sessions.find(
      (session) => session.id !== result.current.selectedId,
    );
    expect(other).toBeDefined();
    act(() => {
      if (other !== undefined) result.current.selectSession(other.id);
    });
    expect(result.current.selectedId).toBe(other?.id);
  });
});
