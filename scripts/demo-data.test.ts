/**
 * Checks the committed Demo Sessions rather than a synthetic stand-in: this is
 * the PII grep and the manifest audit, run on every `bun run test` so a slip
 * cannot reach a deploy.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { homedir, userInfo } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { decodeDemoManifest, type DemoManifest } from "../src/demo/manifest.ts";
import { CATEGORY_ORDER, type Session } from "../src/domain/context.ts";
import { parseTranscript } from "../src/parser/parse-transcript.ts";
import {
  BUILTIN_TOOL_NAMES,
  defaultForbiddenTerms,
  findForbiddenTerms,
  findRealText,
  findRealWords,
  KNOWN_PRIVATE_TERMS,
} from "./anonymizer.ts";

const repository = fileURLToPath(new URL("..", import.meta.url));
const demoDirectory = join(repository, "public", "demo");
const fixtureDirectory = join(repository, "src", "fixtures");

const readManifest = (): DemoManifest => {
  const decoded = decodeDemoManifest(
    JSON.parse(readFileSync(join(demoDirectory, "manifest.json"), "utf8")),
  );
  if (!decoded.ok) throw new Error(decoded.message);
  return decoded.manifest;
};

const manifest = readManifest();

const parseDemo = (file: string): Session => {
  const outcome = parseTranscript(file, readFileSync(join(demoDirectory, file), "utf8"));
  if (!outcome.ok) throw new Error(`${file} did not parse: ${outcome.message}`);
  return outcome.session;
};

/**
 * Every Demo Session, parsed once, keyed by its manifest id.
 */
const sessions = new Map<string, Session>(
  manifest.sessions.map((entry) => [entry.id, parseDemo(entry.file)]),
);

const sessionFor = (id: string): Session => {
  const session = sessions.get(id);
  if (session === undefined) throw new Error(`no Demo Session with the manifest id "${id}"`);
  return session;
};

const lastCall = (session: Session) => {
  const call = session.calls.at(-1);
  if (call === undefined) throw new Error("a Demo Session has no API Call");
  return call;
};

const hasEveryCategory = (session: Session): boolean =>
  CATEGORY_ORDER.every((category) => lastCall(session).byCategory[category] > 0);

/**
 * Labels the parser writes itself, so they say nothing about the transcript.
 */
const PARSER_LABELS: ReadonlySet<string> = new Set([
  "System prompt, built-in tools, root CLAUDE.md",
  "Custom agent listing",
  "Deferred tool listing",
  "MCP server instructions",
  "Skill listing",
  "Memory file",
  "User message",
  "Assistant message",
  "System reminder",
  "Tool result",
  "Tool use",
  "Image",
  "Unattributed context",
]);

/**
 * Block types on which a `name` is a tool name rather than something a person
 * wrote. Mirrors the Anonymizer's own list.
 */
const TOOL_BLOCK_TYPES: ReadonlySet<string> = new Set([
  "tool_use",
  "tool_result",
  "server_tool_use",
  "mcp_tool_use",
  "mcp_tool_result",
]);

const SKILL_LISTING = /^Skill listing \(\d+ skills\)$/;

const MEMORY_FILE = /^Memory file (.+)$/;

/**
 * A `type` from the transcript used verbatim as a label (`hook_success`,
 * `task_reminder`): enum-shaped, and kept by the Anonymizer by design.
 */
const RECORD_TYPE = /^[a-z][a-z0-9_]*$/;

/**
 * Whether an item label a Cell would list reads as placeholder text.
 *
 * A label is the parser's own wording, an enum the Anonymizer keeps (a Record
 * type, a tool name), or the parser's wording plus text from the transcript —
 * and that last part, the tail of a Memory File path, has to be word salad.
 */
