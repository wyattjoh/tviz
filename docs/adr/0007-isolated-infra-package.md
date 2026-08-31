---
status: accepted
---

# The Alchemy stacks live in `infra/`, a package installed separately from the app

Alchemy 2 and the app disagree about Effect. Alchemy from `2.0.0-beta.73` on declares `effect: ">=4.0.0-rc.112"`, while the parser is written against `effect@4.0.0-beta.107` — the tag the `effect-ts-beta` skill's source clone is pinned to, and the only version whose `Schema` API this repo's code has been checked against. With one `package.json` the two constraints resolve to one installed `effect`, so the repo was pinned to `alchemy@2.0.0-beta.72`, the last release whose peer range still accepted the beta. That pin is a standing tax: every Alchemy fix lands behind it, and the escape route ("bump Effect and the skill clone together") means a deploy-tooling upgrade becomes a parser migration.

`infra/` is a package with its own `package.json`, its own `bun.lock`, and its own `node_modules`, deliberately **not** a Bun workspace of the app. A workspace would share one dependency tree: Bun hoists what it can, and `alchemy` — which has no competing copy — would land in the root `node_modules` where its `import "effect"` resolves to the app's `effect`, silently loading beta.107 into a package that requires rc.112. Two installs is the only arrangement where each `effect` import provably resolves to the version its importer asked for, and it is checkable in one line: `node -p "require('./node_modules/effect/package.json').version"` against the same path under `infra/`. The cost is a second `bun install` — in the CI workflow, in `bun run infra:install`, and in the contributor's head.

The split pays for itself immediately: the app's install drops from 433 packages to 138 (Alchemy's cloud SDKs, Drizzle, Prisma, and the SQL drivers are deploy-time tooling that the browser build never touches), and `infra/` moves to `alchemy@2.0.0-beta.75` with `effect@4.0.0-rc.112` without a single change to `src/`.

## Consequences

- Paths in `infra/alchemy.run.ts` are anchored to `import.meta.dirname`, not `process.cwd()`. `Cloudflare.Website.Vite`'s `rootDir` is the repository root one level up, so Alchemy runs the app's own `vite.config.ts` with `vite` resolved from the app's `package.json`; `memo`'s globs and `memo.lockfile` resolve against that root too. `memo.include` deliberately omits `infra/**`: a stack edit does not change the bundle and must not force a rebuild.
- The Worker's identity is unchanged by the move. Alchemy keys state by stack name, stage, and logical ID (`tviz` / `prod` / `Website`), none of which the refactor touches, and the memo hash is path-insensitive. `bun run plan:prod` against the live state store reports `1 to update`, not a create — the deployed `tviz` Worker is adopted, not orphaned.
- The root `tsc -b` no longer covers the stacks; `infra/tsconfig.json` is its own project, run as `bun run infra:typecheck`. CI runs both.
- The two `effect` versions must not meet. Nothing in `src/` may import from `infra/`, and nothing in `infra/` may import from `src/` — the only contract between them is `rootDir` pointing at a directory Vite knows how to build.
- Deploying is now a two-step for a fresh checkout (`bun run infra:install`, then the deploy), which is why the root `package.json` keeps `plan` and `deploy` aliases that `cd infra` for you.
