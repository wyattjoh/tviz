# tviz

Drop a finished Claude Code transcript in your browser and see where its context window
went, call by call.

`/context` answers that question live, for the session you're in. tviz answers it for any
session that has already ended, from its `.jsonl` transcript: the same grid of fixed-size
cells coloured by category — System, Custom Agents, Memory Files, Skills, MCP, Messages —
drawn for every API call, with a scrubber to watch the window fill, category filters, and
a legend of tokens and percent-of-window.

**[tviz.wyattjoh.workers.dev](https://tviz.wyattjoh.workers.dev)** — click _Load demo_; no
install, no login, nothing to upload.

Transcripts never leave the browser. There is no server: the deployment is an assets-only
Cloudflare Worker, parsing runs in a Web Worker in your tab, and nothing is persisted to
`localStorage` or `IndexedDB`. The bundled demo sessions are synthetic, produced by
`scripts/anonymize.ts`.

Your own transcripts live in `~/.claude/projects/<encoded-project-path>/`. Drop one file,
several, or the whole folder.

## Stack

Bun + TypeScript, Vite 8, React 19, Tailwind (Catppuccin Mocha). Effect v4 `Schema` for
lenient JSONL decoding in the parser. Deployed with Alchemy to Cloudflare.

## Development

```sh
bun install
bun run dev            # vite dev server
bun run build          # tsc -b && vite build
bun run test           # vitest run
bun run lint           # oxlint --deny-warnings
bun run format         # oxfmt
```

Build a synthetic session from a real transcript:

```sh
bun run anonymize <in.jsonl> <out.jsonl>
```

## Docs

- [`docs/rationale.md`](docs/rationale.md) — why this, what was non-obvious about
  transcripts, the trade-offs, and what I'd do next.
- [`CONTEXT.md`](CONTEXT.md) — domain vocabulary.
- [`docs/adr/`](docs/adr/) — decision records.
