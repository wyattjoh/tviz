import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const cli = join(repoRoot, "scripts", "anonymize.ts");

const TRANSCRIPT = [
  JSON.stringify({
    parentUuid: null,
    type: "user",
    cwd: "/Users/zebracorn/Code/quokkaphone",
    sessionId: "0a1b2c3d-4e5f-4061-8273-849506a7b8c9",
    version: "2.1.251",
    message: { role: "user", content: "zebracorn asks about quokkaphone" },
    timestamp: "2026-08-30T12:34:56.789Z",
  }),
  JSON.stringify({
    type: "assistant",
    sessionId: "0a1b2c3d-4e5f-4061-8273-849506a7b8c9",
    message: {
      id: "msg_01Zebracorn",
      role: "assistant",
      model: "claude-opus-5-20260101",
      content: [{ type: "text", text: "quokkaphone replies" }],
      usage: {
        input_tokens: 7,
        cache_creation_input_tokens: 1024,
        cache_read_input_tokens: 65536,
        output_tokens: 42,
      },
    },
    timestamp: "2026-08-30T12:35:00.000Z",
  }),
  "",
].join("\n");

let workspace: string;
let input: string;
let output: string;

function run(args: readonly string[]) {
  return spawnSync("bun", [cli, ...args], { cwd: repoRoot, encoding: "utf8" });
}

function usageNumbers(text: string): number[] {
  return text.split("\n").flatMap((line) => {
    if (line.trim() === "") return [];
    const record = JSON.parse(line) as { message?: { usage?: Record<string, number> } };
    return Object.values(record.message?.usage ?? {});
  });
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "tviz-anonymize-"));
  input = join(workspace, "session.jsonl");
  output = join(workspace, "demo.jsonl");
  writeFileSync(input, TRANSCRIPT, "utf8");
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("bun run anonymize", () => {
  it("writes a transcript with the same lines, types and usage numbers", { timeout: 30000 }, () => {
    const result = run([input, output]);
    expect(result.stderr).not.toContain("anonymize:");
    expect(result.status).toBe(0);

    const written = readFileSync(output, "utf8");
    expect(written.split("\n")).toHaveLength(TRANSCRIPT.split("\n").length);
    expect(usageNumbers(written)).toEqual(usageNumbers(TRANSCRIPT));
    expect(written.toLowerCase()).not.toContain("zebracorn");
    expect(written.toLowerCase()).not.toContain("quokkaphone");

    const types = (text: string) =>
      text
        .split("\n")
        .filter((line) => line.trim() !== "")
        .map((line) => (JSON.parse(line) as { type: string }).type);
    expect(types(written)).toEqual(types(TRANSCRIPT));

    // Only the file named on the command line is created.
    expect(readdirSync(workspace).sort()).toEqual(["demo.jsonl", "session.jsonl"]);
  });

  it("is deterministic per seed", { timeout: 30000 }, () => {
    run([input, output, "--seed", "demo-1"]);
    const first = readFileSync(output, "utf8");
    run([input, output, "--seed", "demo-1", "--force"]);
    expect(readFileSync(output, "utf8")).toBe(first);
    run([input, output, "--seed", "demo-2", "--force"]);
    expect(readFileSync(output, "utf8")).not.toBe(first);
  });

  it("writes nothing when an output path is missing", { timeout: 30000 }, () => {
    const result = run([input]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("output path");
    expect(readdirSync(workspace)).toEqual(["session.jsonl"]);
  });

  it("refuses to overwrite an existing file without --force", { timeout: 30000 }, () => {
    writeFileSync(output, "keep me", "utf8");
    const result = run([input, output]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("refusing to overwrite");
    expect(readFileSync(output, "utf8")).toBe("keep me");
  });

  it("writes nothing when a forbidden term would survive", { timeout: 30000 }, () => {
    const result = run([input, output, "--forbid", "assistant"]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("forbidden terms survived");
    expect(readdirSync(workspace)).toEqual(["session.jsonl"]);
  });

  it("writes nothing when a default forbidden term survives", { timeout: 30000 }, () => {
    // An enum-shaped value under an allow-listed key is kept verbatim, so this
    // reaches the scan without `--forbid`: the private repository name is on
    // the default list.
    const line = JSON.stringify({ type: "system", subtype: "agent-toolkit" });
    writeFileSync(input, `${line}\n`, "utf8");

    const result = run([input, output]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("forbidden terms survived");
    expect(result.stderr).toContain("agent-toolkit");
    expect(readdirSync(workspace)).toEqual(["session.jsonl"]);
  });

  it("writes nothing when the structure would drift", { timeout: 30000 }, () => {
    // 1e999 parses as Infinity and serializes back as null, so the output no
    // longer matches the input: exactly the drift the self-check exists for.
    writeFileSync(input, `${TRANSCRIPT}{"type":"user","overflow":1e999}\n`, "utf8");

    const result = run([input, output]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("structure changed");
    expect(readdirSync(workspace)).toEqual(["session.jsonl"]);
  });
});
