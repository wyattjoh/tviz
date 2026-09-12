/**
 * Turns a JSONL transcript into a {@link Session} of Context Snapshots.
 *
 * Effect is used here and nowhere else (ADR-0004): `Schema` decodes Records
 * leniently, `Schema.TaggedError` types the ways a file can yield no Session, and
 * `Effect.fn` composes decode → aggregate → Session. Decoding and aggregation
 * are themselves pure, so they stay plain functions. The result handed back
 * across the Worker boundary is plain data.
 */
import { Effect, Option, Predicate, Result, Schema } from "effect";
import {
  type Category,
  type ContextItem,
  type ContextSnapshot,
  emptyCategoryTokens,
  emptyMessageKindTokens,
  type MessageKind,
  type Session,
} from "../domain/context.ts";
import {
  estimateJsonTokens,
  estimateTokens,
  IMAGE_ESTIMATED_TOKENS,
  scaleToTotal,
} from "./estimate.ts";
import {
  type AttachmentRecord,
  type ContentBlock,
  ACCOUNTED_RECORD_TYPES,
  decodeAnyRecord,
  decodeKnownRecord,
  isMetadataRecordType,
  type KnownRecord,
} from "./records.ts";
import { inferContextWindow } from "./window.ts";

/**
 * Raised when a dropped file has no content at all.
 */
export class EmptyTranscriptError extends Schema.TaggedError<EmptyTranscriptError>()(
  "EmptyTranscriptError",
  { fileName: Schema.String },
) {}

/**
 * Raised when nothing in a file was recognisable as a Claude Code Record, so it
 * is not a transcript at all.
 */
export class NotATranscriptError extends Schema.TaggedError<NotATranscriptError>()(
  "NotATranscriptError",
  { fileName: Schema.String, recordCount: Schema.Number, malformedLines: Schema.Number },
) {}

/**
 * Raised when a file *is* a Claude Code transcript but holds no API Calls.
 *
 * Claude Code writes the transcript as the Session happens, so quitting before
 * the first response leaves a file of prompts and bookkeeping with no
 * `usage` anywhere. Without a measured total there is no Context Snapshot to
 * build and nothing honest to draw, so these are skipped rather than shown —
 * see {@link ParseFailureReason}.
 */
export class NoApiCallsError extends Schema.TaggedError<NoApiCallsError>()("NoApiCallsError", {
  fileName: Schema.String,
  recordCount: Schema.Number,
}) {}

/**
 * Everything that can stop a transcript from producing a Session.
 */
export type TranscriptParseError = EmptyTranscriptError | NoApiCallsError | NotATranscriptError;

/**
 * The parser's plain-data result, safe to send through `postMessage`.
 */
export type ParseOutcome =
  | { readonly ok: true; readonly session: Session }
  | { readonly ok: false; readonly reason: ParseFailureReason; readonly message: string };

/**
 * Why a transcript produced no Session.
 *
 * `unreadable` is raised by the Worker rather than the parser, when the file
 * itself could not be read.
 *
 * `noApiCalls` is the one reason that is not a defect in the file: it marks an
 * abandoned Session, which the Session list skips silently rather than
 * reporting (`session-loader.ts`).
 */
export type ParseFailureReason = "empty" | "noApiCalls" | "notATranscript" | "unreadable";

/**
 * A piece of context seen since the previous API Call, still carrying its raw
 * character-based weight.
 */
type PendingItem = {
  readonly category: Category;
  readonly kind: MessageKind | undefined;
  readonly label: string;
  readonly weight: number;
};

type DecodedTranscript = {
  readonly records: readonly KnownRecord[];
  readonly recordCount: number;
  readonly recognisedRecords: number;
  readonly malformedLines: number;
  readonly unknownRecordTypes: Record<string, number>;
  readonly sessionId: string | undefined;
  readonly claudeCodeVersion: string | undefined;
};

const SYSTEM_LABEL = "System prompt, built-in tools, root CLAUDE.md";
const UNATTRIBUTED_LABEL = "Unattributed context";
const SYSTEM_REMINDER_MARKER = "<system-reminder>";

