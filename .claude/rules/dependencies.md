---
description: Why the app and the infra package pin different prerelease Effect versions, and what has to move together when bumping either
paths:
  - "package.json"
  - "bun.lock"
  - "infra/package.json"
  - "infra/bun.lock"
alwaysApply: false
---

# Version pins

Two prerelease lines of Effect are in this repository on purpose, one per package
(ADR-0007, see [`deploy.md`](./deploy.md)):

- **The app** (`package.json`) pins `effect@4.0.0-beta.107` (npm `beta` dist-tag). The
  `effect-ts-beta` skill's source clone at `~/.claude/skills/effect-ts-beta/.source/`
  matches that tag, and the parser's `Schema` code was written against it.
- **`infra/`** (`infra/package.json`) pins `alchemy@2.0.0-beta.75` with
  `effect@4.0.0-rc.112` and `@effect/platform-{bun,node}` at the same rc.112, because
  alchemy ≥ beta.73 requires `effect >=4.0.0-rc.112`.

They stay apart because `infra/` is separately installed — its own `bun.lock` and
`node_modules` — so each `effect` import resolves to the version its importer asked for.
Do not merge them into a workspace; `scripts/infra-isolation.test.ts` fails if you do.

**Bumping the app's Effect means bumping the skill's source clone with it.** Don't bump
one alone. Bumping alchemy is `infra/`-local and does not touch the app's pin.

Always install in both places after a pin change: `bun install && bun run infra:install`.
