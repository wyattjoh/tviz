#!/usr/bin/env bun
/**
 * CLI wrapper around the Anonymizer.
 *
 *   bun run anonymize <input.jsonl> <output.jsonl> [options]
 *
 * Both paths are required positionals: the script has no default output
 * location and derives none from the input, so it can only ever write to a path
 * the caller typed. Before writing it self-checks the result — structure
 * against the input, and a forbidden-term scan for the developer's username,
 * home directory and repository name — and refuses to write when either fails.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  anonymizeTranscript,
  DEFAULT_SEED,
  findForbiddenTerms,
  findStructuralDifferences,
} from "./anonymizer.ts";

type Options = {
  input: string | undefined;
  output: string | undefined;
  seed: string;
  force: boolean;
  forbid: string[];
};

const USAGE = `Usage: bun run anonymize <input.jsonl> <output.jsonl> [options]

Options:
  --seed <seed>    Seed for the replacement text (default: ${DEFAULT_SEED})
  --force          Overwrite the output file if it already exists
  --forbid <term>  Extra term that must not appear in the output (repeatable)
  --help           Show this message`;

function parseOptions(argv: readonly string[]): Options {
  const options: Options = {
    input: undefined,
    output: undefined,
    seed: DEFAULT_SEED,
    force: false,
    forbid: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] ?? "";
    if (arg === "--seed") {
      index += 1;
      options.seed = argv[index] ?? DEFAULT_SEED;
      continue;
    }
    if (arg === "--forbid") {
      index += 1;
      const term = argv[index];
      if (term !== undefined) options.forbid.push(term);
      continue;
    }
    if (arg === "--force") {
      options.force = true;
      continue;
    }
    if (arg.startsWith("-")) throw new Error(`unknown option ${arg}`);
    if (options.input === undefined) options.input = arg;
    else if (options.output === undefined) options.output = arg;
    else throw new Error(`unexpected argument ${arg}`);
  }
  return options;
}

/**
 * Terms that must never appear in a Demo Session or fixture: the developer's
 * account name, their home directory, and this repository's name.
 */
function forbiddenTerms(extra: readonly string[]): string[] {
  const home = homedir();
  const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  return [userInfo().username, home, basename(home), basename(repoRoot), ...extra];
}

function fail(message: string): never {
  console.error(`anonymize: ${message}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(USAGE);
    return;
  }

  let options: Options;
  try {
    options = parseOptions(argv);
  } catch (error) {
    fail(`${error instanceof Error ? error.message : String(error)}\n\n${USAGE}`);
  }

  if (options.input === undefined || options.output === undefined) {
    fail(`an input and an output path are required\n\n${USAGE}`);
  }

  const input = resolve(options.input);
  const output = resolve(options.output);
  if (input === output) fail("the output path must differ from the input path");
  if (!existsSync(input)) fail(`no such file: ${input}`);
  if (existsSync(output) && !options.force) {
    fail(`refusing to overwrite ${output} (pass --force)`);
  }

  const source = await readFile(input, "utf8");
  const result = anonymizeTranscript(source, options.seed);

  const differences = findStructuralDifferences(source, result.text);
  if (differences.length > 0) {
    fail(`structure changed, nothing written:\n  ${differences.join("\n  ")}`);
  }

  const leaked = findForbiddenTerms(result.text, forbiddenTerms(options.forbid));
  if (leaked.length > 0) {
    fail(`forbidden terms survived, nothing written: ${leaked.join(", ")}`);
  }

  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.text, "utf8");

  const types = [...result.recordTypes]
    .sort((left, right) => right[1] - left[1])
    .map(([type, count]) => `${type}=${count}`)
    .join(" ");
  console.log(`anonymize: wrote ${output}`);
  console.log(
    `  seed=${options.seed} lines=${result.lineCount} records=${result.recordCount} malformed=${result.malformedLines}`,
  );
  console.log(`  record types: ${types}`);
  console.log("  structure verified against the input; review before committing.");
}

await main();
