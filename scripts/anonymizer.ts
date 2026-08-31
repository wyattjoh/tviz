/**
 * Anonymizer — turns a real Session transcript into a synthetic one.
 *
 * The transformation is structure-preserving: Record order, Record `type`
 * sequence, key order, numbers, booleans and `null` all survive untouched, so
 * the Measured Tokens of every API Call stay exact and a Demo Session keeps the
 * context growth of the Session it came from. Every free-text string is
 * replaced by deterministic, seeded word salad of the same length with newline
 * positions preserved; only enum-like values (Record and Attachment types,
 * roles, model ids, tool names, versions and timestamps) are kept, because the
 * parser reads them and they carry no private content.
 *
 * Uuids are kept: a uuid is random by construction, so it cannot carry free
 * text, and keeping it means a Demo Session's `sessionId` still equals the name
 * of the file it is written to (the Loader derives a Session id from either).
 * Id-keyed values that are *not* uuids (`msg_…`, `toolu_…`, `req_…`) are
 * rewritten to a same-shape fake, because such an id can embed free text. The
 * rewrite is a pure function of the original, so `message.id` grouping one API
 * Call and `tool_use_id` pairing still resolve.
 *
 * Object keys are the other place free text hides: a file-backup map is keyed
 * by file name. Keys are therefore kept only when they are known schema keys
 * (`SCHEMA_KEYS`); every other key is renamed to a same-length fake. Unknown
 * keys are renamed rather than kept so that a key the schema never had — a file
 * name, a branch name — cannot survive.
 *
 * This module is pure: no filesystem, no process, no side effects. The CLI in
 * `scripts/anonymize.ts` wraps it.
 */

/**
 * Seed used when the caller does not supply one. The output is a pure function
 * of (input, seed), so re-running with the same seed reproduces a Demo Session
 * byte for byte.
 */
export const DEFAULT_SEED = "tviz";

/**
 * Result of anonymizing a whole transcript file.
 */
export type AnonymizeTranscriptResult = {
  /**
   * The synthetic transcript text, with the same number of lines as the input.
   */
  text: string;
  /**
   * Number of lines in the input (and therefore in the output).
   */
  lineCount: number;
  /**
   * Number of lines that parsed as JSON Records.
   */
  recordCount: number;
  /**
   * Number of non-blank lines that failed to parse; they are replaced by word
   * salad of the same length rather than copied through.
   */
  malformedLines: number;
  /**
   * Count of Records per top-level `type`, for reviewing the output.
   */
  recordTypes: ReadonlyMap<string, number>;
};

/**
 * Words used to build the replacement salad. Latin only, so no substring of a
 * real transcript — English prose, code identifiers, paths — can appear in the
 * output by accident.
 */
const SALAD_WORDS = [
  "lorem",
  "ipsum",
  "dolor",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "eiusmod",
  "tempor",
  "incididunt",
  "labore",
  "dolore",
  "magna",
  "aliqua",
  "enim",
  "minim",
  "veniam",
  "quis",
  "nostrud",
  "exercitation",
  "ullamco",
  "laboris",
  "nisi",
  "aliquip",
  "commodo",
  "consequat",
  "duis",
  "aute",
  "irure",
  "reprehenderit",
  "voluptate",
  "velit",
  "esse",
  "cillum",
  "fugiat",
  "nulla",
  "pariatur",
  "excepteur",
  "sint",
  "occaecat",
  "cupidatat",
  "proident",
  "culpa",
  "officia",
  "deserunt",
  "mollit",
  "anim",
  "laborum",
];

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

const BASE64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Keys whose string values are schema enums or Claude Code identifiers. Their
 * value is kept verbatim only when it is also enum-shaped (`isEnumLike`): the
 * key name alone is not a promise that the value is an enum, and free text
 * stored under `status` or `level` must not survive.
 *
 * `hookEvent` is here but `hookName` deliberately is not: the event is a closed
 * protocol vocabulary (`PreToolUse`, `PostToolUse`, …), while the name is
 * whatever the developer typed in their settings. Surveying the corpus found 6
 * distinct events against 62 distinct names, most of them longer than twenty
 * characters — a per-user vocabulary, so it is free text.
 */
