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
- **Never read real transcript files directly** (they're 0.5–13 MB). Write a Bun script under `.scratch/analysis/` that prints key paths, types, and counts — never string content. Existing survey scripts: `schema.ts`, `attachments.ts`, `derive.ts`, `turns.ts`.
- The user's transcripts live at `~/.claude/projects/-Users-wyatt-johnson-Code-github-com-wyattjoh-agent-toolkit/` (101 sessions, CC 2.1.140–2.1.251). Use them only through analysis scripts.
- **Never print deploy state or the CI token into a transcript.** Alchemy's state encoder unwraps `Redacted` and writes the **plaintext** value to disk (`State/StateEncoding.ts`), so `.alchemy/state/tviz-ci/*/DeployToken.json` holds a live Cloudflare API token. It is gitignored, but `cat`, `alchemy state get`, and `alchemy state export` on the `tviz-ci` stack would paste it into the session log — and this project's transcripts are a deliverable. Never run **`alchemy cloudflare create-token`**: it `Console.log`s the raw token to stdout by design. Mint tokens only through `stacks/github.ts`, which keeps the value `Redacted` end-to-end.

## Stack

- Bun + TypeScript, Vite 8, React 19, Tailwind, Catppuccin Mocha (`catppuccin-interfaces` skill for tokens/contrast).
- **Effect v4 beta** (`effect@4.0.0-beta.107`, npm `beta` dist-tag) for the parser only: `Schema` for lenient JSONL record decoding and `Effect.gen`/`Effect.fn` for the parse→aggregate pipeline. No Layers/Services. The parser returns plain data (POD) to React. Use the `effect-ts-beta` skill; it requires the pinned source clone at `~/.claude/skills/effect-ts-beta/.source/` (see the skill's Prerequisites Check).
- Parsing runs in a **Web Worker** so multi-MB files don't block the UI.
- Deployment: **Alchemy** pinned to `alchemy@2.0.0-beta.72` in `alchemy.run.ts` → `Cloudflare.Website.Vite("Website")`, assets-only Worker on `*.workers.dev`, state in `Cloudflare.state()` so the laptop and CI share one state store (ADR-0005). Stage `prod` pins the Worker name to `tviz`; other stages use derived names. Use the `alchemy` skill. Do **not** add `@cloudflare/vite-plugin`. `alchemy deploy` is a remote write: get explicit confirmation first, then run with `--yes` (agent env forces plain mode, which never prompts). `alchemy plan` is read-only and takes no `--yes`.
  - **Why beta.72, not latest:** alchemy ≥ beta.73 requires `effect >=4.0.0-rc.112`; this project pins `effect@4.0.0-beta.107` (the `effect-ts-beta` skill's source clone matches that tag). beta.72 is the newest alchemy whose `effect` peer accepts beta.107. `@effect/platform-{bun,node}` are pinned to the same beta.107. `bun install` warns about `@effect/sql-d1`/`sql-sqlite-do`/`@effect/vitest` resolving to rc.112 — those are alchemy's D1/DO-state deps, unused here. Bumping alchemy means bumping Effect (and the skill clone) together.
- Tests: **Vitest** (`*.test.ts` / `*.test.tsx` beside source), synthetic fixtures under `src/fixtures/`.
  Parser and pure-logic tests run in the default Node environment; component tests opt into jsdom
  with a `// @vitest-environment jsdom` docblock and use `@testing-library/react`. Shared DOM
  stand-ins (`FileList`, transcript `File`) live in `src/ui/test-dom.ts`.
- CI: `.github/workflows/deploy.yml` runs lint → format:check → test → `alchemy deploy --stage prod` on pushes to `main` (plus `workflow_dispatch`). It reads `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`, which are provisioned by `stacks/github.ts` — a one-shot bootstrap stack run from a laptop with `bun run bootstrap:ci` (`--profile admin`, needs a Global API Key). Re-run it to rotate the token or change its scopes; never paste credentials into the GitHub UI. `.alchemy/` stays gitignored: only the bootstrap stack uses local state.
- Lint/format: oxlint + oxfmt via lefthook pre-commit. Run `bun run lint` and `bun run format` after edits.

## Commands

```sh
bun run dev            # vite dev server
bun run build          # tsc -b && vite build
bun run test           # vitest run
bun run lint           # oxlint --deny-warnings
bun run format         # oxfmt
bun run format:check   # oxfmt --check
bun run anonymize <in.jsonl> <out.jsonl>   # scripts/anonymize.ts (to add)
bun alchemy plan                            # read-only preview (builds via Vite)
bun alchemy deploy --yes                    # after explicit confirmation only
bun alchemy deploy --yes --stage prod       # public URL: Worker named `tviz`
bun alchemy cloudflare bootstrap            # one-time: the shared state store
bun run bootstrap:ci                        # one-time/rotate: CI token → GitHub secrets
```

## Layout

```
src/domain/      POD vocabulary shared by parser, worker and UI: Category, MessageKind, ContextSnapshot, Session
src/parser/      Effect Schema record types, JSONL decode, per-call aggregation → POD snapshots
src/worker/      Web Worker entry wrapping the parser, plus its main-thread client
src/ui/          React components: DropZone, SessionList, ContextGrid, Legend/Filters, Scrubber; grid layout, formatting, theme token maps
src/fixtures/    synthetic JSONL fixture builders for tests
src/index.css    Catppuccin Mocha palette adapter + semantic tokens (the only place colours are named)
scripts/         anonymize.ts (structure-preserving anonymizer), any generators
stacks/          github.ts — bootstrap stack minting the CI token + GitHub secrets
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
