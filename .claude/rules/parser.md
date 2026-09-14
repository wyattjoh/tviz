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
  once. The `uuid` at the end of that fallback chain is per-Record, so it defeats the
  dedupe — it is a last resort for a Record carrying neither of the other two, not a key.
  Admission also requires a Measured Total above zero (below).
- **Unknown Record types are skipped and counted, never fatal.** Transcripts span Claude
  Code 2.1.140–2.1.251 and the format keeps growing; a new `type` must not fail a parse.
  Known bookkeeping types (`METADATA_RECORD_TYPES` in `records.ts`) are skipped *without*
  being counted, so `unknownRecordTypes` stays a usable "the format moved" signal rather
  than a tally of the hundreds of `system`/`mode`/`progress` Records every session logs.
  A type confirmed to be metadata is added to that set, never accounted as context.
  A type the parser *does* account for whose body will not decode is tallied separately,
  as `<type> (undecodable)`: it means the shape moved rather than the vocabulary, and an
  `assistant` that lands there takes a whole API Call's `usage` with it. Zero occurrences
  across 91k records today, so it is an early-warning counter rather than a live concern.
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
- **Estimates are scaled to Measured Tokens** (ADR-0003). The one exception is the first
  API Call when the logged parts already fit inside it: there the weights are emitted as
  they are and the leftover becomes System, which is what makes System a remainder at all.
  There is no negative delta to scale: a call carrying less than the one before it restarts
  attribution from itself, keeping System.
- **Only the transcript can say a compaction happened.** A `compact_boundary` Record, or
  the `isCompactSummary` flag on the summary that follows it — never an inferred shrink,
  which also fires on cache churn and dropped tool results. `ContextSnapshot.reset` says
  attribution restarted; `ContextSnapshot.compaction` says why, and is what the Scrubber
  marks. Whichever marker fires also clears the queued items: they were in the
  pre-compaction window and did not survive it.
- **A zero Measured Total is not an API Call.** Interrupts and API errors are logged as
  assistant Records (`model: "<synthetic>"`) carrying a complete `usage` whose input fields
  are all zero. Admitting them draws an empty Context Snapshot and drags the running total
  down to nothing.
- **System is a remainder** (ADR-0001), not a sum: first call's Measured Tokens minus the
  Estimated Tokens of every logged part. Derived once, on the first call, and never
  re-derived — only the value *drawn* on a call too small to hold it is clamped.
- **Context Window size is not recorded, and the model id does not supply it** (ADR-0009).
  The id says what the model is *capable* of; the grid needs what the Session *had*, and
  Claude Code's 1M window is opt-in, so those differ for most Sessions on a recent model.
  Only two things raise the window above 200k, and both are properties of the Session: a
  Measured Total past 200k, which proves it, and the `[1m]`/`[2m]` suffix on the model id,
  which is not a capability but the recorded trace of the opt-in. Everything else is 200k,
  the smaller claim. A peak *under* 200k proves nothing either way, so a Session that really
  did run at 1M and stayed small is drawn against 200k and corrected by the UI override.
  **Do not reintroduce a native-ceiling table.** One existed, was accurate against
  Anthropic's documentation, and was still the wrong question — it drew every short Session
  on a 1M-capable model as a nearly empty 1M grid, and it was a standing obligation to keep
  matched to a moving list.
