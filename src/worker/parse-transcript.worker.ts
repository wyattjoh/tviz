/**
 * Web Worker entry point: reads a transcript file and parses it off the main
 * thread so a multi-megabyte drop never freezes the page.
 *
 * Reads are **serialized**. Every request chains onto the tail of a queue, so
 * only one transcript is ever resident as a string. Handling each message
 * independently would start a `File.text()` read per queued file the moment it
 * arrived and hold them all at once — and `DropZone` invites someone to drop a
 * whole `~/.claude/projects` folder, which is a hundred Sessions at up to
 * 13 MB each. Parsing itself is not the cost (a 3.4 MB transcript parses in
 * about 20ms); the decoded text is.
 *
 * Serializing costs nothing the caller can see: `parse-client.ts` correlates
 * responses by request id, so it never depended on them arriving in order.
 */
import { parseTranscript } from "../parser/parse-transcript.ts";
import type { ParseRequest, ParseResponse } from "./messages.ts";

const respond = (response: ParseResponse): void => {
  postMessage(response);
};

/**
 * Reads one file and answers for it.
 *
 * Never rejects: a file that cannot be read answers `unreadable` and returns
 * normally, so the queue below can never latch into a rejected state and
 * silently swallow every transcript behind a single bad one.
 */
const readAndRespond = async (request: ParseRequest): Promise<void> => {
  try {
    const text = await request.file.text();
    respond({ id: request.id, outcome: parseTranscript(request.file.name, text) });
  } catch {
    respond({
      id: request.id,
      outcome: {
        ok: false,
        reason: "unreadable",
        message: `${request.file.name} could not be read.`,
      },
    });
  }
};

/**
 * Tail of the read queue. Requests chain onto it in arrival order.
 */
let queue: Promise<void> = Promise.resolve();

addEventListener("message", (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  queue = queue.then(() => readAndRespond(request));
});