const isSyntheticLabel = (label: string): boolean => {
  if (PARSER_LABELS.has(label)) return true;
  if (SKILL_LISTING.test(label)) return true;
  if (RECORD_TYPE.test(label)) return true;
  if (label.startsWith("Tool use: ")) return true;
  const memory = MEMORY_FILE.exec(label);
  return memory === null ? false : findRealWords(memory[1] ?? "").length === 0;
};

/**
 * Every file that ships to the browser as demo data, plus the test fixtures —
 * the two places real transcript text could reach the repository.
 */
const scannedFiles = (): readonly string[] => [
  ...readdirSync(demoDirectory).map((name) => `public/demo/${name}`),
  ...readdirSync(fixtureDirectory).map((name) => `src/fixtures/${name}`),
];

const forbidden = defaultForbiddenTerms({
  username: userInfo().username,
  homeDirectory: homedir(),
  knownTerms: KNOWN_PRIVATE_TERMS,
});

describe("bundled Demo Sessions", () => {
  it("lists three Demo Sessions and selects the medium one by default", () => {
    expect(manifest.sessions.map((entry) => entry.id)).toEqual(["small", "medium", "large"]);
    expect(manifest.defaultSessionId).toBe("medium");
  });

  it("covers different models and Claude Code versions", () => {
    const models = new Set(manifest.sessions.map((entry) => entry.model));
    const versions = new Set(manifest.sessions.map((entry) => entry.claudeCodeVersion));

    expect(models.size).toBe(manifest.sessions.length);
    expect(versions.size).toBe(manifest.sessions.length);
  });

  it.each(manifest.sessions)("$name matches what the manifest claims", (entry) => {
    const session = sessionFor(entry.id);

    expect(statSync(join(demoDirectory, entry.file)).size).toBe(entry.bytes);
    expect(session.calls).toHaveLength(entry.calls);
    expect(session.model).toBe(entry.model);
    expect(session.claudeCodeVersion).toBe(entry.claudeCodeVersion);
    expect(session.malformedLines).toBe(0);
  });

  // The app selects and keys Session rows on the *parsed* id, not the manifest
  // id, and the Anonymizer keeps `sessionId` — so two Demo Sessions taken from
  // one source Session would collide however the manifest names them.
  it("gives every Demo Session a distinct parsed Session id", () => {
    const ids = manifest.sessions.map((entry) => sessionFor(entry.id).id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("the descriptions a reviewer reads", () => {
    it("small: almost two thirds of a 200k window is System", () => {
      const session = sessionFor("small");
      const call = lastCall(session);

      expect(session.windowSize).toBe(200_000);
      expect(call.byCategory.system / call.measuredTotal).toBeGreaterThan(0.6);
      expect(call.byCategory.system / call.measuredTotal).toBeLessThan(0.7);
    });

    it("medium: the only Demo Session in which all six Categories are present", () => {
      expect(hasEveryCategory(sessionFor("medium"))).toBe(true);

      const withEveryCategory = manifest.sessions
        .filter((entry) => hasEveryCategory(sessionFor(entry.id)))
        .map((entry) => entry.id);
      expect(withEveryCategory).toEqual(["medium"]);
    });

    it("medium: sixty-odd API Calls fill about half a 200k window", () => {
      const session = sessionFor("medium");

      expect(session.windowSize).toBe(200_000);
      expect(lastCall(session).measuredTotal / session.windowSize).toBeGreaterThan(0.4);
      expect(lastCall(session).measuredTotal / session.windowSize).toBeLessThan(0.6);
    });

    it("large: one compaction part-way through a 1M window", () => {
      const session = sessionFor("large");

      expect(session.windowSize).toBe(1_000_000);
      expect(session.calls.filter((call) => call.reset)).toHaveLength(1);
    });

    it("small and large are not described as compacting", () => {
      for (const id of ["small", "large"]) {
        const resets = sessionFor(id).calls.filter((call) => call.reset).length;
        expect.soft(resets, `${id} has ${resets} compactions`).toBe(id === "large" ? 1 : 0);
      }
    });
  });

  // "Loads within a few seconds" is a size question first: the whole demo has
  // to cross the network before the Worker sees it.
  it.each(manifest.sessions)("$name stays under 2 MB", (entry) => {
    expect(entry.bytes).toBeLessThanOrEqual(2_000_000);
  });

  it("orders the Demo Sessions small to large", () => {
    const sizes = manifest.sessions.map((entry) => entry.bytes);
    expect(sizes).toEqual([...sizes].sort((left, right) => left - right));
  });
});

describe("demo and fixture data carry no private content", () => {
  it.each(scannedFiles())("%s contains no forbidden term", (relativePath) => {
    const text = readFileSync(join(repository, relativePath), "utf8");
    expect(findForbiddenTerms(text, forbidden)).toEqual([]);
  });

  // Stronger than the forbidden-term scan, which only asks whether known
  // private strings survived: every string the Anonymizer would have replaced
  // has to read as Latin word salad, a fake path, a fake id or base64 filler,
  // so an English sentence that names nobody still fails here.
  it.each(manifest.sessions)("$name contains nothing but synthetic text", (entry) => {
    const text = readFileSync(join(demoDirectory, entry.file), "utf8");

    expect(findRealText(text)).toEqual([]);
  });

  // What a reviewer will read in a Cell's item list is these labels: the
  // parser's own words plus, for a Memory File, a path out of the transcript.
  it.each(manifest.sessions)("$name shows placeholder text in its items", (entry) => {
    const labels = new Set(
      sessionFor(entry.id).calls.flatMap((call) => call.added.map((item) => item.label)),
    );

    for (const label of labels) {
      expect.soft(isSyntheticLabel(label), `${entry.file} shows the item "${label}"`).toBe(true);
    }
  });

  // The two scans above only look at strings the Anonymizer *replaced*:
  // `findRealText` asks whether a replacement reads as salad, and the
  // forbidden-term scan asks whether a known private string survived. Neither
  // examines a value the Anonymizer decided to *keep*, which is exactly how 19
  // real hook names once shipped here — `hookName` was allow-listed in
  // `ENUM_KEYS`, and nothing private enough to trip the term scan was in them.
  it.each(manifest.sessions)("$name keeps only names that are safe to keep", (entry) => {
    const text = readFileSync(join(demoDirectory, entry.file), "utf8");
    const hookNames = new Set<string>();
    const toolNames = new Set<string>();

    const collect = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) collect(item);
        return;
      }
      if (value === null || typeof value !== "object") return;
      const record = value as Record<string, unknown>;
      if (typeof record["hookName"] === "string") hookNames.add(record["hookName"]);
      if (
        TOOL_BLOCK_TYPES.has(String(record["type"] ?? "")) &&
        typeof record["name"] === "string"
      ) {
        toolNames.add(record["name"]);
      }
      for (const item of Object.values(record)) collect(item);
    };
    for (const line of text.split("\n")) {
      if (line.trim() === "") continue;
      collect(JSON.parse(line));
    }

    // A hook name is named by the developer, so every one has to be salad.
    for (const name of hookNames) {
      expect.soft(findRealWords(name), `${entry.file} keeps the hook name "${name}"`).toEqual([]);
    }
    // A tool name survives only when it is a built-in; anything else — MCP, a
    // Skill, a sub-agent, a plugin tool — must have been replaced.
    for (const name of toolNames) {
      if (BUILTIN_TOOL_NAMES.has(name)) continue;
      expect.soft(findRealWords(name), `${entry.file} keeps the tool name "${name}"`).toEqual([]);
    }
  });

  it("keeps source paths and names out of the manifest", () => {
    const text = readFileSync(join(demoDirectory, "manifest.json"), "utf8");

    expect(findForbiddenTerms(text, forbidden)).toEqual([]);
    for (const entry of manifest.sessions) {
      expect(entry.file).toMatch(/^(small|medium|large)\.jsonl$/);
    }
  });
});