const ENUM_KEYS: ReadonlySet<string> = new Set([
  "type",
  "subtype",
  "role",
  "model",
  "level",
  "stop_reason",
  "service_tier",
  "entrypoint",
  "userType",
  "version",
  "timestamp",
  "effort",
  "permissionMode",
  "mode",
  "sessionKind",
  "promptSource",
  "operation",
  "status",
  "media_type",
  "commandMode",
  "decision",
  "reminderType",
  "inference_geo",
  "speed",
  "hookEvent",
  "trigger",
]);

/**
 * Keys whose string values are paths, branches or URIs. Their content is
 * replaced like any other string, but the replacement keeps the `/` positions
 * and a recognisable file extension so the Demo Session still looks like a
 * transcript.
 */
const PATH_KEYS: ReadonlySet<string> = new Set([
  "cwd",
  "gitBranch",
  "path",
  "displayPath",
  "filename",
  "filenames",
  "planFilePath",
  "slug",
  "uri",
  "file_path",
  "filePath",
  "notebook_path",
  "originalCwd",
  "projectPath",
  "transcriptPath",
]);

/**
 * Block types on which a `name` is a built-in or MCP tool name rather than
 * something the user wrote.
 */
const TOOL_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "tool_use",
  "tool_result",
  "server_tool_use",
  "mcp_tool_use",
  "mcp_tool_result",
]);

/**
 * Built-in Claude Code tool names, which are public vocabulary: they are the
 * same for every user, so they carry nothing private, and keeping them is what
 * lets a Demo Session's inspector read `tool_result Bash` instead of salad.
 *
 * This is an allow-list, so it fails closed. A tool added by a newer Claude
 * Code, an MCP server, a Skill or a plugin is not on it and is replaced; the
 * cost of the list going stale is a less readable Demo Session, never a leak.
 */
const BUILTIN_TOOL_NAMES: ReadonlySet<string> = new Set([
  "Agent",
  "AskUserQuestion",
  "Bash",
  "BashOutput",
  "Edit",
  "ExitPlanMode",
  "EnterPlanMode",
  "Glob",
  "Grep",
  "KillBash",
  "KillShell",
  "LS",
  "ListMcpResourcesTool",
  "MultiEdit",
  "NotebookEdit",
  "NotebookRead",
  "Read",
  "ReadMcpResourceTool",
  "Skill",
  "SlashCommand",
  "Task",
  "TodoRead",
  "TodoWrite",
  "WebFetch",
  "WebSearch",
  "Write",
]);

/**
 * An MCP tool name: the public `mcp__` prefix followed by the server name and
 * the tool name, both of which come from the developer's own configuration.
 */
const MCP_TOOL_NAME = /^mcp__.+$/;

/**
 * File extensions kept on the last segment of a fake path.
 */
const SAFE_EXTENSIONS: ReadonlySet<string> = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "json",
  "jsonl",
  "md",
  "mdx",
  "txt",
  "css",
  "html",
  "yml",
  "yaml",
  "toml",
  "lock",
  "sh",
  "py",
  "go",
  "rs",
  "sql",
  "png",
  "svg",
]);

const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?$/;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SAFE_EXTENSION_SUFFIX = /\.([A-Za-z0-9]{1,6})$/;

const URI_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const ID_PREFIX = /^[a-z]{2,10}_/;

const HEXISH = /^[0-9a-f-]+$/;

const ID_SEPARATORS = "-_.:";

const DIGITS = "0123456789";

const LETTER = /[A-Za-z]/;

/**
 * Longest run of letters generated filler and fake ids may contain, so random
 * output cannot spell a term a PII grep looks for.
 */
const MAX_LETTER_RUN = 3;

/**
 * Object keys that are part of the transcript schema, surveyed over 101 real
 * Sessions (Claude Code 2.1.140–2.1.251): every key that occurred in ten or
 * more of them, plus the keys the parser and the spec name.
 *
 * The list is an allow-list on purpose. Object keys carry content as often as
 * values do — a file-backup map is keyed by file name — and a file name is
 * shaped exactly like an identifier, so no pattern can separate the two. A key
 * that is not listed is therefore renamed: it costs only fidelity on metadata
 * no Category is derived from, and it cannot leak.
 */
