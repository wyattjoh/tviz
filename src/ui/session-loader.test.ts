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
    expect(result.current.pending).toEqual([
      { id: expect.any(String), path: file.name, fileName: file.name },
    ]);

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

  it("does not double a Subagent Session count when the same sidecars are queued a second time", async () => {
    const { result } = renderHook(() => useSessionLoader());
    const parentId = "00000000-0000-4000-8000-000000000000";
    const parent = transcriptFile(`${parentId}.jsonl`);
    const sidecarA = transcriptFile("agent-1.jsonl");
    const sidecarB = transcriptFile("agent-2.jsonl");
    const batch = [
      { file: sidecarA, path: `${parentId}/subagents/agent-1.jsonl` },
      { file: parent, path: parent.name },
      { file: sidecarB, path: `${parentId}/subagents/agent-2.jsonl` },
    ];

    act(() => {
      result.current.addEntries(batch);
    });
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.sessions[0]?.subagentCount).toBe(2);

    // The same folder, dropped again — a real folder drop the user repeats,
    // or the same subdirectory discovered through two different drops — must
    // not add to the count a second time.
    act(() => {
      result.current.addEntries(batch);
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

  it("resolves two queued entries that share a path independently", async () => {
    // Two files can carry the same `path` — the same file dropped twice is
    // the common case, but two unrelated sidecars that happen to share a
    // name would collide the same way. `pending` must key each queued entry
    // on something other than `path`, or the first resolution's cleanup
    // removes both rows and under-reports in-flight work.
    const { result } = renderHook(() => useSessionLoader());
    const path = "dup.jsonl";
    const fast = transcriptFile("dup.jsonl");
    const slow = transcriptFile("dup.jsonl");
    let releaseSlow: (() => void) | undefined;
    slow.text = () => new Promise<string>((resolve) => (releaseSlow = () => resolve("")));

    act(() => {
      result.current.addEntries([
        { file: fast, path },
        { file: slow, path },
      ]);
    });
    expect(result.current.pending).toHaveLength(2);

    // The fast entry resolves first. If `pending` were filtered by `path`
    // instead of a per-entry id, this would clear the slow entry's row too.
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));
    expect(result.current.pending).toHaveLength(1);
    expect(result.current.pending[0]?.path).toBe(path);

    releaseSlow?.();
    // The slow entry's text is `""`, which the parser rejects — landing in
    // `errors` rather than a second Session, and clearing the last pending row.
    await waitFor(() => expect(result.current.pending).toEqual([]));
    expect(result.current.errors).toHaveLength(1);
  });

  it("closeSession closes only the given Session, leaving the rest and any in-flight parse alone", async () => {
    const { result } = renderHook(() => useSessionLoader());
    const first = transcriptFile("first.jsonl", "00000000-0000-4000-8000-000000000003");
    const second = transcriptFile("second.jsonl", "00000000-0000-4000-8000-000000000004");

    act(() => {
      result.current.addEntries([
        { file: first, path: first.name },
        { file: second, path: second.name },
      ]);
    });
    await waitFor(() => expect(result.current.sessions).toHaveLength(2));
    const closing = result.current.sessions[0];
    if (closing === undefined) throw new Error("expected two Sessions");

    act(() => {
      result.current.selectSession(closing.id);
    });
    act(() => {
      result.current.closeSession(closing.id);
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0]?.id).not.toBe(closing.id);
    // The Session on screen was the one closed, so another still-open one
    // takes its place rather than falling back to the empty state.
    expect(result.current.selectedId).toBe(result.current.sessions[0]?.id);
  });
});

describe("no storage API", () => {
  // Pins CLAUDE.md's hard rule directly: transcript data never leaves the
  // browser, and reloading the page starts empty. A future edit that starts
  // persisting the Session list (`localStorage`, `sessionStorage`,
  // `indexedDB`) to survive a reload would fail this test instead of
  // shipping quietly — grepping for storage calls only catches what exists
  // today, not what a later change adds.
  it("never calls a storage API across adding, selecting, and closing Sessions", async () => {
    // `Storage.prototype` is shared by `localStorage` and `sessionStorage`,
    // so one spy covers both. jsdom does not implement `indexedDB` at all
    // (`window.indexedDB` is `undefined` here) — the strongest sign this
    // suite has that nothing in the module reaches for it, since a real call
    // would throw rather than pass silently.
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    expect(window.indexedDB).toBeUndefined();

    const { result } = renderHook(() => useSessionLoader());
    const file = transcriptFile("session-a.jsonl");

    act(() => {
      result.current.addEntries([{ file, path: file.name }]);
    });
    await waitFor(() => expect(result.current.sessions).toHaveLength(1));

    act(() => {
      result.current.selectSession(result.current.sessions[0]?.id ?? "");
    });
    act(() => {
      result.current.closeAll();
    });

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
