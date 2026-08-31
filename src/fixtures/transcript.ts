/**
 * Synthetic transcript builder for tests.
 *
 * Every string these helpers emit is generated filler. No real transcript
 * content ever enters the repo (ADR-0002); Demo Sessions come from the
 * Anonymizer instead.
 */

const FILLER_WORDS = "lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod ";

/**
 * Deterministic placeholder text of an exact character length.
 */
export const filler = (characters: number): string => {
  if (characters <= 0) return "";
  const repeated = FILLER_WORDS.repeat(Math.ceil(characters / FILLER_WORDS.length));
  return repeated.slice(0, characters);
};

/**
 * A single JSONL line of a synthetic transcript.
 */
export type FixtureRecord = Record<string, unknown>;

const envelope = (index: number): FixtureRecord => ({
  uuid: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  sessionId: "00000000-0000-4000-8000-000000000000",
  timestamp: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
  version: "2.1.251",
});

let sequence = 0;
const next = (): FixtureRecord => envelope((sequence += 1));

/**
 * Resets the monotonic uuid/timestamp counter so fixtures are reproducible.
 */
export const resetFixtureSequence = (): void => {
  sequence = 0;
};

/**
 * An `attachment` Record of an arbitrary kind.
 */
export const attachmentRecord = (attachment: FixtureRecord): FixtureRecord => ({
  ...next(),
  type: "attachment",
  attachment,
});

/**
 * A `skill_listing` attachment: Skills.
 */
export const skillListing = (characters: number, skillCount = 3): FixtureRecord =>
  attachmentRecord({
    type: "skill_listing",
    isInitial: true,
    skillCount,
    names: Array.from({ length: skillCount }, (_, index) => `skill-${index}`),
    content: filler(characters),
  });

/**
 * An `agent_listing_delta` attachment: Custom Agents.
 */
export const agentListing = (characters: number): FixtureRecord =>
  attachmentRecord({
    type: "agent_listing_delta",
    addedTypes: ["reviewer"],
    removedTypes: [],
    addedLines: [filler(characters)],
  });

/**
 * A `nested_memory` attachment: Memory Files.
 */
export const nestedMemory = (
  characters: number,
  path = "/fixture/rules/example.md",
): FixtureRecord =>
  attachmentRecord({
    type: "nested_memory",
    path,
    content: { rawContent: filler(characters), globs: [] },
  });

/**
 * An `mcp_instructions_delta` attachment: MCP.
 */
export const mcpInstructions = (characters: number): FixtureRecord =>
  attachmentRecord({
    type: "mcp_instructions_delta",
    addedBlocks: [filler(characters)],
  });

/**
 * A `deferred_tools_delta` attachment: MCP.
 */
export const deferredTools = (characters: number): FixtureRecord =>
  attachmentRecord({
    type: "deferred_tools_delta",
    addedLines: [filler(characters)],
  });

/**
 * An attachment kind the parser has no Category for: Messages / Reminder.
 */
export const otherAttachment = (type: string, characters: number): FixtureRecord =>
  attachmentRecord({ type, text: filler(characters) });

/**
 * A `user` Record carrying a plain text block.
 */
export const userMessage = (characters: number): FixtureRecord => ({
  ...next(),
  type: "user",
  message: { role: "user", content: [{ type: "text", text: filler(characters) }] },
});

/**
 * A `user` Record carrying a tool result block.
 */
export const toolResult = (characters: number): FixtureRecord => ({
  ...next(),
  type: "user",
  message: {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "toolu_fixture", content: filler(characters) }],
  },
});

/**
 * A `user` Record whose text is a system reminder: Messages / Reminder.
 */
export const reminderMessage = (characters: number): FixtureRecord => ({
  ...next(),
  type: "user",
  message: {
    role: "user",
    content: [{ type: "text", text: `<system-reminder>${filler(characters)}</system-reminder>` }],
  },
});

/**
 * Measured usage numbers for one API Call.
 */
export type FixtureUsage = {
  /**
   * `input_tokens`.
   */
  readonly input?: number | undefined;
  /**
   * `cache_read_input_tokens`.
   */
  readonly cacheRead?: number | undefined;
  /**
   * `cache_creation_input_tokens`.
   */
  readonly cacheCreation?: number | undefined;
};

/**
 * Options for a synthetic `assistant` Record.
 *
 * This is a call-site options bag rather than a data object, so omitting a key
 * is meaningful here and the keys stay optional.
 */
export type AssistantOptions = {
  /**
   * `message.id`; Records sharing an id belong to one API Call.
   */
  readonly id: string;
  /**
   * Model id, defaulting to a 200k-window model.
   */
  readonly model?: string | undefined;
  /**
   * Usage numbers; omit to emit an assistant Record that opens no API Call.
   */
  readonly usage?: FixtureUsage | undefined;
  /**
   * Characters of assistant text, charged to the *next* API Call.
   */
  readonly textCharacters?: number | undefined;
  /**
   * Name of a `tool_use` block to append.
   */
  readonly toolUse?: string | undefined;
  /**
   * Characters of `thinking`, which is never re-sent.
   */
  readonly thinkingCharacters?: number | undefined;
};

/**
 * An `assistant` Record. With `usage` it opens (or continues) an API Call.
 */
export const assistantMessage = (options: AssistantOptions): FixtureRecord => {
  const content: FixtureRecord[] = [];
  if (options.thinkingCharacters !== undefined) {
    content.push({
      type: "thinking",
      thinking: filler(options.thinkingCharacters),
      signature: "sig",
    });
  }
  if (options.textCharacters !== undefined) {
    content.push({ type: "text", text: filler(options.textCharacters) });
  }
  if (options.toolUse !== undefined) {
    content.push({ type: "tool_use", id: "toolu_fixture", name: options.toolUse, input: {} });
  }
  return {
    ...next(),
    type: "assistant",
    requestId: `req_${options.id}`,
    message: {
      id: options.id,
      role: "assistant",
      model: options.model ?? "claude-sonnet-4-5-20250929",
      content,
      ...(options.usage === undefined
        ? {}
        : {
            usage: {
              input_tokens: options.usage.input ?? 0,
              cache_read_input_tokens: options.usage.cacheRead ?? 0,
              cache_creation_input_tokens: options.usage.cacheCreation ?? 0,
            },
          }),
    },
  };
};

/**
 * A `user` Record flagged as the summary Claude Code writes after a compaction.
 */
export const compactSummary = (characters: number): FixtureRecord => ({
  ...next(),
  type: "user",
  isCompactSummary: true,
  message: { role: "user", content: [{ type: "text", text: filler(characters) }] },
});

/**
 * A Record of a type the parser does not account for.
 */
export const metadataRecord = (type: string): FixtureRecord => ({
  ...next(),
  type,
  subtype: "turn_duration",
});

/**
 * Serialises Records into a JSONL transcript.
 */
export const toJsonl = (records: readonly FixtureRecord[]): string =>
  records.map((record) => JSON.stringify(record)).join("\n") + "\n";