/**
 * One `<system-reminder>` block, which Claude Code concatenates into the same
 * text block as the prompt it wraps rather than sending separately.
 */
const SYSTEM_REMINDER_SPAN = /<system-reminder>[\s\S]*?<\/system-reminder>/g;

/**
 * Splits a user text block into its prompt parts and its injected reminders.
 *
 * They arrive in one block, so charging the whole block to whichever it
 * *contains* is wrong in both directions — and lopsidedly so: across the corpus
 * 96.7% of the characters in a reminder-bearing block are the person's own
 * prompt. Reading the block as a Reminder therefore empties the User Kind into
 * the Reminder one, which are two of the four the legend exists to compare.
 *
 * A marker with no closing tag falls back to the whole block as a Reminder,
 * which is the older, safer reading of a block this cannot take apart.
 */
const userTextPending = (text: string): PendingItem[] => {
  const wholeBlock = (kind: MessageKind, label: string): PendingItem[] =>
    text.length === 0 ? [] : [{ category: "messages", kind, label, weight: estimateTokens(text) }];

  if (!text.includes(SYSTEM_REMINDER_MARKER)) return wholeBlock("user", "User message");

  const items: PendingItem[] = [];
  let cursor = 0;
  for (const match of text.matchAll(SYSTEM_REMINDER_SPAN)) {
    const start = match.index;
    const prompt = text.slice(cursor, start).trim();
    if (prompt.length > 0) {
      items.push({
        category: "messages",
        kind: "user",
        label: "User message",
        weight: estimateTokens(prompt),
      });
    }
    items.push({
      category: "messages",
      kind: "reminder",
      label: "System reminder",
      weight: estimateTokens(match[0]),
    });
    cursor = start + match[0].length;
  }

  if (items.length === 0) return wholeBlock("reminder", "System reminder");

  const trailing = text.slice(cursor).trim();
  if (trailing.length > 0) {
    items.push({
      category: "messages",
      kind: "user",
      label: "User message",
      weight: estimateTokens(trailing),
    });
  }
  return items;
};

/**
 * Reads a string property from an unknown value without asserting its type.
 */
const readString = (value: unknown, key: string): string | undefined => {
  if (!Predicate.isObject(value)) return undefined;
  const candidate = Reflect.get(value, key);
  return Predicate.isString(candidate) ? candidate : undefined;
};

/**
 * Joins a value that transcripts record as an array of lines.
 */
const joinLines = (value: unknown): string => {
  if (Predicate.isString(value)) return value;
  if (Array.isArray(value)) return value.filter(Predicate.isString).join("\n");
  return "";
};

const attachmentPending = (record: AttachmentRecord): PendingItem => {
  const attachment = record.attachment;
  switch (attachment.type) {
    case "skill_listing": {
      const count =
        attachment.skillCount ?? (Array.isArray(attachment.names) ? attachment.names.length : 0);
      return {
        category: "skills",
        kind: undefined,
        label: count > 0 ? `Skill listing (${count} skills)` : "Skill listing",
        weight: estimateJsonTokens(attachment.content),
      };
    }
    case "agent_listing_delta":
      return {
        category: "customAgents",
        kind: undefined,
        label: "Custom agent listing",
        weight: estimateTokens(joinLines(attachment.addedLines)),
      };
    case "nested_memory": {
      const text =
        readString(attachment.content, "rawContent") ??
        readString(attachment.content, "content") ??
        "";
      const path = attachment.path;
      return {
        category: "memoryFiles",
        kind: undefined,
        label:
          path === undefined ? "Memory file" : `Memory file ${path.split("/").slice(-2).join("/")}`,
        weight: estimateTokens(text),
      };
    }
    case "mcp_instructions_delta":
      return {
        category: "mcp",
        kind: undefined,
        label: "MCP server instructions",
        weight: estimateTokens(joinLines(attachment.addedBlocks)),
      };
    case "deferred_tools_delta":
      return {
        category: "mcp",
        kind: undefined,
        label: "Deferred tool listing",
        weight: estimateTokens(joinLines(attachment.addedLines)),
      };
    default:
      return {
        category: "messages",
        kind: "reminder",
        label: attachment.type,
        // The whole object on purpose. Unlike the named arms above, these kinds
        // keep their payload under no shared key — `stdout` and `command` for
        // `hook_success`, `text` for `total_tokens_reminder`, `content` for
        // `task_reminder`, `snippet` for `edited_text_file`, `files` for
        // `diagnostics` — so any fixed key list would silently weigh most of
        // them at zero. The envelope keys it over-counts are a few characters
        // against payloads in the hundreds of thousands.
        weight: estimateJsonTokens(attachment),
      };
  }
};

