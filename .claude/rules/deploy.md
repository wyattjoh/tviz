---
description: Alchemy/Cloudflare deploy stack in the separately installed infra/ package, the CI workflow, and the credential-disclosure rules around deploy state
paths:
  - "infra/**"
  - ".github/workflows/**"
alwaysApply: false
---

# Deployment

## The app stack

`infra/alchemy.run.ts` uses **Alchemy** (`alchemy@2.0.0-beta.75`, see
[`dependencies.md`](./dependencies.md)) → `Cloudflare.Website.Vite("Website")`: an
assets-only Worker on `*.workers.dev`. There is no server; the Worker serves static
assets and nothing else (ADR-0002).

- State lives in `Cloudflare.state()` so the laptop and CI share one state store
  (ADR-0005), bootstrapped once with `bun alchemy cloudflare bootstrap`.
- Stage `prod` pins the Worker name to `tviz` (https://tviz.wyattjoh.workers.dev); other
  stages use derived names.
- Changing the stack name (`tviz`), the stage (`prod`) or the logical ID (`Website`)
  re-keys Alchemy's state and orphans the live Worker. Confirm with `bun run plan` — it
  must say `1 to update`, never `to create`.
- Paths in `infra/alchemy.run.ts` are anchored to `import.meta.dirname`, never
  `process.cwd()`: `rootDir` is the repo root, and `memo.include` globs resolve against
  it. `memo.include` omits `infra/**` on purpose — a stack edit must not force a bundle
  rebuild.
- Do **not** add `@cloudflare/vite-plugin`.
- Use the `alchemy` skill.

## `infra/` is a separate package, not a workspace (ADR-0007)

Alchemy needs `effect >=4.0.0-rc.112`; the parser is pinned to `effect@4.0.0-beta.107`
(the tag the `effect-ts-beta` skill's source clone matches). `infra/` has its own
`package.json`, `bun.lock`, `node_modules` and `tsconfig.json`, so each `effect` import
resolves to the version its importer asked for. A Bun workspace would _not_ do this:
`alchemy` has no competing copy, so it would hoist to the root and pick up the app's beta.

Never add `infra` to a `workspaces` field, never import across the boundary, and always
install in both places (`bun install && bun run infra:install`).
`scripts/infra-isolation.test.ts` enforces all three in `bun run test` — no `workspaces`
key, no `alchemy` in the app's `node_modules`, two different installed `effect` versions,
no cross-boundary imports. The violation is otherwise invisible until CI's Deploy step.

## Commands

From the repo root:

```sh
bun run infra:install   # cd infra && bun install --frozen-lockfile (once per checkout)
bun run infra:typecheck # cd infra && tsc --noEmit
bun run plan            # read-only preview of stage prod (builds via Vite); takes no --yes
bun run deploy          # THE deploy — cd infra && alchemy deploy --stage prod --yes
bun run bootstrap:ci    # one-time/rotate: CI token → GitHub secrets
```

Inside `infra/` the CLI is available directly:

```sh
bun alchemy plan                    # this stage (default dev_$USER)
bun alchemy deploy --yes            # this stage, after explicit confirmation
bun alchemy cloudflare bootstrap    # one-time: the shared state store
```

`alchemy deploy` is a remote write: get explicit confirmation first, then run with `--yes`
(the agent env forces plain mode, which never prompts).

`bootstrap:ci` is deliberately _not_ an `infra/` script. `infra/stacks/github.ts` is the
one stack on `Alchemy.localState()`, which takes no directory and anchors `.alchemy/state`
at the working directory, so it cannot be anchored to `import.meta.dirname` the way the app
stack is. `bun run` sets cwd to its own package's root, so the script lives in the **root**
`package.json` and the stack throws unless cwd is the main checkout's root — running it
from `infra/` or from a worktree would start from empty state and re-mint the CI token
instead of rotating it.

## CI

`.github/workflows/deploy.yml` installs both packages, then runs lint → format:check →
test → infra typecheck → `alchemy deploy --stage prod` on pushes to `main`, plus
`workflow_dispatch`. It reads `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`,
provisioned by `infra/stacks/github.ts` — a one-shot bootstrap stack run from a laptop
with `bun run bootstrap:ci` **from the repository root of the main checkout**
(`--profile admin`, needs a Global API Key). Re-run it to rotate the token or change its
scopes; never paste credentials into the GitHub UI. `.alchemy/` stays gitignored: only the
bootstrap stack uses local state, and its tree is the repo root's.

## Never print the token

Alchemy's state encoder unwraps `Redacted` and writes the **plaintext** value to disk
(`State/StateEncoding.ts`), so the **repository root's**
`.alchemy/state/tviz-ci/*/DeployToken.json` holds a live Cloudflare API token — that path,
not `infra/.alchemy/`, which holds no state at all. It is gitignored, but `cat`,
`alchemy state get`, and `alchemy state export` on the `tviz-ci` stack would paste it into
the session log — and this project's transcripts are a deliverable.

Never run **`alchemy cloudflare create-token`**: it `Console.log`s the raw token to stdout
by design. Mint tokens only through `infra/stacks/github.ts`, which keeps the value
`Redacted` end-to-end.
