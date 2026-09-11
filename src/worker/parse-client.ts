/**
 * Main-thread client for the parse Worker.
 *
 * One Worker is shared by every request; requests are correlated by id so the
 * folder loader can queue several files against the same Worker later.
 */
import type { ParseOutcome } from "../parser/parse-transcript.ts";
import type { ParseRequest, ParseResponse } from "./messages.ts";

const inFlight = new Map<number, (outcome: ParseOutcome) => void>();
let worker: Worker | undefined;
let lastRequestId = 0;

const failAllInFlight = (message: string): void => {
  for (const [id, settle] of inFlight) {
    inFlight.delete(id);
    settle({ ok: false, reason: "unreadable", message });
  }
  worker?.terminate();
  worker = undefined;
};

const parseWorker = (): Worker => {
  if (worker !== undefined) return worker;
  const created = new Worker(new URL("./parse-transcript.worker.ts", import.meta.url), {
    type: "module",
    name: "tviz-parser",
  });
  created.addEventListener("message", (event: MessageEvent<ParseResponse>) => {
    const settle = inFlight.get(event.data.id);
    if (settle === undefined) return;
    inFlight.delete(event.data.id);
    settle(event.data.outcome);
  });
  created.addEventListener("error", () => {
    failAllInFlight("The parser stopped unexpectedly. Try reloading the page.");
  });
  worker = created;
  return created;
};

/**
 * Parses one transcript file in the Worker.
 *
 * Never rejects: a failure comes back as a {@link ParseOutcome} with `ok: false`.
 */
export const parseTranscriptFile = (file: File): Promise<ParseOutcome> => {
  const id = (lastRequestId += 1);
  const target = parseWorker();
  return new Promise<ParseOutcome>((resolve) => {
    inFlight.set(id, resolve);
    const request: ParseRequest = { id, file };
    target.postMessage(request);
  });
};