const userBlockPending = (block: ContentBlock): PendingItem | PendingItem[] | undefined => {
  switch (block.type) {
    case "text":
      return userTextPending(block.text ?? "");
    case "tool_result":
      return {
        category: "messages",
        kind: "toolResult",
        label: "Tool result",
        weight: estimateJsonTokens(block.content),
      };
    case "image":
      return {
        category: "messages",
        kind: "user",
        label: "Image",
        weight: IMAGE_ESTIMATED_TOKENS,
      };
    // See {@link assistantBlockPending}: there is nothing to measure.
    case "thinking":
      return undefined;
    default:
      return {
        category: "messages",
        kind: "user",
        label: block.type,
        weight: estimateJsonTokens(block),
      };
  }
};

const assistantBlockPending = (block: ContentBlock): PendingItem | undefined => {
  switch (block.type) {
    case "text":
      return {
        category: "messages",
        kind: "assistant",
        label: "Assistant message",
        weight: estimateTokens(block.text ?? ""),
      };
    case "tool_use":
      return {
        category: "messages",
        kind: "assistant",
        label: block.name === undefined ? "Tool use" : `Tool use: ${block.name}`,
        weight: estimateJsonTokens({ name: block.name, input: block.input }),
      };
    // A `thinking` block is recorded without its text: 93% of them carry an
    // empty `thinking` string against a full `signature`. There is nothing to
    // estimate, so it takes no weight — whatever it cost is still inside the
    // call's Measured Tokens and is shared out across the items that *can* be
    // measured (ADR-0003).
    case "thinking":
      return undefined;
    default:
      return {
        category: "messages",
        kind: "assistant",
        label: block.type,
        weight: estimateJsonTokens(block),
      };
  }
};

const messagePendingItems = (
  content: string | readonly ContentBlock[] | undefined,
  role: "user" | "assistant",
): PendingItem[] => {
  if (content === undefined) return [];
  if (Predicate.isString(content)) {
    if (role === "user") return userTextPending(content);
    return [
      {
        category: "messages",
        kind: "assistant",
        label: "Assistant message",
        weight: estimateTokens(content),
      },
    ];
  }
  const toPending = role === "user" ? userBlockPending : assistantBlockPending;
  return content.flatMap((block) => toPending(block) ?? []);
};

/**
 * Splits a transcript into decoded Records, counting everything it skips.
 */
const decodeTranscript = (fileName: string, text: string): DecodedTranscript => {
  const records: KnownRecord[] = [];
  const unknownRecordTypes: Record<string, number> = {};
  let recordCount = 0;
  let recognisedRecords = 0;
  let malformedLines = 0;
  let sessionId: string | undefined;
  let claudeCodeVersion: string | undefined;

  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    let json: unknown;
    try {
      json = JSON.parse(trimmed);
    } catch {
      malformedLines += 1;
      continue;
    }
    recordCount += 1;

    const envelope = decodeAnyRecord(json);
    if (Option.isSome(envelope)) {
      sessionId ??= envelope.value.sessionId;
      claudeCodeVersion ??= envelope.value.version;
    }

    const known = decodeKnownRecord(json);
    if (Option.isSome(known)) {
      recognisedRecords += 1;
      records.push(known.value);
      continue;
    }

    const type = Option.isSome(envelope) ? (envelope.value.type ?? "(untyped)") : "(unrecognised)";
    // Known bookkeeping is skipped silently; only a type this parser has never
    // seen is worth reporting.
    if (isMetadataRecordType(type)) {
      recognisedRecords += 1;
      continue;
    }
    // A type the parser *does* account for that still would not decode is a
    // different failure from an unheard-of type: the body moved, not the
    // vocabulary, and an `assistant` that fails here takes its `usage` — a whole
    // API Call — with it. Tallying it under its bare name would hide that inside
    // a count that is supposed to mean "a Record type we have never seen".
    const tally = ACCOUNTED_RECORD_TYPES.has(type) ? `${type} (undecodable)` : type;
    unknownRecordTypes[tally] = (unknownRecordTypes[tally] ?? 0) + 1;
  }

  return {
    records,
    recordCount,
    recognisedRecords,
    malformedLines,
    unknownRecordTypes,
    sessionId: sessionId ?? fileName.replace(/\.jsonl$/i, ""),
    claudeCodeVersion,
  };
};