const OBSERVED_SCHEMA_KEYS = `
  type subtype role message content attachment toolUseResult snapshot usage input
  sessionId session_id uuid parentUuid leafUuid messageId promptId requestId id
  toolUseID sourceToolUseID sourceToolAssistantUUID tool_use_id interruptedMessageId
  snapshotMessageId taskId backgroundTaskId agentId
  version timestamp userType entrypoint isSidechain isMeta isNew isInitial isImage
  isSnapshotUpdate isCompactSummary compactMetadata
  model resolvedModel stop_reason stop_sequence stop_details service_tier speed
  inference_geo effort permissionMode promptSource commandMode commandName command
  reminderType operation gitOperation kind origin caller mode level status decision
  trigger sessionKind subagent_type agentType agent_type
  input_tokens output_tokens cache_creation_input_tokens cache_read_input_tokens
  cache_creation cache_miss_reason cache_missed_input_tokens output_tokens_details
  thinking_tokens ephemeral_1h_input_tokens ephemeral_5m_input_tokens
  server_tool_use web_search_requests web_fetch_requests total_deferred_tools
  text thinking signature source data media_type name names addedNames removedNames
  readdedNames addedLines addedTypes removedTypes addedBlocks skillCount skill
  attributionSkill attributionPlugin pendingMcpServers globs rawContent
  contentDiffersFromDisk itemCount messageCount iterations
  hookEvent hookName hookCount hookInfos hookErrors hookAdditionalContext
  preventedContinuation returnCodeInterpretation showConcurrencyNote
  stdout stderr exitCode is_error interrupted noOutputExpected hasOutput stopReason
  success timeout run_in_background args to from subject task activeForm blockedBy
  blocks updatedFields statusChange bashFirst steerOnly bypass autoModeConsentFlow
  toolDenialKind staleReadFileStateHint allowedTools atis
  file files filename filenames file_path filePath path notebook_path displayPath
  planFilePath trackingPath realParentDir backup backupFileName backupTime
  originalFile originalCwd projectPath transcriptPath trackedFileBackups
  structuredPatch oldStart oldLines newStart newLines lines numLines startLine
  totalLines offset limit old_string new_string oldString newString replace_all
  replaceAll userModified diagnostics severity range start end line character code
  uri url sha commit slug cwd gitBranch
  description aiTitle lastPrompt prompt snippet label header question questions
  answers options multiSelect query matches max_results tool_name annotations
  durationMs truncated
`
  .trim()
  .split(/\s+/);

/**
 * Every key kept verbatim: the surveyed schema keys plus the enum-valued and
 * path-valued keys, which are schema by definition.
 */
const SCHEMA_KEYS: ReadonlySet<string> = new Set([
  ...OBSERVED_SCHEMA_KEYS,
  ...ENUM_KEYS,
  ...PATH_KEYS,
]);

/**
 * Whether an object key belongs to the transcript schema. Anything else — a
 * path, a file name, a sentence used as a key — is renamed like a path.
 */
function isSchemaKey(key: string): boolean {
  return SCHEMA_KEYS.has(key);
}

const ENUM_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:+[\]-]*$/;

const MEDIA_TYPE = /^[a-z]+\/[a-z0-9.+-]+$/i;

/**
 * Longest value kept under an allow-listed key. Enums, model ids and versions
 * are short tokens; anything longer is prose that happened to land under an
 * allow-listed key name.
 */
const MAX_ENUM_VALUE_LENGTH = 64;

/**
 * Whether a value is shaped like the enum its key promises: one short token,
 * no whitespace, no punctuation that prose needs. The key name alone is not
 * enough — `status` can hold a sentence — so the shape is what decides.
 */
function isEnumLike(value: string, key: string): boolean {
  if (value.length > MAX_ENUM_VALUE_LENGTH) return false;
  if (key === "media_type") return MEDIA_TYPE.test(value);
  return ENUM_VALUE.test(value);
}

/**
 * How a string value is replaced.
 */
type StringKind = "keep" | "text" | "path" | "filler" | "id" | "mcpTool";

/**
 * FNV-1a, used only to turn (seed, value) into a random stream. Not a security
 * primitive: the guarantee is that no input text reaches the output, not that
 * the mapping is one-way.
 */
function hash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * An sfc32 generator seeded from the seed and a salt, so the same value always
 * yields the same replacement within one run and across runs. The 128-bit state
 * makes two different ids sharing a replacement stream vanishingly unlikely,
 * which matters because rewritten ids must stay distinct.
 */
