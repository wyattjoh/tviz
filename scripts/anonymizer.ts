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
 * Ids and uuids are the one allow-listed group that is rewritten rather than
 * kept: an `id` can embed free text, so each one is replaced by a same-shape
 * fake id. The replacement is a pure function of the original, so every
 * reference the parser relies on — `message.id` grouping one API Call,
 * `parentUuid` chains, `tool_use_id` pairing — still resolves.
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
 * Keys whose string values are schema enums or Claude Code identifiers. They
 * are kept verbatim: the parser dispatches on them and none of them can hold
 * user content.
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
  "hookName",
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

const STRUCTURAL_KEY = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;

/**
 * Whether an object key holds structure rather than content. Anything else — a
 * path, a file name, a sentence used as a key — is renamed like a path.
 */
function isStructuralKey(key: string): boolean {
  return STRUCTURAL_KEY.test(key);
}

/**
 * How a string value is replaced.
 */
type StringKind = "keep" | "text" | "path" | "filler" | "id";

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
  for (const char of body) {
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
  if (UUID.test(value)) return "id";
  if (key === undefined) return "text";
  // Opaque blobs: base64 image data and thinking signatures.
  if (key === "data" || key === "signature") return "filler";
  // Tool names are built-in or MCP identifiers; a `name` anywhere else (skills,
  // agents, MCP servers) can be private.
  if (key === "name") {
    return TOOL_BLOCK_TYPES.has(String(parent?.["type"] ?? "")) ? "keep" : "text";
  }
  if (ENUM_KEYS.has(key)) return "keep";
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
      if (kind === "path") return fakePath(segment, random);
      if (kind === "filler") return filler(segment.length, random);
      return salad(segment.length, " ", random);
    })
    .join("\n");
}

function renameKey(key: string, taken: Record<string, unknown>, seed: string): string {
  let attempt = 0;
  let candidate = fakePath(key, makeRandom(seed, `key|${key}`));
  while (Object.hasOwn(taken, candidate)) {
    attempt += 1;
    candidate = fakePath(key, makeRandom(seed, `key${attempt}|${key}`));
  }
  return candidate;
}

function anonymizeObject(source: Record<string, unknown>, seed: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    // Keys that are content rather than schema (file-backup maps keyed by path)
    // are renamed like paths.
    const outKey = isStructuralKey(key) ? key : renameKey(key, out, seed);
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
 * the input are preserved exactly. Lines that are not valid JSON are replaced
 * by word salad — never copied — and counted.
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

  const out = lines.map((line) => {
    if (line.trim() === "") return line;
    let record: unknown;
    try {
      record = JSON.parse(line);
    } catch {
      malformedLines += 1;
      return salad(line.length, " ", makeRandom(seed, `text|${line}`));
    }
    recordCount += 1;
    const type = recordTypeOf(record);
    recordTypes.set(type, (recordTypes.get(type) ?? 0) + 1);
    return JSON.stringify(anonymizeRecord(record, seed));
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
      if (isStructuralKey(key) ? afterKey !== key : afterKey.length !== key.length) {
        out.push(`${path}: key ${index} changed shape`);
        return;
      }
      const label = isStructuralKey(key) ? key : `<key${index}>`;
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
 * count, a changed Record `type`, a changed number (usage fields included), a
 * changed string length, or a lost key. Used by the CLI to self-check before it
 * writes, and by the tests.
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
    const lineDifferences: string[] = [];
    compareStructure(beforeRecord, afterRecord, `line ${index + 1}`, lineDifferences);
    if (lineDifferences.length > 0) differences.push(lineDifferences[0] ?? "");
  }

  return differences.slice(0, limit);
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