/**
 * Drops the Records that belong to a Subagent Session.
 *
 * A Subagent Session owns its own Context Window, so its API Calls are not the
 * parent Session's: counting them would inflate `calls` and let a subagent's
 * Context Snapshot end up on the grid. Current Claude Code versions write
 * Subagent Sessions to sidecar files, but older ones inline them with
 * `isSidechain: true`. A transcript made *entirely* of sidechain Records is a
 * Subagent Session's own transcript, which stays parseable on its own terms.
 */
const parentSessionRecords = (records: readonly KnownRecord[]): readonly KnownRecord[] =>
  records.some((record) => record.isSidechain !== true)
    ? records.filter((record) => record.isSidechain !== true)
    : records;

/**
 * Walks the decoded Records and produces one Context Snapshot per API Call.
 *
 * Items seen since the previous call are scaled so their Estimated Tokens sum to
 * the measured delta (ADR-0003); on the first call the leftover becomes System
 * (ADR-0001); a compaction — or, failing a marker, a total that came back
 * smaller — resets everything but System.
 */
const aggregateCalls = (records: readonly KnownRecord[]): readonly ContextSnapshot[] => {
  const calls: ContextSnapshot[] = [];
  const cumulativeByCategory = emptyCategoryTokens();
  const cumulativeByKind = emptyMessageKindTokens();
  let pending: PendingItem[] = [];
  let systemTokens = 0;
  let previousTotal = 0;
  let currentCallId: string | undefined;
  let compactionAhead = false;

  /**
   * Notes that the next API Call is the first one after a compaction.
   *
   * Compaction throws the conversation away, so anything queued since the last
   * API Call went with it: the final assistant turn, its tool calls, their
   * results and any attachments alongside them were all in the pre-compaction
   * window and are not in the new one. Leaving them queued would scale them into
   * the post-compaction budget, where they were never sent.
   */
  const markCompaction = () => {
    if (compactionAhead) return;
    compactionAhead = true;
    // Before the first API Call there is no turn to have lost: the queue is the
    // Session's opening context, and a transcript that begins already compacted
    // still has to derive System from it.
    if (calls.length > 0) pending = [];
  };

  const commit = (added: readonly ContextItem[]) => {
    for (const item of added) {
      cumulativeByCategory[item.category] += item.tokens;
      if (item.kind !== undefined) cumulativeByKind[item.kind] += item.tokens;
    }
  };

  const toItems = (tokens: readonly number[]): ContextItem[] =>
    pending.map((item, index) => ({
      category: item.category,
      kind: item.kind,
      label: item.label,
      tokens: tokens[index] ?? 0,
    }));

  for (const record of records) {
    // `compact_boundary` is the authoritative marker: it comes before the
    // summary, and it fires even when the compaction left the measured total
    // larger than it found it. Matched on the subtype rather than on
    // `type === "system"`, so a second `system` Record added to `KnownRecord`
    // later is not silently read as a compaction.
    if (record.type === "system") {
      if (record.subtype === "compact_boundary") markCompaction();
      continue;
    }

    // The fallback, for the transcripts that carry the summary's flag alone.
    if (record.isCompactSummary === true) markCompaction();

    if (record.type === "attachment") {
      pending.push(attachmentPending(record));
      continue;
    }

    if (record.type === "user") {
      pending.push(...messagePendingItems(record.message.content, "user"));
      continue;
    }

    const usage = record.message.usage;
    const measuredTotal =
      usage === undefined
        ? 0
        : (usage.input_tokens ?? 0) +
          (usage.cache_read_input_tokens ?? 0) +
          (usage.cache_creation_input_tokens ?? 0);
    const callId = record.message.id ?? record.requestId ?? record.uuid;

    // Consecutive assistant Records sharing one `message.id` are one API Call.
    //
    // A measured total of zero is not an API Call at all: Claude Code writes
    // assistant Records for interrupts and API errors (`model: "<synthetic>"`)
    // carrying a complete `usage` whose input fields are all zero. Admitting
    // them drew an empty Context Snapshot and, because the total only ever goes
    // down from there, wiped the Session's System remainder for good.
    if (measuredTotal > 0 && (callId === undefined || callId !== currentCallId)) {
      currentCallId = callId;
      const weights = pending.map((item) => item.weight);
      const isFirstCall = calls.length === 0;
      const isCompaction = !isFirstCall && compactionAhead;
      // Without a marker, a smaller total is all there is to go on. It still
      // rewrites the grid, but it is a request that carried less context rather
      // than a compaction, and the Scrubber must not label it as one.
      const isReset = isCompaction || (!isFirstCall && measuredTotal < previousTotal);

      let added: ContextItem[];
      if (isFirstCall) {
        const estimated = weights.reduce((sum, weight) => sum + weight, 0);
        if (estimated <= measuredTotal) {
          systemTokens = measuredTotal - estimated;
          added = [
            { category: "system", kind: undefined, label: SYSTEM_LABEL, tokens: systemTokens },
            ...toItems(weights),
          ];
        } else {
          systemTokens = 0;
          added = [
            { category: "system", kind: undefined, label: SYSTEM_LABEL, tokens: 0 },
            ...toItems(scaleToTotal(weights, measuredTotal)),
          ];
        }
      } else if (isReset) {
        for (const category of Object.keys(cumulativeByCategory) as Category[]) {
          cumulativeByCategory[category] = 0;
        }
        for (const kind of Object.keys(cumulativeByKind) as MessageKind[]) {
          cumulativeByKind[kind] = 0;
        }
        // System is derived once, on the first call, and a compaction does not
        // change what it holds: the system prompt, the tool schemas and the root
        // CLAUDE.md are re-sent unchanged. Only the *drawn* value is clamped, so
        // a call too small to hold all of System still reconciles without
        // ratcheting `systemTokens` itself down for every call after it.
        const drawnSystem = Math.min(systemTokens, measuredTotal);
        const available = measuredTotal - drawnSystem;
        added = [
          { category: "system", kind: undefined, label: SYSTEM_LABEL, tokens: drawnSystem },
          ...(pending.length > 0
            ? toItems(scaleToTotal(weights, available))
            : available > 0
              ? [
                  {
                    category: "messages" as const,
                    kind: "assistant" as const,
                    label: UNATTRIBUTED_LABEL,
                    tokens: available,
                  },
                ]
              : []),
        ];
      } else {
        // A call that could not hold all of System drew a clamped value, and
        // System is not re-emitted on an ordinary call — so without this it
        // would stay short for the rest of the Session and its missing tokens
        // would read as Messages. Take the shortfall off the delta first; what
        // is left is scaled across the items as usual, so the total still
        // reconciles.
        const shortfall = Math.max(0, systemTokens - cumulativeByCategory.system);
        const delta = measuredTotal - previousTotal;
        const restored = Math.min(shortfall, Math.max(0, delta));
        const remaining = delta - restored;
        added = [
          ...(restored > 0
            ? [
                {
                  category: "system" as const,
                  kind: undefined,
                  label: SYSTEM_LABEL,
                  tokens: restored,
                },
              ]
            : []),
          ...(pending.length > 0
            ? toItems(scaleToTotal(weights, remaining))
            : remaining > 0
              ? [
                  {
                    category: "messages" as const,
                    kind: "assistant" as const,
                    label: UNATTRIBUTED_LABEL,
                    tokens: remaining,
                  },
                ]
              : []),
        ];
      }

      commit(added);
      calls.push({
        index: calls.length,
        timestamp: record.timestamp,
        model: record.message.model,
        measuredTotal,
        byCategory: { ...cumulativeByCategory },
        byKind: { ...cumulativeByKind },
        // Only this call's items. The cumulative sequence the grid needs is
        // `cumulativeItems(calls, index)`: storing a copy per call would make
        // the Session quadratic in size and in postMessage cost.
        added,
        reset: isReset,
        compaction: isCompaction,
      });

      pending = [];
      previousTotal = measuredTotal;
      compactionAhead = false;
    }

    // Assistant content is input on the *next* API Call, so it becomes pending
    // whether or not this Record opened a new call.
    pending.push(...messagePendingItems(record.message.content, "assistant"));
  }

  return calls;
};

