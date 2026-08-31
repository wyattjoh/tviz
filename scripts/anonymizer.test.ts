import { describe, expect, it } from "vitest";
import {
  anonymizeRecord,
  anonymizeTranscript,
  DEFAULT_SEED,
  findForbiddenTerms,
  findStructuralDifferences,
} from "./anonymizer.ts";

/**
 * Distinctive tokens planted in the synthetic input. None of them may appear in
 * the output; they stand in for the free text a real Session would hold.
 */
const PLANTED = [
  "zebracorn",
  "quokkaphone",
  "xylophone",
  "gruntfish",
  "wobblesprocket",
  "iVBORw0KGgo",
  "EqQBCkYIBRgC",
];

/**
 * A Record shaped like an `assistant` transcript line: every free-text string
 * is synthetic, every enum-like value is real so the allow-list can be checked.
 */
function assistantRecord(): Record<string, unknown> {
  return {
    parentUuid: "6f1e2b3c-4d5e-4f60-8a91-b2c3d4e5f607",
    isSidechain: false,
    userType: "external",
    cwd: "/Users/zebracorn/Code/quokkaphone",
    sessionId: "0a1b2c3d-4e5f-4061-8273-849506a7b8c9",
    version: "2.1.251",
    gitBranch: "zebracorn/xylophone-refactor",
    type: "assistant",
    message: {
      id: "msg_01GruntfishABC",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-20260101",
      content: [
        { type: "text", text: "zebracorn first line\nquokkaphone second line\n\ntail" },
        {
          type: "tool_use",
          id: "toolu_01Wobblesprocket",
          name: "Read",
          input: { file_path: "/Users/zebracorn/Code/quokkaphone/src/main.tsx" },
        },
        {
          type: "thinking",
          thinking: "xylophone reasoning about gruntfish",
          signature: "EqQBCkYIBRgCKkBwobblesprocket",
        },
        {
          type: "image",
          source: { type: "base64", media_type: "image/png", data: "iVBORw0KGgoAAAANSUhEUg" },
        },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 4,
        cache_creation_input_tokens: 12345,
        cache_read_input_tokens: 67890,
        output_tokens: 321,
        service_tier: "standard",
      },
    },
    requestId: "req_011CTgruntfish",
    timestamp: "2026-08-30T12:34:56.789Z",
    toolUseResult: {
      filenames: ["/Users/zebracorn/Code/quokkaphone/src/App.tsx"],
      numLines: 12,
      durationMs: 4.5,
      truncated: null,
    },
    fileBackups: {
      "/Users/zebracorn/Code/quokkaphone/src/App.tsx": "zebracorn backup body",
      "/Users/zebracorn/Code/quokkaphone/src/index.css": "quokkaphone backup body",
      "gruntfish notes.md": "wobblesprocket backup body",
    },
  };
}

function skillListingRecord(): Record<string, unknown> {
  return {
    type: "attachment",
    uuid: "11112222-3333-4444-8555-666677778888",
    timestamp: "2026-08-30T12:35:00.000Z",
    attachment: {
      type: "skill_listing",
      skillCount: 2,
      isInitial: true,
      names: ["zebracorn-deploy", "quokkaphone-review"],
      content: "zebracorn: deploys things\nquokkaphone: reviews things",
    },
  };
}

type Pair = { path: string; before: unknown; after: unknown };

/**
 * Walk two values in parallel by position, so renamed object keys still pair
 * up with the key they replaced.
 */
function pairs(before: unknown, after: unknown, path = "", out: Pair[] = []): Pair[] {
  out.push({ path, before, after });
  if (Array.isArray(before) && Array.isArray(after)) {
    before.forEach((item, index) => pairs(item, after[index], `${path}[${index}]`, out));
    return out;
  }
  if (
    before !== null &&
    after !== null &&
    typeof before === "object" &&
    typeof after === "object"
  ) {
    const beforeEntries = Object.entries(before as Record<string, unknown>);
    const afterEntries = Object.entries(after as Record<string, unknown>);
    beforeEntries.forEach(([key, value], index) => {
      const entry = afterEntries[index];
      pairs(value, entry?.[1], `${path}.${key}`, out);
    });
  }
  return out;
}