function makeRandom(seed: string, salt: string): () => number {
  const material = `${seed}|${salt}`;
  let a = hash32(`a|${material}`);
  let b = hash32(`b|${material}`);
  let c = hash32(`c|${material}`);
  let d = hash32(`d|${material}`);
  return () => {
    const sum = (((a + b) >>> 0) + d) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    c = (c + sum) >>> 0;
    d = (d + 1) >>> 0;
    return sum / 4294967296;
  };
}

function pick(items: readonly string[], random: () => number): string {
  return items[Math.floor(random() * items.length)] ?? items[0] ?? "";
}

function pickChar(chars: string, random: () => number): string {
  return chars.charAt(Math.floor(random() * chars.length));
}

/**
 * Word salad of exactly `length` characters, never ending in a separator.
 */
function salad(length: number, separator: string, random: () => number): string {
  if (length <= 0) return "";
  let out = "";
  while (out.length < length) {
    if (out.length > 0) out += separator;
    out += pick(SALAD_WORDS, random);
  }
  out = out.slice(0, length);
  if (out.endsWith(separator)) {
    out = out.slice(0, -separator.length) + pickChar(LETTERS, random);
  }
  return out;
}

/**
 * Filler of exactly `length` characters for base64 payloads and thinking
 * signatures, which are opaque blobs rather than prose.
 *
 * Runs of letters are capped at three so that a megabyte of random filler can
 * never spell a word a PII grep looks for.
 */
function filler(length: number, random: () => number): string {
  let out = "";
  let run = 0;
  for (let index = 0; index < length; index += 1) {
    const char = run >= MAX_LETTER_RUN ? pickChar(DIGITS, random) : pickChar(BASE64_CHARS, random);
    run = LETTER.test(char) ? run + 1 : 0;
    out += char;
  }
  return out;
}

/**
 * A fake id of exactly the same length and shape: a leading `msg_` / `toolu_` /
 * `req_` style prefix and any separators stay, digits stay digits, letters stay
 * letters (hex where the original was hex), so the result still reads as an id
 * and a uuid still looks like a uuid.
 */
function fakeId(value: string, random: () => number): string {
  const prefix = ID_PREFIX.exec(value)?.[0] ?? "";
  const body = value.slice(prefix.length);
  const lower = HEXISH.test(body) ? "abcdef" : LETTERS;
  let out = "";
  let run = 0;
  // Indexed by UTF-16 code unit, not by code point: every length guarantee in
  // this module is `String.length`, so a non-BMP character must produce two
  // replacement characters rather than one.
  for (let index = 0; index < body.length; index += 1) {
    const char = body.charAt(index);
    let next: string;
    if (ID_SEPARATORS.includes(char)) next = char;
    else if ((char >= "0" && char <= "9") || run >= MAX_LETTER_RUN) {
      next = pickChar(DIGITS, random);
    } else if (char >= "A" && char <= "Z") next = pickChar(lower.toUpperCase(), random);
    else next = pickChar(lower, random);
    run = LETTER.test(next) ? run + 1 : 0;
    out += next;
  }
  return prefix + out;
}

/**
 * A fake path of exactly the same length, keeping every `/`, any URI scheme and
 * a recognisable file extension.
 */
function fakePath(value: string, random: () => number): string {
  const scheme = URI_SCHEME.exec(value)?.[0] ?? "";
  const segments = value.slice(scheme.length).split("/");
  const lastIndex = segments.length - 1;
  const replaced = segments.map((segment, index) => {
    if (index === lastIndex) {
      const extension = SAFE_EXTENSION_SUFFIX.exec(segment);
      const suffix = extension?.[0] ?? "";
      const name = extension?.[1] ?? "";
      if (suffix !== "" && SAFE_EXTENSIONS.has(name.toLowerCase())) {
        return salad(segment.length - suffix.length, "-", random) + suffix;
      }
    }
    return salad(segment.length, "-", random);
  });
  return scheme + replaced.join("/");
}

/**
 * A fake MCP tool name of exactly the same length: the public `mcp__` prefix
 * and the `__` separators stay, every other segment becomes salad. The UI reads
 * a tool name to label a row, so an MCP call still reads as one.
 *
 * `salad` never emits two separators in a row, so a replaced segment cannot
 * grow a `__` of its own and change how the name splits.
 */