/**
 * Parses one transcript into a Session.
 *
 * Fails with {@link EmptyTranscriptError} for a blank file and
 * {@link NotATranscriptError} when nothing in the file looks like an API Call.
 */
export const parseTranscriptEffect = Effect.fn("parseTranscript")(function* (
  fileName: string,
  text: string,
) {
  if (text.trim().length === 0) {
    return yield* new EmptyTranscriptError({ fileName });
  }

  const decoded = decodeTranscript(fileName, text);
  const calls = aggregateCalls(parentSessionRecords(decoded.records));

  if (calls.length === 0) {
    // Telling the two apart is what keeps an abandoned Session from being
    // called "not a Claude Code transcript": a file whose lines this parser
    // recognises is one, it just never reached an API Call.
    if (decoded.recognisedRecords > 0) {
      return yield* new NoApiCallsError({ fileName, recordCount: decoded.recordCount });
    }
    return yield* new NotATranscriptError({
      fileName,
      recordCount: decoded.recordCount,
      malformedLines: decoded.malformedLines,
    });
  }

  const model = calls.find((call) => call.model !== undefined)?.model;
  const peak = calls.reduce((max, call) => Math.max(max, call.measuredTotal), 0);

  const session: Session = {
    id: decoded.sessionId ?? fileName,
    fileName,
    model,
    claudeCodeVersion: decoded.claudeCodeVersion,
    windowSize: inferContextWindow(model, peak),
    calls,
    recordCount: decoded.recordCount,
    malformedLines: decoded.malformedLines,
    unknownRecordTypes: decoded.unknownRecordTypes,
    // Only the folder loader can see the sidecar `subagents/` directory.
    subagentCount: undefined,
  };
  return session;
});