function newlineIndexes(value: string): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === "\n") indexes.push(index);
  }
  return indexes;
}

function at(record: unknown, path: readonly (string | number)[]): unknown {
  let current: unknown = record;
  for (const step of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string | number, unknown>)[step];
  }
  return current;
}

describe("anonymizeRecord", () => {
  it("keeps numbers, booleans and null byte-identical", () => {
    const input = assistantRecord();
    const output = anonymizeRecord(input, DEFAULT_SEED);

    expect(at(output, ["message", "usage"])).toEqual(at(input, ["message", "usage"]));
    expect(at(output, ["isSidechain"])).toBe(false);
    expect(at(output, ["toolUseResult", "numLines"])).toBe(12);
    expect(at(output, ["toolUseResult", "durationMs"])).toBe(4.5);
    expect(at(output, ["toolUseResult", "truncated"])).toBeNull();

    const listing = skillListingRecord();
    for (const pair of [
      ...pairs(input, output),
      ...pairs(listing, anonymizeRecord(listing, DEFAULT_SEED)),
    ]) {
      if (
        typeof pair.before === "number" ||
        typeof pair.before === "boolean" ||
        pair.before === null
      ) {
        expect(pair.after, pair.path).toBe(pair.before);
      }
    }
  });

  it("preserves string lengths and newline positions", () => {
    const input = assistantRecord();
    const output = anonymizeRecord(input, DEFAULT_SEED);

    let stringsSeen = 0;
    for (const pair of pairs(input, output)) {
      if (typeof pair.before !== "string") continue;
      stringsSeen += 1;
      expect(typeof pair.after).toBe("string");
      const after = pair.after as string;
      expect(after.length, `length of ${pair.path}`).toBe(pair.before.length);
      expect(newlineIndexes(after), `newlines of ${pair.path}`).toEqual(
        newlineIndexes(pair.before),
      );
    }
    expect(stringsSeen).toBeGreaterThan(10);
  });

  it("keeps allow-listed enum values and timestamps unchanged", () => {
    const input = assistantRecord();
    const output = anonymizeRecord(input, DEFAULT_SEED);

    for (const path of [
      ["type"],
      ["userType"],
      ["version"],
      ["timestamp"],
      ["message", "type"],
      ["message", "role"],
      ["message", "model"],
      ["message", "stop_reason"],
      ["message", "usage", "service_tier"],
      ["message", "content", 0, "type"],
      ["message", "content", 1, "name"],
      ["message", "content", 3, "source", "media_type"],
    ]) {
      expect(at(output, path), path.join(".")).toBe(at(input, path));
    }
  });

  it("rewrites ids into same-shape ids that still resolve to each other", () => {
    const input = assistantRecord();
    const output = anonymizeRecord(input, DEFAULT_SEED);
    const sibling = anonymizeRecord(
      { type: "user", sessionId: input["sessionId"], parentUuid: input["parentUuid"] },
      DEFAULT_SEED,
    );

    for (const path of [["parentUuid"], ["sessionId"], ["requestId"], ["message", "id"]]) {
      const before = at(input, path) as string;
      const after = at(output, path) as string;
      expect(after, path.join(".")).not.toBe(before);
      expect(after.length).toBe(before.length);
    }
    expect(at(output, ["sessionId"])).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(at(output, ["message", "id"])).toMatch(/^msg_[0-9a-zA-Z]+$/);
    expect(at(output, ["message", "content", 1, "id"])).toMatch(/^toolu_[0-9a-zA-Z]+$/);

    // The same id anonymizes to the same value, so records still link up.
    expect(at(sibling, ["sessionId"])).toBe(at(output, ["sessionId"]));
    expect(at(sibling, ["parentUuid"])).toBe(at(output, ["parentUuid"]));
  });

  it("replaces names that are not tool names", () => {
    const input = skillListingRecord();
    const output = anonymizeRecord(input, DEFAULT_SEED);

    const before = at(input, ["attachment", "names"]) as string[];
    const after = at(output, ["attachment", "names"]) as string[];
    expect(after).toHaveLength(before.length);
    after.forEach((name, index) => {
      expect(name).not.toBe(before[index]);
      expect(name.length).toBe(before[index]?.length);
    });
    expect(at(output, ["attachment", "type"])).toBe("skill_listing");
  });

  it("lets no free-text token survive", () => {
    const serialized = [
      JSON.stringify(anonymizeRecord(assistantRecord(), DEFAULT_SEED)),
      JSON.stringify(anonymizeRecord(skillListingRecord(), DEFAULT_SEED)),
    ].join("\n");

    for (const token of PLANTED) {
      expect(serialized.toLowerCase()).not.toContain(token.toLowerCase());
    }
  });

  it("turns path-like values into fake paths of the same shape", () => {
    const input = assistantRecord();
    const output = anonymizeRecord(input, DEFAULT_SEED);

    for (const path of [["cwd"], ["gitBranch"], ["toolUseResult", "filenames", 0]]) {
      const before = at(input, path) as string;
      const after = at(output, path) as string;
      expect(after, path.join(".")).not.toBe(before);
      expect(after.length).toBe(before.length);
      expect(newlineIndexes(after)).toEqual(newlineIndexes(before));
      expect([...after].flatMap((char, index) => (char === "/" ? [index] : []))).toEqual(
        [...before].flatMap((char, index) => (char === "/" ? [index] : [])),
      );
    }
    expect(at(output, ["toolUseResult", "filenames", 0])).toMatch(/\.tsx$/);
  });

  it("renames object keys that are content rather than schema", () => {
    const input = assistantRecord();
    const output = anonymizeRecord(input, DEFAULT_SEED);

    const before = Object.keys(at(input, ["fileBackups"]) as object);
    const after = Object.keys(at(output, ["fileBackups"]) as object);
    expect(after).toHaveLength(before.length);
    expect(new Set(after).size).toBe(after.length);
    after.forEach((key, index) => {
      const original = before[index] ?? "";
      expect(key).not.toBe(original);
      expect(key.length).toBe(original.length);
      expect(newlineIndexes(key)).toEqual(newlineIndexes(original));
      for (const token of PLANTED) expect(key.toLowerCase()).not.toContain(token.toLowerCase());
    });
    expect(after[0]).toContain("/");
    // Schema keys keep their name.
    expect(Object.keys(output as object)).toContain("fileBackups");
  });

  it("caps letter runs in generated ids and filler", () => {
    const long = "a".repeat(4000);
    const output = anonymizeRecord(
      { type: "assistant", signature: long, requestId: long },
      DEFAULT_SEED,
    ) as Record<string, string>;

    expect(output["signature"]).not.toMatch(/[A-Za-z]{4}/);
    expect(output["requestId"]).not.toMatch(/[A-Za-z]{4}/);
    expect(output["signature"]?.length).toBe(long.length);
  });

  it("is deterministic per seed", () => {
    const first = anonymizeRecord(assistantRecord(), "seed-a");
    const second = anonymizeRecord(assistantRecord(), "seed-a");
    const other = anonymizeRecord(assistantRecord(), "seed-b");

    expect(second).toEqual(first);
    expect(JSON.stringify(other)).not.toBe(JSON.stringify(first));
  });

  it("replaces base64 image data and thinking signatures with filler", () => {
    const input = assistantRecord();
    const output = anonymizeRecord(input, DEFAULT_SEED);

    for (const path of [
      ["message", "content", 2, "signature"],
      ["message", "content", 3, "source", "data"],
    ]) {
      const before = at(input, path) as string;
      const after = at(output, path) as string;
      expect(after).not.toBe(before);
      expect(after.length).toBe(before.length);
      expect(after).toMatch(/^[A-Za-z0-9+/]+$/);
    }
  });
});