function fakeMcpToolName(value: string, random: () => number): string {
  const segments = value.split("__");
  return segments
    .map((segment, index) => (index === 0 ? segment : salad(segment.length, "_", random)))
    .join("__");
}

function isIdKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower === "id" ||
    lower.endsWith("uuid") ||
    lower.endsWith("_id") ||
    /[a-z0-9](?:Id|ID)$/.test(key)
  );
}

function classify(
  value: string,
  key: string | undefined,
  parent: Record<string, unknown> | undefined,
): StringKind {
  if (value.length === 0) return "keep";
  if (ISO_TIMESTAMP.test(value)) return "keep";
  // A uuid is random by construction, so it carries no free text. Keeping it is
  // what lets a Demo Session's `sessionId` still match its file name.
  if (UUID.test(value)) return "keep";
  if (key === undefined) return "text";
  // Opaque blobs: base64 image data and thinking signatures.
  if (key === "data" || key === "signature") return "filler";
  // A `name` is only ever safe on a tool block, and even there only when it is
  // a built-in: an MCP name embeds the server the developer configured, and a
  // Skill, sub-agent or plugin tool is named by the developer outright.
  if (key === "name") {
    if (!TOOL_BLOCK_TYPES.has(String(parent?.["type"] ?? ""))) return "text";
    if (BUILTIN_TOOL_NAMES.has(value)) return "keep";
    if (MCP_TOOL_NAME.test(value)) return "mcpTool";
    return "text";
  }
  if (ENUM_KEYS.has(key)) return isEnumLike(value, key) ? "keep" : "text";
  if (isIdKey(key)) return "id";
  if (PATH_KEYS.has(key)) return "path";
  return "text";
}

function anonymizeString(
  value: string,
  key: string | undefined,
  parent: Record<string, unknown> | undefined,
  seed: string,
): string {
  const kind = classify(value, key, parent);
  if (kind === "keep") return value;
  const random = makeRandom(seed, `${kind}|${value}`);
  return value
    .split("\n")
    .map((segment) => {
      if (kind === "id") return fakeId(segment, random);
      if (kind === "mcpTool") return fakeMcpToolName(segment, random);
      if (kind === "path") return fakePath(segment, random);
      if (kind === "filler") return filler(segment.length, random);
      return salad(segment.length, " ", random);
    })
    .join("\n");
}

function renameKey(key: string, taken: ReadonlySet<string>, seed: string): string {
  let attempt = 0;
  let candidate = fakePath(key, makeRandom(seed, `key|${key}`));
  while (taken.has(candidate)) {
    attempt += 1;
    candidate = fakePath(key, makeRandom(seed, `key${attempt}|${key}`));
  }
  return candidate;
}

function anonymizeObject(source: Record<string, unknown>, seed: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // A renamed key may not collide with a key already written *or* with a schema
  // key still to come, or the object would lose an entry.
  const taken = new Set(Object.keys(source));
  for (const [key, value] of Object.entries(source)) {
    // Keys that are not schema (file-backup maps keyed by file name) are
    // renamed like paths: same length, no input text.
    const outKey = isSchemaKey(key) ? key : renameKey(key, taken, seed);
    taken.add(outKey);
    out[outKey] = anonymizeValue(value, key, source, seed);
  }
  return out;
}

function anonymizeValue(
  value: unknown,
  key: string | undefined,
  parent: Record<string, unknown> | undefined,
  seed: string,
): unknown {
  if (typeof value === "string") return anonymizeString(value, key, parent, seed);
  if (Array.isArray(value)) {
    return value.map((item) => anonymizeValue(item, key, parent, seed));
  }
  if (value !== null && typeof value === "object") {
    return anonymizeObject(value as Record<string, unknown>, seed);
  }
  return value;
}

/**
 * Anonymize one decoded Record.
 *
 * @param record - The parsed JSON value of one transcript line.
 * @param seed - Seed for the replacement text; the same seed reproduces the
 *   same output.
 * @returns A new value with identical shape, numbers, booleans and nulls.
 */
export function anonymizeRecord(record: unknown, seed: string): unknown {
  return anonymizeValue(record, undefined, undefined, seed);
}

