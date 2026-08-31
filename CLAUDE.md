# tviz

Browser-only visualizer for Claude Code session transcripts. Drop a `.jsonl` transcript (or a folder of them) and see where the context window went, bucketed like `/context`: System, Skills, Custom agents, Memory files, MCP, Messages — as a grid of fixed-token cells with category filters and a per-API-call scrubber.

## Constraints (drive every scope decision)

- Deployed prototype must be usable in a browser with **no local install** and **no reviewer-supplied data** → demo mode with bundled synthetic sessions is mandatory, not optional.
- Deliverables: deployed URL, GitHub repo, `docs/rationale.md` + ~5 min video (user records), and the Claude Code transcripts of this project. Keep the rationale draft current as decisions land.
- Prefer one polished interaction over breadth. Extensions go in the rationale's "with more time" section, not into the MVP.

## Hard rules

These apply in every session, including ones that touch none of the scoped rule files below.

- **Transcript data never leaves the browser.** No upload, no server-side parsing, no persistence (no IndexedDB/localStorage of session content). The Worker is assets-only.
- **No real transcript content in the repo, fixtures, tests, or demo data.** Committed data comes only from `scripts/anonymize.ts` or a hand-written synthetic generator, and gets reviewed before it lands — see [`.claude/rules/synthetic-data.md`](.claude/rules/synthetic-data.md).
- **Never read real transcript files directly** (0.5–13 MB, full of PII). Survey them with a Bun script under `.scratch/analysis/` that prints key paths, types and counts — never string content.
- **Never print deploy state or the CI token into a transcript.** `.alchemy/state/tviz-ci/*/DeployToken.json` holds a live Cloudflare API token in plaintext: never `cat` it, never `alchemy state get`/`export` the `tviz-ci` stack, and never run `alchemy cloudflare create-token`. See [`.claude/rules/deploy.md`](.claude/rules/deploy.md).

## Stack

- Bun + TypeScript, Vite 8, React 19, Tailwind, Catppuccin Mocha.
- **Effect v4 beta** for the parser only — `Schema` decoding plus a pure pipeline, no Layers/Services.
- Parsing runs in a **Web Worker** so multi-MB files don't block the UI.
- Tests: **Vitest**, beside source, with synthetic fixtures.
- Deployment: **Alchemy** → an assets-only Cloudflare Worker; CI deploys `prod` on pushes to `main`.
- Lint/format: oxlint + oxfmt via lefthook pre-commit. Run `bun run lint` and `bun run format` after edits.
- `effect` and `alchemy` are on coupled prerelease pins — read [`.claude/rules/dependencies.md`](.claude/rules/dependencies.md) before bumping either.

## Commands

```sh
bun run dev            # vite dev server
bun run build          # tsc -b && vite build
bun run test           # vitest run (src/**/*.test.{ts,tsx} and scripts/**/*.test.ts)
bun run lint           # oxlint --deny-warnings
bun run format         # oxfmt
bun run format:check   # oxfmt --check
bun run anonymize <in.jsonl> <out.jsonl> [--seed s] [--force] [--forbid term]
bun alchemy plan       # read-only preview
bun alchemy deploy --yes [--stage prod]   # remote write: explicit confirmation first
```

## Layout

```
src/domain/      POD vocabulary shared by parser, worker and UI: Category, MessageKind, ContextSnapshot, Session
src/parser/      Effect Schema record types, JSONL decode, per-call aggregation → POD snapshots
src/worker/      Web Worker entry wrapping the parser, plus its main-thread client
src/ui/          React components: DropZone, SessionList, ContextGrid, Legend/Filters, Scrubber
src/fixtures/    synthetic JSONL fixture builders for tests
src/index.css    Catppuccin Mocha palette adapter + semantic tokens (the only place colours are named)
scripts/         anonymizer.ts (Anonymizer library + tests), anonymize.ts (CLI), any generators
stacks/          github.ts — bootstrap stack minting the CI token + GitHub secrets
public/demo/     bundled anonymized demo sessions (small/medium/large)
docs/            adr/ (decisions), transcript-format.md, rationale.md, agents/
```

## Docs

- [`CONTEXT.md`](CONTEXT.md) — domain vocabulary. Read it before changing the model or the parser, and use its terms rather than synonyms it tells you to avoid.
- [`docs/adr/`](docs/adr/) — decisions. Read the ones touching your area; surface conflicts rather than overriding silently.
- [`docs/transcript-format.md`](docs/transcript-format.md) — what the parser relies on in the JSONL format, and what the format does not record.
- [`docs/rationale.md`](docs/rationale.md) — the design write-up deliverable.
- [`docs/agents/domain.md`](docs/agents/domain.md) — how skills consume the domain docs.
- [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md) — issues and specs are markdown under `.scratch/<feature-slug>/`; this feature's live at `.scratch/context-viz/` (`plan.md`, `issues/`, `deliverables/`).

### Path-scoped rules

Claude loads these automatically when touching matching files; other agents should read the relevant one by hand.

| Rule                                                                 | Applies to                                        |
| -------------------------------------------------------------------- | ------------------------------------------------- |
| [`.claude/rules/parser.md`](.claude/rules/parser.md)                 | `src/parser/`, `src/domain/`, `src/worker/`       |
| [`.claude/rules/ui-theme.md`](.claude/rules/ui-theme.md)             | `src/ui/`, `src/index.css`                        |
| [`.claude/rules/synthetic-data.md`](.claude/rules/synthetic-data.md) | `scripts/`, `src/fixtures/`, `public/demo/`       |
| [`.claude/rules/testing.md`](.claude/rules/testing.md)               | `*.test.ts(x)`, `src/fixtures/`                   |
| [`.claude/rules/deploy.md`](.claude/rules/deploy.md)                 | `alchemy.run.ts`, `stacks/`, `.github/workflows/` |
| [`.claude/rules/dependencies.md`](.claude/rules/dependencies.md)     | `package.json`, `bun.lock`                        |
