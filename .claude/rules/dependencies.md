---
description: Why alchemy and effect are pinned to specific prerelease versions, and what has to move together when bumping them
paths:
  - "package.json"
  - "bun.lock"
alwaysApply: false
---

# Version pins

Two prerelease pins are load-bearing and coupled:

- `effect@4.0.0-beta.107` (npm `beta` dist-tag). The `effect-ts-beta` skill's source clone
  at `~/.claude/skills/effect-ts-beta/.source/` matches that tag.
  `@effect/platform-{bun,node}` are pinned to the same beta.107.
- `alchemy@2.0.0-beta.72`.

**Why beta.72, not latest:** alchemy ≥ beta.73 requires `effect >=4.0.0-rc.112`. beta.72
is the newest alchemy whose `effect` peer accepts beta.107.

**Bumping alchemy means bumping Effect — and the skill's source clone — together.** Don't
bump one alone.

**Expected noise:** `bun install` warns that `@effect/sql-d1`, `@effect/sql-sqlite-do` and
`@effect/vitest` resolve to rc.112. Those are alchemy's D1/Durable-Object state deps,
unused here. The warning is not a break.