/**
 * Anonymize a whole JSONL transcript.
 *
 * Blank lines pass through, so the line count and the Record `type` sequence of
 * the input are preserved exactly. A CRLF line ending survives as CRLF. Lines
 * that are not valid JSON are replaced by word salad — never copied — and
 * counted.
 *
 * @param text - The transcript file contents.
 * @param seed - Seed for the replacement text.
 * @returns The synthetic text plus counts for reviewing the result.
 */
export function anonymizeTranscript(text: string, seed: string): AnonymizeTranscriptResult {
  const lines = text.split("\n");
  const recordTypes = new Map<string, number>();
  let recordCount = 0;
  let malformedLines = 0;

  const out = lines.map((rawLine) => {
    // A CRLF transcript reaches us as lines ending in "\r"; the terminator is
    // structure, so it is split off and put back rather than replaced.
    const carriageReturn = rawLine.endsWith("\r") ? "\r" : "";
    const line = rawLine.slice(0, rawLine.length - carriageReturn.length);
    if (line.trim() === "") return rawLine;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      malformedLines += 1;
      return salad(line.length, " ", makeRandom(seed, `text|${line}`)) + carriageReturn;
    }
    recordCount += 1;
    const type = recordTypeOf(record);
    recordTypes.set(type, (recordTypes.get(type) ?? 0) + 1);
    return JSON.stringify(anonymizeRecord(record, seed)) + carriageReturn;
  });

  return {
    text: out.join("\n"),
    lineCount: lines.length,
    recordCount,
    malformedLines,
    recordTypes,
  };
}

function recordTypeOf(record: unknown): string {
  if (record === null || typeof record !== "object") return "(not-an-object)";
  const type = (record as Record<string, unknown>)["type"];
  return typeof type === "string" ? type : "(untyped)";
}

/**
 * Compare one decoded Record against its anonymized counterpart, collecting
 * every structural difference. Structure is everything the Anonymizer promises
 * to keep: the shape of the tree, numbers, booleans, nulls, string lengths and
 * key names — content keys may be renamed, but only to a key of the same
 * length.
 */
function compareStructure(before: unknown, after: unknown, path: string, out: string[]): void {
  if (before === null || after === null) {
    if (before !== after) out.push(`${path}: ${describe(before)} became ${describe(after)}`);
    return;
  }
  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after) || before.length !== after.length) {
      out.push(`${path}: ${describe(before)} became ${describe(after)}`);
      return;
    }
    before.forEach((item, index) => {
      compareStructure(item, after[index], `${path}[${index}]`, out);
    });
    return;
  }
  if (typeof before === "object" || typeof after === "object") {
    if (typeof before !== "object" || typeof after !== "object") {
      out.push(`${path}: ${describe(before)} became ${describe(after)}`);
      return;
    }
    const beforeEntries = Object.entries(before as Record<string, unknown>);
    const afterEntries = Object.entries(after as Record<string, unknown>);
    if (beforeEntries.length !== afterEntries.length) {
      out.push(`${path}: ${beforeEntries.length} keys became ${afterEntries.length}`);
      return;
    }
    beforeEntries.forEach(([key, value], index) => {
      const entry = afterEntries[index];
      const afterKey = entry?.[0] ?? "";
      if (isSchemaKey(key) ? afterKey !== key : afterKey.length !== key.length) {
        out.push(`${path}: key ${index} changed shape`);
        return;
      }
      const label = isSchemaKey(key) ? key : `<key${index}>`;
      compareStructure(value, entry?.[1], `${path}.${label}`, out);
    });
    return;
  }
  if (typeof before === "string" || typeof after === "string") {
    if (typeof before !== "string" || typeof after !== "string" || before.length !== after.length) {
      out.push(`${path}: ${describe(before)} became ${describe(after)}`);
    }
    return;
  }
  if (!Object.is(before, after)) {
    out.push(`${path}: ${describe(before)} became ${describe(after)}`);
  }
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `array(${value.length})`;
  if (typeof value === "object") return "object";
  if (typeof value === "string") return `string(${value.length})`;
  return `${typeof value}(${String(value)})`;
}

/**
 * Compare a transcript against its anonymized output.
 *
 * Every difference reported here is a bug in the Anonymizer: a changed line
 * count, a changed line ending, a changed Record `type`, a changed number
 * (usage fields included), a changed string length, or a lost key. Used by the
 * CLI to self-check before it writes, and by the tests.
 *
 * @param before - The original transcript text.
 * @param after - The anonymized transcript text.
 * @param limit - Maximum number of differences to report.
 * @returns Human-readable differences; empty when the structure is identical.
 */
