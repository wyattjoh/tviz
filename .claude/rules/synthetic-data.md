---
description: How to produce committed transcript data (fixtures, demo sessions) and how to survey real transcripts without reading them
paths:
  - "scripts/**"
  - "src/fixtures/**"
  - "public/demo/**"
alwaysApply: false
---

# Synthetic data only

Real transcripts contain PII: private code, absolute paths, repo names, conversation
content. Nothing derived from them may be committed unless it has been through the
Anonymizer or was written by hand. Fixtures under `src/fixtures/` and demo sessions under
`public/demo/*.jsonl` come only from `scripts/anonymize.ts` or a hand-written synthetic
generator. Review anonymizer output before committing it. See ADR-0002.

## What the Anonymizer preserves, and why

`scripts/anonymizer.ts` is structure-preserving. It keeps:

- Line count, Record `type` sequence, key order, line endings.
- Every number, boolean and null — so **Measured Tokens stay exact** and a Demo Session
  reproduces real context growth.
- String lengths and newline positions.
- Timestamps and uuids. A uuid carries no free text, and keeping it means a Demo
  Session's `sessionId` still matches its file name.

It rewrites:

- Non-uuid ids (`msg_`/`toolu_`/`req_`) to same-shape fakes, deterministic per value, so
  `message.id` grouping and `tool_use_id` pairing still resolve downstream.
- MCP tool names to `mcp__` plus salad segments of the same lengths. The prefix is public
  vocabulary and the UI labels a row with the tool name, so an MCP call still reads as
  one; the server and tool segments are the developer's own configuration and go.
- Every other string to seeded Latin word salad, fake paths, or base64-ish filler.

Three rules that are easy to get backwards:

- **Enum-like keys are not a promise.** Values under `type`, `role`, `model`, `version`, …
  are kept only when the value is _also_ enum-shaped: one short token, no whitespace. A
  key named `name` can still hold free text.
- **Shape is not enough for a name.** A tool `name` is kept only when it is on the
  built-in allow-list, because built-ins are identical for every user. Anything else on a
  tool block — MCP, a Skill, a sub-agent, a plugin tool — is named by the developer and is
  replaced. The allow-list fails closed: a tool a newer Claude Code adds is not on it and
  gets replaced, which costs Demo Session readability, never safety.
- **Object keys are content too.** A key is kept only when it is a known schema key
  (surveyed over the 101 real sessions); any other key is renamed, because a key can be
  content — a file-backup map is keyed by file name.

`hookEvent` is an enum key; **`hookName` is not**, and must not be added back. The corpus
holds 6 distinct events against 62 distinct names, most longer than twenty characters —
the name is whatever the developer typed into their settings.

The CLI refuses to write if the structure drifted, or if the username, its parts, the
home directory, or a known repo name survived.

```sh
bun run anonymize <in.jsonl> <out.jsonl> [--seed s] [--force] [--forbid term]
```

## Surveying real transcripts

Never open a real transcript directly — they are 0.5–13 MB, and reading one pastes PII
into a transcript that is itself a deliverable. Write a Bun script under
`.scratch/analysis/` that prints key paths, types, and counts, never string content.
Existing survey scripts: `schema.ts`, `attachments.ts`, `derive.ts`, `turns.ts`.

To re-audit the Anonymizer against the corpus there are three more: `pii-audit.ts` (runs
every session through it and reports forbidden-term and pattern-detector hits),
`kept-cardinality.ts` (distinct values per key path that survive verbatim — high
cardinality at a key path means free text is leaking there) and `shape-probe.ts`. Report
key paths and counts only; a key the Anonymizer renamed prints as `<renamed>`, because the
input key is itself content.

The corpus lives under this author's own `~/.claude/projects/<encoded-project-path>/`
(101 sessions, CC 2.1.140–2.1.251). Use it only through those scripts.
