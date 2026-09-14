// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Fixture from "../fixtures/transcript.ts";
import { transcriptFile } from "../ui/test-dom.ts";
import type { ParseResponse } from "./messages.ts";

/**
 * Loads the Worker entry and captures both ends of its `postMessage` contract.
 *
 * The listener is taken from a stubbed `addEventListener` rather than reached
 * through `globalThis.dispatchEvent`: `vi.resetModules()` gives the next test a
 * fresh module — and so a fresh read queue — but it cannot unregister the
 * listener the *previous* instance added to the shared global. Dispatching on
 * the global therefore feeds every instance ever loaded in this file, which
 * makes independent queues look like one queue reading in parallel.
 */
const loadWorkerEntry = async () => {
  vi.resetModules();
  const posted: ParseResponse[] = [];
  let listener: ((event: MessageEvent<{ id: number; file: File }>) => void) | undefined;

  vi.stubGlobal("postMessage", (response: ParseResponse) => posted.push(response));
  vi.stubGlobal("addEventListener", (type: string, handler: EventListener) => {
    if (type === "message") listener = handler as typeof listener;
  });
  await import("./parse-transcript.worker.ts");
  if (listener === undefined) throw new Error("the Worker registered no message listener");
  const onMessage = listener;

  /** Queues a file without waiting for its answer. */
  const dispatch = (file: File, id: number): void => {
    onMessage(new MessageEvent("message", { data: { id, file } }));
  };

  const answerFor = (id: number): ParseResponse => {
    const response = posted.find((candidate) => candidate.id === id);
    if (response === undefined) throw new Error(`the Worker posted nothing back for ${id}`);
    return response;
  };

  const settled = async (count: number): Promise<void> => {
    await vi.waitUntil(() => posted.length >= count);
  };

  const send = async (file: File, id = 1): Promise<ParseResponse> => {
    dispatch(file, id);
    await settled(1);
    return answerFor(id);
  };

  return { dispatch, send, settled, answerFor, posted };
};

const parsableTranscript = (): string =>
  Fixture.toJsonl([
    Fixture.userMessage(400),
    Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 12_000 } }),
  ]);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the parse Worker", () => {
  it("reads the file off the main thread and posts back the parsed Session", async () => {
    const { send } = await loadWorkerEntry();

    const response = await send(transcriptFile("session-a.jsonl", parsableTranscript()), 7);

    expect(response.id).toBe(7);
    expect(response.outcome.ok).toBe(true);
    if (!response.outcome.ok) return;
    expect(response.outcome.session.calls.at(-1)?.measuredTotal).toBe(12_000);
  });

  it("posts back a readable failure when the file cannot be read", async () => {
    const { send } = await loadWorkerEntry();
    const file = transcriptFile("session-a.jsonl", "{}\n");
    vi.spyOn(file, "text").mockRejectedValue(new Error("gone"));

    const response = await send(file);

    expect(response.outcome).toMatchObject({
      ok: false,
      reason: "unreadable",
      message: "session-a.jsonl could not be read.",
    });
  });

  // A folder drop queues every transcript at once, and `~/.claude/projects`
  // holds a hundred of them at up to 13 MB each. Handling each message as it
  // arrives starts every read immediately and holds every decoded string at
  // the same time; this is the test that says it does not.
  it("reads one file at a time, however many are queued at once", async () => {
    const { dispatch, settled } = await loadWorkerEntry();
    const text = parsableTranscript();
    let reading = 0;
    let mostAtOnce = 0;

    const gated = (name: string): File => {
      const file = transcriptFile(name, text);
      vi.spyOn(file, "text").mockImplementation(async () => {
        reading += 1;
        mostAtOnce = Math.max(mostAtOnce, reading);
        // Two yields: a Worker that started its reads in parallel would have
        // every one of them past this point before the first came back.
        await Promise.resolve();
        await Promise.resolve();
        reading -= 1;
        return text;
      });
      return file;
    };

    dispatch(gated("a.jsonl"), 1);
    dispatch(gated("b.jsonl"), 2);
    dispatch(gated("c.jsonl"), 3);
    await settled(3);

    expect(mostAtOnce).toBe(1);
  });

  it("keeps answering for the files queued behind one it cannot read", async () => {
    const { dispatch, settled, answerFor } = await loadWorkerEntry();
    const unreadable = transcriptFile("broken.jsonl", "{}\n");
    vi.spyOn(unreadable, "text").mockRejectedValue(new Error("gone"));

    dispatch(unreadable, 1);
    dispatch(transcriptFile("session-b.jsonl", parsableTranscript()), 2);
    await settled(2);

    expect(answerFor(1).outcome).toMatchObject({ ok: false, reason: "unreadable" });
    expect(answerFor(2).outcome.ok).toBe(true);
  });
});