describe("anonymizeTranscript", () => {
  const transcript = [
    JSON.stringify(assistantRecord()),
    JSON.stringify(skillListingRecord()),
    "",
    "{ this is not json, zebracorn }",
    JSON.stringify({ type: "system", subtype: "turn_duration", durationMs: 12 }),
  ].join("\n");

  it("keeps the line count and the record type sequence", () => {
    const result = anonymizeTranscript(transcript, DEFAULT_SEED);
    const lines = result.text.split("\n");

    expect(result.lineCount).toBe(5);
    expect(lines).toHaveLength(5);
    expect(result.recordCount).toBe(3);
    expect(result.malformedLines).toBe(1);
    expect(lines[2]).toBe("");

    const types = (text: string) =>
      text.split("\n").flatMap((line) => {
        try {
          return [(JSON.parse(line) as { type: string }).type];
        } catch {
          return [];
        }
      });
    expect(types(result.text)).toEqual(types(transcript));
  });

  it("replaces malformed lines instead of copying them", () => {
    const result = anonymizeTranscript(transcript, DEFAULT_SEED);
    const line = result.text.split("\n")[3] ?? "";

    expect(line).not.toContain("zebracorn");
    expect(line.length).toBe("{ this is not json, zebracorn }".length);
  });

  it("preserves the structure of every record", () => {
    const result = anonymizeTranscript(transcript, DEFAULT_SEED);
    expect(findStructuralDifferences(transcript, result.text)).toEqual([]);
  });

  it("is deterministic per seed", () => {
    expect(anonymizeTranscript(transcript, "seed-a").text).toBe(
      anonymizeTranscript(transcript, "seed-a").text,
    );
    expect(anonymizeTranscript(transcript, "seed-b").text).not.toBe(
      anonymizeTranscript(transcript, "seed-a").text,
    );
  });

  it("leaves no forbidden term in the output", () => {
    const result = anonymizeTranscript(transcript, DEFAULT_SEED);

    expect(findForbiddenTerms(transcript, PLANTED)).not.toEqual([]);
    expect(findForbiddenTerms(result.text, PLANTED)).toEqual([]);
  });
});

