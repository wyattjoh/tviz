---
description: Alchemy/Cloudflare deploy stack, CI workflow, and the credential-disclosure rules around deploy state
paths:
  - "alchemy.run.ts"
  - "stacks/**"
  - ".github/workflows/**"
alwaysApply: false
---

# Deployment

## The app stack

`alchemy.run.ts` uses **Alchemy** (pinned to `alchemy@2.0.0-beta.72`, see
[`dependencies.md`](./dependencies.md)) → `Cloudflare.Website.Vite("Website")`: an
assets-only Worker on `*.workers.dev`. There is no server; the Worker serves static
assets and nothing else (ADR-0002).

- State lives in `Cloudflare.state()` so the laptop and CI share one state store
  (ADR-0005), bootstrapped once with `bun alchemy cloudflare bootstrap`.
- Stage `prod` pins the Worker name to `tviz`; other stages use derived names.
- Do **not** add `@cloudflare/vite-plugin`.
- Use the `alchemy` skill.

```sh
bun alchemy plan                            # read-only preview (builds via Vite); takes no --yes
bun alchemy deploy --yes                    # after explicit confirmation only
bun alchemy deploy --yes --stage prod       # public URL: Worker named `tviz`
bun alchemy cloudflare bootstrap            # one-time: the shared state store
bun run bootstrap:ci                        # one-time/rotate: CI token → GitHub secrets
```

`alchemy deploy` is a remote write: get explicit confirmation first, then run with `--yes`
(the agent env forces plain mode, which never prompts).

## CI

`.github/workflows/deploy.yml` runs lint → format:check → test → `alchemy deploy --stage
prod` on pushes to `main`, plus `workflow_dispatch`. It reads `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID`, provisioned by `stacks/github.ts` — a one-shot bootstrap stack
run from a laptop with `bun run bootstrap:ci` (`--profile admin`, needs a Global API Key).
Re-run it to rotate the token or change its scopes; never paste credentials into the
GitHub UI. `.alchemy/` stays gitignored: only the bootstrap stack uses local state.

## Never print the token

Alchemy's state encoder unwraps `Redacted` and writes the **plaintext** value to disk
(`State/StateEncoding.ts`), so `.alchemy/state/tviz-ci/*/DeployToken.json` holds a live
Cloudflare API token. It is gitignored, but `cat`, `alchemy state get`, and
`alchemy state export` on the `tviz-ci` stack would paste it into the session log — and
this project's transcripts are a deliverable.

Never run **`alchemy cloudflare create-token`**: it `Console.log`s the raw token to stdout
by design. Mint tokens only through `stacks/github.ts`, which keeps the value `Redacted`
end-to-end.
