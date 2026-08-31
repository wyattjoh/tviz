/**
 * Enforces ADR-0007: `infra/` is a separately installed package, never a Bun
 * workspace of the app, so Alchemy's `effect` (rc) and the parser's `effect`
 * (beta) never resolve to the same copy.
 *
 * Without this file the invariant is unchecked: adding `"workspaces":
 * ["infra"]` to the root `package.json` makes Bun hoist `alchemy` — which has
 * no competing copy — into the root `node_modules`, where its `import "effect"`
 * silently resolves to the app's beta. Lint, format, both typechecks and every
 * other test still pass, and the breakage first surfaces inside CI's Deploy
 * step, the one step holding a Cloudflare write token.
 *
 * The manifest-level checks need nothing installed. The resolution checks read
 * the installed trees; the `infra/` half is skipped when `infra/node_modules`
 * is absent (a fresh checkout before `bun run infra:install`), but the root
 * half — "no `alchemy` in the app's `node_modules`" — always runs, because it
 * is the direct symptom of the hoist this ADR exists to prevent.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const thisFile = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(thisFile), "..");
const infraRoot = path.join(repoRoot, "infra");

const readJson = (file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

const dependencyRanges = (manifest: Record<string, unknown>): Record<string, string> => ({
  ...(manifest.dependencies as Record<string, string> | undefined),
  ...(manifest.devDependencies as Record<string, string> | undefined),
});

const installedVersion = (packageRoot: string, name: string): string | undefined => {
  const manifest = path.join(packageRoot, "node_modules", name, "package.json");
  return existsSync(manifest) ? (readJson(manifest).version as string) : undefined;
};

/**
 * Every `.ts`/`.tsx` file under `dir`, paired with its contents. Installed
 * trees are skipped rather than filtered out afterwards: `infra/node_modules`
 * holds Alchemy's whole dependency graph.
 */
const sourceFiles = (dir: string): ReadonlyArray<readonly [string, string]> =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules") return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [[full, readFileSync(full, "utf8")] as const] : [];
  });

/**
 * Import specifiers of `from "…"` / `import("…")` statements, which is what a
 * cross-package import looks like; a path inside a string or comment is not.
 */
const importSpecifiers = (source: string): ReadonlyArray<string> =>
  [...source.matchAll(/(?:\bfrom|\bimport)\s*\(?\s*["']([^"']+)["']/g)].map((match) => match[1]!);

const appManifest = readJson(path.join(repoRoot, "package.json"));
const infraManifest = readJson(path.join(infraRoot, "package.json"));

describe("infra package isolation (ADR-0007)", () => {
  it("does not make infra a workspace of the app", () => {
    expect(appManifest.workspaces).toBeUndefined();
  });

  it("keeps alchemy out of the app's dependencies and effect out of a shared pin", () => {
    const app = dependencyRanges(appManifest);
    const infra = dependencyRanges(infraManifest);

    expect(app.alchemy).toBeUndefined();
    expect(infra.alchemy).toBeDefined();
    // The two pins disagreeing is the entire reason for the split. If they ever
    // agree, ADR-0007 is obsolete rather than violated — revisit it.
    expect(app.effect).toBeDefined();
    expect(infra.effect).toBeDefined();
    expect(infra.effect).not.toBe(app.effect);
  });

  it("resolves no alchemy from the app's node_modules", () => {
    expect(installedVersion(repoRoot, "alchemy")).toBeUndefined();
  });

  it("installs each effect at the version its own package pinned", () => {
    const appEffect = installedVersion(repoRoot, "effect");
    expect(appEffect).toBe(dependencyRanges(appManifest).effect?.replace(/^[\^~]/, ""));

    if (!existsSync(path.join(infraRoot, "node_modules"))) return;

    const infraEffect = installedVersion(infraRoot, "effect");
    expect(infraEffect).toBe(dependencyRanges(infraManifest).effect?.replace(/^[\^~]/, ""));
    expect(infraEffect).not.toBe(appEffect);
  });

  it("never imports across the app/infra boundary", () => {
    const crossing = (files: ReadonlyArray<readonly [string, string]>, forbidden: RegExp) =>
      files
        .filter(([file]) => file !== thisFile)
        .flatMap(([file, source]) =>
          importSpecifiers(source)
            .filter((specifier) => forbidden.test(specifier))
            .map((specifier) => `${path.relative(repoRoot, file)}: ${specifier}`),
        );

    expect(crossing(sourceFiles(path.join(repoRoot, "src")), /(^|\/)infra\//)).toEqual([]);
    expect(crossing(sourceFiles(path.join(repoRoot, "scripts")), /(^|\/)infra\//)).toEqual([]);
    expect(crossing(sourceFiles(infraRoot), /(^|\/)(src|scripts)\//)).toEqual([]);
  });
});
