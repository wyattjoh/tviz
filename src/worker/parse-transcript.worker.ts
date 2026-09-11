/**
 * Web Worker entry point: reads a transcript file and parses it off the main
 * thread so a multi-megabyte drop never freezes the page.
 */
import { parseTranscript } from "../parser/parse-transcript.ts";
import type { ParseRequest, ParseResponse } from "./messages.ts";

const respond = (response: ParseResponse): void => {
  postMessage(response);
};

addEventListener("message", (event: MessageEvent<ParseRequest>) => {
  const request = event.data;
  request.file.text().then(
    (text) => {
      respond({ id: request.id, outcome: parseTranscript(request.file.name, text) });
    },
    () => {
      respond({
        id: request.id,
        outcome: {
          ok: false,
          reason: "unreadable",
          message: `${request.file.name} could not be read.`,
        },
      });
    },
  );
});