/**
 * User-visible sentence for a parse failure.
 */
const describe = (error: TranscriptParseError): string => {
  switch (error._tag) {
    case "EmptyTranscriptError":
      return `${error.fileName} is empty.`;
    case "NoApiCallsError":
      return `${error.fileName} ended before its first API call, so it holds no context to show.`;
    case "NotATranscriptError":
      return `${error.fileName} is not a Claude Code transcript: no API calls found in ${error.recordCount} record(s), ${error.malformedLines} malformed line(s).`;
  }
};

const REASON_BY_TAG = {
  EmptyTranscriptError: "empty",
  NoApiCallsError: "noApiCalls",
  NotATranscriptError: "notATranscript",
} as const satisfies Record<TranscriptParseError["_tag"], ParseFailureReason>;

/**
 * Parses a transcript and returns plain data, never throwing.
 *
 * This is the seam the Web Worker and the tests use; the React layer only ever
 * sees the {@link ParseOutcome}.
 */
export const parseTranscript = (fileName: string, text: string): ParseOutcome => {
  const outcome = Effect.runSync(Effect.result(parseTranscriptEffect(fileName, text)));
  if (Result.isSuccess(outcome)) return { ok: true, session: outcome.success };
  return {
    ok: false,
    reason: REASON_BY_TAG[outcome.failure._tag],
    message: describe(outcome.failure),
  };
};
