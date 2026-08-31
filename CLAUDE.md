# tviz

Browser-only visualizer for Claude Code session transcripts. Drop a `.jsonl` transcript (or a folder of them) and see where the context window went, bucketed like `/context`: System, Skills, Custom agents, Memory files, MCP, Messages — as a grid of fixed-token cells with category filters and a per-API-call scrubber.

Read `CONTEXT.md` for vocabulary and `docs/adr/` before changing the model or the parser. The feature spec is `.scratch/context-viz/spec.md`; the design rationale draft is `docs/rationale.md`.

## Constraints (drive every scope decision)

- Deployed prototype must be usable in a browser with **no local install** and **no reviewer-supplied data** → demo mode with bundled synthetic sessions is mandatory, not optional.
- Deliverables: deployed URL, GitHub repo, `docs/rationale.md` + ~5 min video (user records), and the Claude Code transcripts of this project. Keep the rationale draft current as decisions land.
- Prefer one polished interaction over breadth. Extensions go in the rationale's "with more time" section, not into the MVP.

## Hard rules

- **Transcript data never leaves the browser.** No upload, no server-side parsing, no persistence (no IndexedDB/localStorage of session content). The Worker is assets-only.
- **No real transcript content in the repo, fixtures, tests, or demo data.** Real transcripts contain PII. Fixtures and `public/demo/*.jsonl` come only from `scripts/anonymize.ts` (structure-preserving, all free text replaced) or hand-written synthetic generators. Review anonymizer output before committing it.
  - The Anonymizer keeps line count, Record `type` sequence, key order, line endings, every number/boolean/null (so Measured Tokens stay exact), string lengths and newline positions. Values under enum-like keys (`type`, `role`, `model`, `version`, tool `name` on tool_use blocks, …) are kept only when the value is _also_ enum-shaped (one short token, no whitespace) — a key name is not a promise that its value is an enum. Timestamps and uuids are kept (a uuid carries no free text, and keeping it means a Demo Session's `sessionId` still matches its file name); non-uuid ids (`msg_`/`toolu_`/`req_`) are rewritten to same-shape fakes, deterministic per value, so `message.id` grouping and `tool_use_id` pairing still resolve. Object **keys** are kept only when they are known schema keys (surveyed over the 101 real sessions); any other key is renamed, because a key can be content (a file-backup map is keyed by file name). Everything else becomes seeded Latin word salad, fake paths, or base64-ish filler. The CLI refuses to write if the structure drifted or if the username, its parts, the home directory or a known repo name survived.
- **Never read real transcript files directly** (they're 0.5–13 MB). Write a Bun script under `.scratch/analysis/` that prints key paths, types, and counts — never string content. Existing survey scripts: `schema.ts`, `attachments.ts`, `derive.ts`, `turns.ts`.
- The user's transcripts live at `~/.claude/projects/-Users-wyatt-johnson-Code-github-com-wyattjoh-agent-toolkit/` (101 sessions, CC 2.1.140–2.1.251). Use them only through analysis scripts.
- **Never print deploy state or the CI token into a transcript.** Alchemy's state encoder unwraps `Redacted` and writes the **plaintext** value to disk (`State/StateEncoding.ts`), so **`.alchemy/state/tviz-ci/*/DeployToken.json` at the repository root** holds a live Cloudflare API token — that path, not `infra/.alchemy/`, which holds no state at all. `Alchemy.localState()` anchors the tree at the working directory and `bun run bootstrap:ci` runs from the repo root, so the root `.alchemy/` is live, not stale leftovers. It is gitignored, but `cat`, `alchemy state get`, and `alchemy state export` on the `tviz-ci` stack would paste it into the session log — and this project's transcripts are a deliverable. Never run **`alchemy cloudflare create-token`**: it `Console.log`s the raw token to stdout by design. Mint tokens only through `infra/stacks/github.ts`, which keeps the value `Redacted` end-to-end.

## Stack

- Bun + TypeScript, Vite 8, React 19, Tailwind, Catppuccin Mocha (`catppuccin-interfaces` skill for tokens/contrast).
- **Effect v4 beta** (`effect@4.0.0-beta.107`, npm `beta` dist-tag) for the parser only: `Schema` for lenient JSONL record decoding and `Effect.gen`/`Effect.fn` for the parse→aggregate pipeline. No Layers/Services. The parser returns plain data (POD) to React. Use the `effect-ts-beta` skill; it requires the pinned source clone at `~/.claude/skills/effect-ts-beta/.source/` (see the skill's Prerequisites Check).
- Parsing runs in a **Web Worker** so multi-MB files don't block the UI.
- Deployment: **Alchemy** (`alchemy@2.0.0-beta.75`) in `infra/alchemy.run.ts` → `Cloudflare.Website.Vite("Website")`, assets-only Worker on `*.workers.dev`, state in `Cloudflare.state()` so the laptop and CI share one state store (ADR-0005). Stage `prod` pins the Worker name to `tviz` (https://tviz.wyattjoh.workers.dev); other stages use derived names. Use the `alchemy` skill. Do **not** add `@cloudflare/vite-plugin`. `alchemy deploy` is a remote write: get explicit confirmation first, then run with `--yes` (agent env forces plain mode, which never prompts). `alchemy plan` is read-only and takes no `--yes`.
  - **`infra/` is a separate package, not a workspace (ADR-0007).** Alchemy needs `effect >=4.0.0-rc.112`; the parser is pinned to `effect@4.0.0-beta.107` (the tag the `effect-ts-beta` skill's source clone matches). `infra/` has its own `package.json`, `bun.lock`, `node_modules` and `tsconfig.json`, so each `effect` import resolves to the version its importer asked for. A Bun workspace would _not_ do this: `alchemy` has no competing copy, so it would hoist to the root and pick up the app's beta. Never add `infra` to a `workspaces` field, never import across the boundary, and always `bun install` in both places (`bun run infra:install`). `scripts/infra-isolation.test.ts` enforces all three in `bun run test` (no `workspaces` key, no `alchemy` in the app's `node_modules`, two different installed `effect` versions, no cross-boundary imports) — the violation is otherwise invisible until CI's Deploy step.
  - Paths in `infra/alchemy.run.ts` are anchored to `import.meta.dirname`, never `process.cwd()`: `rootDir` is the repo root, and `memo.include` globs resolve against it. `memo.include` omits `infra/**` on purpose — a stack edit must not force a bundle rebuild.
  - `infra/stacks/github.ts` is the exception the move breaks: `Alchemy.localState()` takes no directory and anchors `.alchemy/state` at the working directory, so it cannot be anchored the same way. Its `bootstrap:ci` script therefore lives in the **root** `package.json` (`bun run` sets cwd to its own package's root) and the stack throws unless cwd is the main checkout's root — running it from `infra/` or from a worktree would start from empty state and re-mint the CI token instead of rotating it.
  - Changing the stack name (`tviz`), the stage (`prod`) or the logical ID (`Website`) re-keys Alchemy's state and orphans the live Worker. Confirm with `bun run plan` — it must say `1 to update`, never `to create`.
- Tests: **Vitest** (`*.test.ts` / `*.test.tsx` beside source), synthetic fixtures under `src/fixtures/`.
  Parser and pure-logic tests run in the default Node environment; component tests opt into jsdom
  with a `// @vitest-environment jsdom` docblock and use `@testing-library/react`. Shared DOM
  stand-ins (`FileList`, transcript `File`) live in `src/ui/test-dom.ts`.
- CI: `.github/workflows/deploy.yml` installs both packages, then runs lint → format:check → test → infra typecheck → `alchemy deploy --stage prod` on pushes to `main` (plus `workflow_dispatch`). It reads `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, which are provisioned by `infra/stacks/github.ts` — a one-shot bootstrap stack run from a laptop with `bun run bootstrap:ci` **from the repository root of the main checkout** (`--profile admin`, needs a Global API Key). Re-run it to rotate the token or change its scopes; never paste credentials into the GitHub UI. `.alchemy/` stays gitignored: only the bootstrap stack uses local state, and its tree is the repo root's.
- Lint/format: oxlint + oxfmt via lefthook pre-commit. Run `bun run lint` and `bun run format` after edits.

## Commands

```sh
bun run dev            # vite dev server
bun run typecheck      # tsc -b (src/ + scripts/; not infra/)
bun run build          # typecheck && vite build
bun run test           # vitest run (src/**/*.test.{ts,tsx} and scripts/**/*.test.ts)
bun run lint           # oxlint --deny-warnings
bun run format         # oxfmt
bun run format:check   # oxfmt --check
bun run anonymize <in.jsonl> <out.jsonl> [--seed s] [--force] [--forbid term]
```

Deploy lives in `infra/`, a separately installed package (ADR-0007). From the
repo root:

```sh
bun run infra:install   # cd infra && bun install --frozen-lockfile (once per checkout)
bun run infra:typecheck # cd infra && tsc --noEmit
bun run plan            # read-only preview of stage prod (builds via Vite)
bun run deploy          # THE deploy — stage prod, after explicit confirmation only
bun run bootstrap:ci    # one-time/rotate: CI token → GitHub secrets (local state, must run from here)
```

`bun run deploy` is exactly `cd infra && alchemy deploy --stage prod --yes`.
Inside `infra/` the CLI is available directly:

```sh
bun alchemy plan                    # this stage (default dev_$USER)
bun alchemy deploy --yes            # this stage, after explicit confirmation
bun alchemy cloudflare bootstrap    # one-time: the shared state store
```

`bootstrap:ci` is deliberately _not_ an `infra/` script: it is the one stack on
`Alchemy.localState()`, whose state tree follows the working directory.

## Layout

```
src/domain/      POD vocabulary shared by parser, worker and UI: Category, MessageKind, ContextSnapshot, Session
src/parser/      Effect Schema record types, JSONL decode, per-call aggregation → POD snapshots
src/worker/      Web Worker entry wrapping the parser, plus its main-thread client
src/ui/          React components: DropZone, SessionList, ContextGrid, Legend/Filters, Scrubber; grid layout, formatting, theme token maps
src/fixtures/    synthetic JSONL fixture builders for tests
src/index.css    Catppuccin Mocha palette adapter + semantic tokens (the only place colours are named)
scripts/         anonymizer.ts (Anonymizer library + tests), anonymize.ts (CLI), any generators,
                 infra-isolation.test.ts — the ADR-0007 guard (runs in `bun run test`)
infra/           separately installed Alchemy package (own package.json/bun.lock/node_modules):
                 alchemy.run.ts — the app stack; stacks/github.ts — CI-token bootstrap stack
public/demo/     bundled anonymized demo sessions (small/medium/large)
docs/adr/        decisions; docs/rationale.md; write-up
```

Components never name a Catppuccin colour or a hex literal: they use the semantic
Tailwind utilities (`bg-ui-canvas`, `text-ui-text-muted`, `bg-cat-skills`,
`bg-kind-tool-result`, `bg-cell-free`, …) declared in `src/index.css`, mapped from
domain values in `src/ui/theme.ts`. The `ctp-*` palette layer is for the semantic
layer only.

The main view follows the "Console" variant of the throwaway UI prototype
(branch `wyattjoh/ui-prototype`): one centred monospace column on `ui-shell`, the
grid as the page, the legend as an aligned text table.

## Transcript format — what the parser relies on

Verified against 57k records. The `/context` breakdown is **not** stored; it is derived (see ADR-0001, ADR-0003).

| Record                                                                                                                                                                                            | Category / use                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `assistant` → `message.usage.{input_tokens,cache_read_input_tokens,cache_creation_input_tokens}`                                                                                                  | **Exact total context** for that API call. Several `assistant` records share one `message.id`/`requestId` (one call, many content blocks) — dedupe per call. |
| `attachment.type = skill_listing` (`content`, `names`, `skillCount`, `isInitial`)                                                                                                                 | Skills                                                                                                                                                       |
| `attachment.type = agent_listing_delta` (`addedLines`, `addedTypes`, `removedTypes`)                                                                                                              | Custom agents                                                                                                                                                |
| `attachment.type = nested_memory` (`path`, `content.rawContent`, `content.globs`)                                                                                                                 | Memory files (lazy-loaded rules/MEMORY.md/nested CLAUDE.md only)                                                                                             |
| `attachment.type = mcp_instructions_delta` (`addedBlocks`), `deferred_tools_delta` (`addedLines`)                                                                                                 | MCP / deferred tool names                                                                                                                                    |
| `user`/`assistant` content blocks (`text`, `tool_use`, `tool_result`, `image`; `thinking` is not re-sent) and remaining attachments (`hook_success`, `total_tokens_reminder`, `task_reminder`, …) | Messages, with sub-kinds User / Assistant / Tool result / Reminder                                                                                           |
| system prompt, built-in tool schemas, root CLAUDE.md                                                                                                                                              | **Not logged.** Combined "System" bucket = first-call total − estimated logged parts; stable per CC version (±1k).                                           |
| `type` ∈ `system` (`subtype`: `turn_duration`, `stop_hook_summary`, `local_command`, …), `last-prompt`, `ai-title`, `mode`, `file-history-*`, `queue-operation`, …                                | Metadata, not in context. Unknown record types must be skipped and counted, never fatal.                                                                     |
| `<session>/subagents/agent-*.jsonl` + `.meta.json` (`agentType`, `spawnDepth`)                                                                                                                    | Separate context windows. MVP: count only.                                                                                                                   |
| `<session>/tool-results/*.txt`                                                                                                                                                                    | Offloaded outputs, not in context. Ignore.                                                                                                                   |

Context window size is not recorded: default from a model→window table (Claude 5 family = 1M, older = 200k), bump to 1M when any observed total exceeds 200k, and allow a UI override.

## Agent skills

### Issue tracker

Issues and specs live as markdown files under `.scratch/<feature-slug>/` in this repo. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root, ADRs under `docs/adr/`. See `docs/agents/domain.md`.
