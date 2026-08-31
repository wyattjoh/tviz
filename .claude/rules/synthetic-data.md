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
- Every other string to seeded Latin word salad, fake paths, or base64-ish filler.

Two rules that are easy to get backwards:

- **Enum-like keys are not a promise.** Values under `type`, `role`, `model`, `version`,
  tool `name` on `tool_use` blocks, … are kept only when the value is _also_ enum-shaped:
  one short token, no whitespace. A key named `name` can still hold free text.
- **Object keys are content too.** A key is kept only when it is a known schema key
  (surveyed over the 101 real sessions); any other key is renamed, because a key can be
  content — a file-backup map is keyed by file name.

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

The corpus lives at
`~/.claude/projects/-Users-wyatt-johnson-Code-github-com-wyattjoh-agent-toolkit/`
(101 sessions, CC 2.1.140–2.1.251). Use it only through those scripts.
