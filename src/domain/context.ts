/**
 * Plain-data vocabulary shared by the parser, the Web Worker boundary, and the
 * React layer. Nothing here depends on Effect (ADR-0004): the parser hands React
 * structurally-cloneable objects only.
 */

/**
 * One `/context` bucket.
 *
 * `System` is the combined remainder holding everything a transcript never logs
 * (system prompt, built-in tool schemas, root CLAUDE.md) — see ADR-0001.
 */
export type Category = "system" | "customAgents" | "memoryFiles" | "skills" | "mcp" | "messages";

/**
 * Layout and legend order of the Categories, matching the order `/context`
 * fills its grid in.
 */
export const CATEGORY_ORDER: readonly Category[] = [
  "system",
  "customAgents",
  "memoryFiles",
  "skills",
  "mcp",
  "messages",
];

/**
 * Human-readable Category names, used verbatim in the UI.
 */
export const CATEGORY_LABELS: Readonly<Record<Category, string>> = {
  system: "System",
  customAgents: "Custom agents",
  memoryFiles: "Memory files",
  skills: "Skills",
  mcp: "MCP",
  messages: "Messages",
};

/**
 * Why the System Category cannot be broken down (ADR-0001).
 */
export const SYSTEM_CATEGORY_HINT =
  "system prompt + built-in tools + root CLAUDE.md (not logged; derived)";

/**
 * A sub-division of the Messages Category.
 */
export type MessageKind = "user" | "assistant" | "toolResult" | "reminder";

/**
 * Legend order of the Message Kinds.
 */
export const MESSAGE_KIND_ORDER: readonly MessageKind[] = [
  "user",
  "assistant",
  "toolResult",
  "reminder",
];

/**
 * Human-readable Message Kind names, used verbatim in the UI.
 */
export const MESSAGE_KIND_LABELS: Readonly<Record<MessageKind, string>> = {
  user: "User",
  assistant: "Assistant",
  toolResult: "Tool result",
  reminder: "Reminder",
};

/**
 * Token totals for every Category. Always structurally complete so callers can
 * index it without narrowing.
 */
export type CategoryTokens = Readonly<Record<Category, number>>;

/**
 * Token totals for every Message Kind. Sums to `CategoryTokens["messages"]`.
 */
export type MessageKindTokens = Readonly<Record<MessageKind, number>>;

/**
 * A `CategoryTokens` with every Category at zero.
 */
export const emptyCategoryTokens = (): Record<Category, number> => ({
  system: 0,
  customAgents: 0,
  memoryFiles: 0,
  skills: 0,
  mcp: 0,
  messages: 0,
});

/**
 * A `MessageKindTokens` with every Message Kind at zero.
 */
export const emptyMessageKindTokens = (): Record<MessageKind, number> => ({
  user: 0,
  assistant: 0,
  toolResult: 0,
  reminder: 0,
});

/**
 * One identifiable piece of context that entered the window during a single API
 * Call, carrying Estimated Tokens already scaled to that call's Measured Tokens
 * (ADR-0003).
 */
export type ContextItem = {
  /**
   * The Category this item counts towards.
   */
  readonly category: Category;
  /**
   * The Message Kind, present only when `category` is `messages`.
   */
  readonly kind: MessageKind | undefined;
  /**
   * Short description shown in the Cell hover list.
   */
  readonly label: string;
  /**
   * Tokens attributed to this item after scaling.
   */
  readonly tokens: number;
};

/**
 * The composition of the context by Category as of one API Call.
 *
 * `byCategory` is cumulative and always sums to `measuredTotal`; `added` holds
 * only the items that entered the window on this call.
 */
export type ContextSnapshot = {
  /**
   * Zero-based position of the API Call within the Session.
   */
  readonly index: number;
  /**
   * ISO timestamp of the API Call, when the transcript recorded one.
   */
  readonly timestamp: string | undefined;
  /**
   * Model id that served this API Call.
   */
  readonly model: string | undefined;
  /**
   * Exact `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`.
   */
  readonly measuredTotal: number;
  /**
   * Cumulative tokens per Category; sums to `measuredTotal`.
   */
  readonly byCategory: CategoryTokens;
  /**
   * Cumulative tokens per Message Kind; sums to `byCategory.messages`.
   */
  readonly byKind: MessageKindTokens;
  /**
   * Items that entered the context window on this API Call.
   */
  readonly added: readonly ContextItem[];
  /**
   * True when the context shrank (compaction): every item except System was
   * dropped and attribution restarted from this call.
   */
  readonly reset: boolean;
};

/**
 * One Claude Code conversation parsed from a single JSONL transcript.
 */
export type Session = {
  /**
   * Session id from the transcript, falling back to the file name.
   */
  readonly id: string;
  /**
   * Name of the dropped file, shown in the Session list.
   */
  readonly fileName: string;
  /**
   * Model id of the first API Call.
   */
  readonly model: string | undefined;
  /**
   * Claude Code version recorded on the first Record that carries one.
   */
  readonly claudeCodeVersion: string | undefined;
  /**
   * Inferred Context Window used as the grid's denominator.
   */
  readonly windowSize: number;
  /**
   * Context Snapshots in transcript order, one per API Call.
   */
  readonly calls: readonly ContextSnapshot[];
  /**
   * Records that decoded as JSON, including ones the parser skipped.
   */
  readonly recordCount: number;
  /**
   * Lines that were not valid JSON and were skipped.
   */
  readonly malformedLines: number;
  /**
   * Count of skipped Records keyed by their `type` field.
   */
  readonly unknownRecordTypes: Readonly<Record<string, number>>;
  /**
   * Number of Subagent Sessions found beside this transcript, or `undefined`
   * when nothing measured it.
   *
   * A single dropped file carries no sidecar `subagents/` directory, so the
   * count is unknown rather than zero; only the folder loader can supply it. A
   * Subagent Session owns its own Context Window, so claiming zero would be a
   * false statement about where a Session's context went.
   */
  readonly subagentCount: number | undefined;
};

/**
 * A Session as the app holds it: the parsed data plus how to name it in the
 * Session list and whether it is a Demo Session.
 *
 * A Session parsed from a dropped file and a Session fetched from
 * `public/demo/` go through the same Worker and produce the same
 * {@link Session}; this wrapper is the only place they differ.
 */
export type LoadedSession = {
  /**
   * The parsed Session.
   */
  readonly session: Session;
  /**
   * Name shown in the Session list: the manifest name for a Demo Session, the
   * file name for one the user supplied.
   */
  readonly label: string;
  /**
   * The manifest blurb for a Demo Session. Its presence is what marks a Session
   * as synthetic, so the UI can say so wherever the Session is shown.
   */
  readonly description: string | undefined;
};