describe("findStructuralDifferences", () => {
  it("reports changed numbers, changed lengths and a lost line", () => {
    const before = JSON.stringify({ type: "assistant", text: "abc", usage: { input_tokens: 10 } });
    const changedNumber = JSON.stringify({
      type: "assistant",
      text: "abc",
      usage: { input_tokens: 11 },
    });
    const changedLength = JSON.stringify({
      type: "assistant",
      text: "abcd",
      usage: { input_tokens: 10 },
    });
    const changedText = JSON.stringify({
      type: "assistant",
      text: "xyz",
      usage: { input_tokens: 10 },
    });

    expect(findStructuralDifferences(before, before)).toEqual([]);
    expect(findStructuralDifferences(before, changedText)).toEqual([]);
    expect(findStructuralDifferences(before, changedNumber)).toHaveLength(1);
    expect(findStructuralDifferences(before, changedLength)).toHaveLength(1);
    expect(findStructuralDifferences(`${before}\n${before}`, before)).toHaveLength(1);
  });
});

describe("findForbiddenTerms", () => {
  it("matches case-insensitively and ignores very short terms", () => {
    expect(findForbiddenTerms("path /Users/Zebracorn/x", ["zebracorn"])).toEqual(["zebracorn"]);
    expect(findForbiddenTerms("nothing here", ["zebracorn"])).toEqual([]);
    expect(findForbiddenTerms("aaa", ["a"])).toEqual([]);
  });
});
