---
description: Invariants for the transcript parser, domain types and Web Worker, including how Effect is allowed to be used
paths:
  - "src/parser/**"
  - "src/domain/**"
  - "src/worker/**"
alwaysApply: false
---

# Parser, domain and Worker

Read [`docs/transcript-format.md`](../../docs/transcript-format.md) before changing what
the parser reads, and `CONTEXT.md` for the vocabulary these types are named after.

## How Effect is used here

**Effect v4 beta for the parser only** (ADR-0004): `Schema` for lenient JSONL record
decoding, `Effect.gen`/`Effect.fn` to compose the parse→aggregate pipeline. No Layers, no
Services, no Streams. The parser returns plain data (POD) to React. Do not "complete" the
Effect adoption without a concrete need. Use the `effect-ts-beta` skill; it requires the
pinned source clone at `~/.claude/skills/effect-ts-beta/.source/` (see the skill's
Prerequisites Check).

Parsing runs in a **Web Worker** (`src/worker/`) so multi-MB files don't block the UI, and
because a 13 MB in-memory string is fast enough that streaming is not worth it.

## Invariants

- **Dedupe per API Call.** Several `assistant` Records share one `message.id`/`requestId`:
  that is one API Call with many content blocks, and its `message.usage` must be counted
  once.
- **Unknown Record types are skipped and counted, never fatal.** Transcripts span Claude
  Code 2.1.140–2.1.251 and the format keeps growing; a new `type` must not fail a parse.
  Known bookkeeping types (`METADATA_RECORD_TYPES` in `records.ts`) are skipped *without*
  being counted, so `unknownRecordTypes` stays a usable "the format moved" signal rather
  than a tally of the hundreds of `system`/`mode`/`progress` Records every session logs.
  A type confirmed to be metadata is added to that set, never accounted as context.
- **A file with no API Calls is not automatically "not a transcript".** A Session quit
  before its first response leaves prompts and bookkeeping with no `usage`, and so no
  Context Snapshot to draw. The parser tells the two apart by whether it recognised any
  Record: recognised-but-callless fails with `NoApiCallsError`, which the Session list
  skips silently; recognised-nothing stays `NotATranscriptError` and is still reported.
  Widening the silent skip to any failure would hide files that genuinely could not be
  read.
- **`ContextSnapshot.items` is emitted in context order and stays stable across calls.**
  Re-sorting items downstream silently reintroduces the grid re-flow that ADR-0006 exists
  to avoid.
- **Estimates are scaled to Measured Tokens** (ADR-0003), never emitted raw. Compaction is
  a negative delta: reset attribution from the compaction summary rather than scaling a
  negative number.
- **System is a remainder** (ADR-0001), not a sum: first call's Measured Tokens minus the
  Estimated Tokens of every logged part.
- **Context Window size is not recorded.** Default from a model→window table (Claude 5
  family = 1M, older = 200k), bump to 1M when any observed total exceeds 200k, and allow a
  UI override.