export function findStructuralDifferences(
  before: string,
  after: string,
  limit: number = 20,
): string[] {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const differences: string[] = [];

  if (beforeLines.length !== afterLines.length) {
    differences.push(`line count ${beforeLines.length} became ${afterLines.length}`);
    return differences;
  }

  for (let index = 0; index < beforeLines.length && differences.length < limit; index += 1) {
    const beforeLine = beforeLines[index] ?? "";
    const afterLine = afterLines[index] ?? "";
    if (beforeLine.endsWith("\r") !== afterLine.endsWith("\r")) {
      differences.push(`line ${index + 1}: line ending changed`);
      continue;
    }
    if (beforeLine.trim() === "" || afterLine.trim() === "") {
      if (beforeLine.trim() !== afterLine.trim()) {
        differences.push(`line ${index + 1}: blank line mismatch`);
      }
      continue;
    }
    let beforeRecord: unknown;
    try {
      beforeRecord = JSON.parse(beforeLine);
    } catch {
      // Malformed input lines have no structure to preserve.
      continue;
    }
    let afterRecord: unknown;
    try {
      afterRecord = JSON.parse(afterLine);
    } catch {
      differences.push(`line ${index + 1}: output is not valid JSON`);
      continue;
    }
    const beforeType = recordTypeOf(beforeRecord);
    const afterType = recordTypeOf(afterRecord);
    if (beforeType !== afterType) {
      differences.push(`line ${index + 1}: record type ${beforeType} became ${afterType}`);
      continue;
    }
    const lineDifferences: string[] = [];
    compareStructure(beforeRecord, afterRecord, `line ${index + 1}`, lineDifferences);
    if (lineDifferences.length > 0) differences.push(lineDifferences[0] ?? "");
  }

  return differences.slice(0, limit);
}

/**
 * Inputs for {@link defaultForbiddenTerms}, passed in rather than read from the
 * environment so the derivation stays pure and testable.
 */
export type ForbiddenTermsInput = {
  /**
   * The account name of the user running the Anonymizer.
   */
  username: string | undefined;
  /**
   * The home directory of that user.
   */
  homeDirectory: string | undefined;
  /**
   * Repository, project and directory names known to be private.
   */
  knownTerms: readonly string[];
};

const USERNAME_PARTS = /[._\-\s]+/;

/**
 * The terms a Demo Session must never contain: the developer's account name
 * and each part of it (a `first.last` username also leaks as `first`), their
 * home directory and its last segment, and the private repository names the
 * caller knows about.
 *
 * @param input - Username, home directory and known private names.
 * @returns Deduplicated terms, longest first so a report names the widest
 *   match; terms shorter than three characters are dropped as meaningless.
 */
export function defaultForbiddenTerms(input: ForbiddenTermsInput): string[] {
  const home = input.homeDirectory ?? "";
  const homeSegment =
    home
      .split("/")
      .filter((segment) => segment !== "")
      .at(-1) ?? "";
  const username = input.username ?? "";
  const candidates = [
    home,
    homeSegment,
    username,
    ...username.split(USERNAME_PARTS),
    ...input.knownTerms,
  ];
  const terms: string[] = [];
  for (const candidate of candidates) {
    const term = candidate.trim();
    if (term.length < 3 || terms.includes(term)) continue;
    terms.push(term);
  }
  return terms.sort((left, right) => right.length - left.length);
}

/**
 * Search text for terms that must never survive anonymization (the developer's
 * username, home directory, repository names).
 *
 * @param text - The anonymized transcript text.
 * @param terms - Terms to look for; case-insensitive, terms shorter than three
 *   characters are ignored to avoid meaningless hits.
 * @returns The terms that were found, in the order given.
 */
export function findForbiddenTerms(text: string, terms: readonly string[]): string[] {
  const haystack = text.toLowerCase();
  const found: string[] = [];
  for (const term of terms) {
    const needle = term.trim().toLowerCase();
    if (needle.length < 3) continue;
    if (haystack.includes(needle) && !found.includes(term)) found.push(term);
  }
  return found;
}
