/**
 * Effect Schema shapes for the transcript Records the parser consumes.
 *
 * Decoding is deliberately lenient (ADR-0004): every field the parser does not
 * need is optional or `Unknown`, and anything that fails to match falls through
 * to {@link AnyRecord} so an unknown Record type is counted rather than fatal.
 */
import { Schema } from "effect";

/**
 * A JSON object with arbitrary extra keys preserved after decoding.
 */
const withUnknownRest = <Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [Schema.Record(Schema.String, Schema.Unknown)]);

/**
 * The exact input accounting the API reports for one API Call.
 */
export const Usage = Schema.Struct({
  input_tokens: Schema.optional(Schema.Number),
  cache_read_input_tokens: Schema.optional(Schema.Number),
  cache_creation_input_tokens: Schema.optional(Schema.Number),
});

/**
 * One block inside a `message.content` array.
 */
export const ContentBlock = withUnknownRest({
  type: Schema.String,
  text: Schema.optional(Schema.String),
  name: Schema.optional(Schema.String),
  input: Schema.optional(Schema.Unknown),
  content: Schema.optional(Schema.Unknown),
});

/**
 * A decoded `message.content` block.
 */
export type ContentBlock = typeof ContentBlock.Type;

const MessageContent = Schema.Union([Schema.String, Schema.Array(ContentBlock)]);

/**
 * An `assistant` Record. Several of them can share one `message.id`, in which
 * case they belong to the same API Call.
 *
 * `isSidechain` marks a Record that belongs to a Subagent Session, whose
 * Context Window is separate from the parent Session's.
 */
export const AssistantRecord = Schema.Struct({
  type: Schema.Literal("assistant"),
  uuid: Schema.optional(Schema.String),
  requestId: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  isCompactSummary: Schema.optional(Schema.Boolean),
  isSidechain: Schema.optional(Schema.Boolean),
  message: Schema.Struct({
    id: Schema.optional(Schema.String),
    model: Schema.optional(Schema.String),
    usage: Schema.optional(Usage),
    content: Schema.optional(MessageContent),
  }),
});

/**
 * A `user` Record, including the compaction summary that replaces the
 * conversation after `/compact`.
 */
export const UserRecord = Schema.Struct({
  type: Schema.Literal("user"),
  uuid: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  isCompactSummary: Schema.optional(Schema.Boolean),
  isSidechain: Schema.optional(Schema.Boolean),
  isMeta: Schema.optional(Schema.Boolean),
  message: Schema.Struct({
    content: Schema.optional(MessageContent),
  }),
});

/**
 * An `attachment` Record. `attachment.type` selects the Category; the payload
 * keys differ per kind, so the rest of the object is kept as `Unknown`.
 */
export const AttachmentRecord = Schema.Struct({
  type: Schema.Literal("attachment"),
  uuid: Schema.optional(Schema.String),
  timestamp: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  isCompactSummary: Schema.optional(Schema.Boolean),
  isSidechain: Schema.optional(Schema.Boolean),
  attachment: withUnknownRest({
    type: Schema.String,
    content: Schema.optional(Schema.Unknown),
    addedLines: Schema.optional(Schema.Unknown),
    addedBlocks: Schema.optional(Schema.Unknown),
    addedTypes: Schema.optional(Schema.Unknown),
    path: Schema.optional(Schema.String),
    names: Schema.optional(Schema.Unknown),
    skillCount: Schema.optional(Schema.Number),
  }),
});

/**
 * Any Record at all, used to name the types the parser skipped.
 */
export const AnyRecord = Schema.Struct({
  type: Schema.optional(Schema.String),
  version: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  isCompactSummary: Schema.optional(Schema.Boolean),
  isSidechain: Schema.optional(Schema.Boolean),
});

/**
 * Record types Claude Code writes as session bookkeeping, which never enter the
 * Context Window (`docs/transcript-format.md`).
 *
 * They are skipped exactly like an unrecognised type, but deliberately *not*
 * counted as one: a session logs hundreds of them, and burying the count that
 * matters — a Record type this parser has never seen, which is the signal that
 * the format moved — under that noise is what this list exists to prevent.
 * Every entry here was observed in a census of the local transcript corpus
 * (3.3M Records); a type that turns out to be metadata belongs here rather than
 * in the unknown tally.
 */
export const METADATA_RECORD_TYPES: ReadonlySet<string> = new Set([
  // Session bookkeeping: what the CLI remembers about the session itself.
  "ai-title",
  "atis-latch",
  "bridge-session",
  "cost-state",
  "custom-title",
  "fork-context-ref",
  "frame-link",
  "last-prompt",
  "mode",
  "permission-mode",
  "pr-link",
  "queue-operation",
  "relocated",
  "saved_hook_context",
  "summary",
  "worktree-state",
  // File-edit history, kept for undo rather than for the model.
  "file-history-delta",
  "file-history-snapshot",
  // Subagent Sessions: `agent-*` name them, `started`/`result` bracket one in
  // its sidecar file, and `progress` streams its activity into the parent
  // transcript. A Subagent Session owns a separate Context Window either way.
  "agent-color",
  "agent-name",
  "agent-setting",
  "progress",
  "result",
  "started",
  // `system` carries `subtype` (`stop_hook_summary`, `turn_duration`,
  // `local_command`, `compact_boundary`, …); none of them is sent to the API.
  "system",
]);

/**
 * True when a Record type is known session bookkeeping rather than context.
 */
export const isMetadataRecordType = (type: string): boolean => METADATA_RECORD_TYPES.has(type);

/**
 * The Records the parser knows how to account for.
 */
export const KnownRecord = Schema.Union([AssistantRecord, UserRecord, AttachmentRecord]);

/**
 * A decoded Record the parser accounts for.
 */
export type KnownRecord = typeof KnownRecord.Type;

/**
 * A decoded `assistant` Record.
 */
export type AssistantRecord = typeof AssistantRecord.Type;

/**
 * A decoded `user` Record.
 */
export type UserRecord = typeof UserRecord.Type;

/**
 * A decoded `attachment` Record.
 */
export type AttachmentRecord = typeof AttachmentRecord.Type;

/**
 * A decoded Record of a type the parser does not account for.
 */
export type AnyRecord = typeof AnyRecord.Type;

/**
 * Decodes a Record the parser accounts for, or `None` when the line is some
 * other shape.
 */
export const decodeKnownRecord = Schema.decodeUnknownOption(KnownRecord);

/**
 * Decodes the minimal envelope shared by every Record, used to name skipped
 * Record types.
 */
export const decodeAnyRecord = Schema.decodeUnknownOption(AnyRecord);
