/**
 * The message contract between the main thread and the parse Worker.
 *
 * Everything crossing this boundary is structurally cloneable plain data; the
 * transcript itself never leaves the browser (ADR-0002).
 */
import type { ParseOutcome } from "../parser/parse-transcript.ts";

/**
 * Asks the Worker to parse one transcript file.
 */
export type ParseRequest = {
  /**
   * Correlates the response with its request.
   */
  readonly id: number;
  /**
   * The dropped or picked file; the Worker reads its text itself so a
   * multi-megabyte read never runs on the main thread.
   */
  readonly file: File;
};

/**
 * The Worker's answer to one {@link ParseRequest}.
 */
export type ParseResponse = {
  /**
   * The id of the request being answered.
   */
  readonly id: number;
  /**
   * The parser's plain-data result.
   */
  readonly outcome: ParseOutcome;
};
