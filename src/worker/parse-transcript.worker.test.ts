// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import * as Fixture from "../fixtures/transcript.ts";
import { transcriptFile } from "../ui/test-dom.ts";
import type { ParseResponse } from "./messages.ts";

/**
 * Loads the Worker entry, which registers its listener on the global scope, and
 * captures what it posts back.
 */
const loadWorkerEntry = async () => {
  vi.resetModules();
  const posted: ParseResponse[] = [];
  vi.stubGlobal("postMessage", (response: ParseResponse) => posted.push(response));
  await import("./parse-transcript.worker.ts");

  const send = async (file: File, id = 1): Promise<ParseResponse> => {
    globalThis.dispatchEvent(new MessageEvent("message", { data: { id, file } }));
    await vi.waitUntil(() => posted.length > 0);
    const response = posted[0];
    if (response === undefined) throw new Error("the Worker posted nothing back");
    return response;
  };
  return { send };
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the parse Worker", () => {
  it("reads the file off the main thread and posts back the parsed Session", async () => {
    const { send } = await loadWorkerEntry();
    const text = Fixture.toJsonl([
      Fixture.userMessage(400),
      Fixture.assistantMessage({ id: "m1", usage: { cacheRead: 12_000 } }),
    ]);

    const response = await send(transcriptFile("session-a.jsonl", text), 7);

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
});
