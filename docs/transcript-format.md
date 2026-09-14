# The Claude Code transcript format — what tviz relies on

A Claude Code session is one JSONL file: one **Record** per line. This is what a survey of
101 sessions (57k Records, Claude Code 2.1.140–2.1.251) established about the parts tviz
reads. None of it is documented by Claude Code; all of it was derived from the corpus with
the analysis scripts described in
[`.claude/rules/synthetic-data.md`](../.claude/rules/synthetic-data.md). The record-type
list in the last-but-two row was later widened by a census over the whole local corpus
(3.3M Records) — counts and type names only, never content.

The headline finding: **the `/context` breakdown is not stored.** `/context` computes it
live, and the transcript keeps neither the breakdown nor the system prompt it is mostly
made of. tviz therefore derives it — see ADR-0001 (one combined System category) and
ADR-0003 (estimates scaled to measured tokens).

| Record                                                                                                                                                                                                                                                                                                         | Category / use                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistant` → `message.usage.{input_tokens,cache_read_input_tokens,cache_creation_input_tokens}`                                                                                                                                                                                                               | **Exact total context** for that API call. Several `assistant` records share one `message.id`/`requestId` (one call, many content blocks) — dedupe per call.                    |
| `attachment.type = skill_listing` (`content`, `names`, `skillCount`, `isInitial`)                                                                                                                                                                                                                              | Skills                                                                                                                                                                          |
| `attachment.type = agent_listing_delta` (`addedLines`, `addedTypes`, `removedTypes`)                                                                                                                                                                                                                           | Custom agents                                                                                                                                                                   |
| `attachment.type = nested_memory` (`path`, `content.rawContent`, `content.globs`)                                                                                                                                                                                                                              | Memory files (lazy-loaded rules/MEMORY.md/nested CLAUDE.md only)                                                                                                                |
| `attachment.type = mcp_instructions_delta` (`addedBlocks`), `deferred_tools_delta` (`addedLines`)                                                                                                                                                                                                              | MCP / deferred tool names                                                                                                                                                       |
| `user`/`assistant` content blocks (`text`, `tool_use`, `tool_result`, `image`; `thinking` is logged with an empty `thinking` string in 93% of blocks, so it carries no weight) and remaining attachments (`hook_success`, `total_tokens_reminder`, `task_reminder`, …)                                         | Messages, with sub-kinds User / Assistant / Tool result / Reminder                                                                                                              |
| system prompt, built-in tool schemas, root CLAUDE.md                                                                                                                                                                                                                                                           | **Not logged.** Combined "System" bucket = first-call total − estimated logged parts; stable per CC version (±1k).                                                              |
| `system` with `subtype: compact_boundary` (`compactMetadata.{trigger,preTokens}`)                                                                                                                                                                                                                              | **The compaction marker.** Written _before_ the `isCompactSummary` user record carrying the summary, and the only signal that fires when a compaction grows the measured total. |
| `assistant` with `model: "<synthetic>"` — interrupts and API errors (`isApiErrorMessage`)                                                                                                                                                                                                                      | **Not an API call.** Carries a complete `usage` whose three input fields are all zero: 909 of 909 across the corpus. Skipped before call admission.                             |
| `type` ∈ `system` (`subtype`: `stop_hook_summary`, `turn_duration`, `local_command`, `away_summary`, … — every subtype but `compact_boundary`), `progress`, `last-prompt`, `mode`, `permission-mode`, `ai-title`, `file-history-*`, `agent-*`, `queue-operation`, … — the full list is `METADATA_RECORD_TYPES` | Metadata, not in context. Skipped silently. A record type that is _not_ on that list is skipped and counted, never fatal — that count is the signal the format moved.           |
| `<session>/subagents/agent-*.jsonl` + `.meta.json` (`agentType`, `spawnDepth`)                                                                                                                                                                                                                                 | Separate context windows. MVP: count only.                                                                                                                                      |
| `<session>/tool-results/*.txt`                                                                                                                                                                                                                                                                                 | Offloaded outputs, not in context. Ignore.                                                                                                                                      |

## Sessions with no API calls

Claude Code writes the transcript as the session happens, so a session that is opened and
abandoned still leaves a file: `mode`, `file-history-snapshot`, the `user` prompt, a
`cost-state`, and no `assistant` record at all. Six of the 35 files in this project's own
transcript folder are that shape.

Such a file has no `usage` anywhere, so there is no measured total, so there is no Context
Snapshot tviz could honestly draw — the whole grid is anchored on measured tokens
(ADR-0003). It is still a Claude Code transcript, though, and calling it "not a Claude
Code transcript" is wrong. The parser therefore separates the two by asking whether it
recognised _any_ record: a file it recognises but that never reached an API call fails
with `NoApiCallsError` (`reason: "noApiCalls"`), and the session list skips those silently
rather than listing them as failures. A file it recognises nothing in stays
`NotATranscriptError` and is still reported.

## Compaction

The authoritative marker is a `{type: "system", subtype: "compact_boundary"}` record
carrying `compactMetadata.{trigger: "auto" | "manual", preTokens}`. It precedes the
`isCompactSummary: true` user record holding the summary in every pair observed (178/178),
and tviz resets on whichever of the two it meets first.

A **shrinking measured total is not a compaction signal.** Across the corpus it has never
identified a compaction the markers missed, seven real compactions _grew_ the total, and it
fires on cache churn and on Claude Code dropping old tool results — which rewrite the
window too, but are not compaction. tviz restarts attribution on either and records which
it was (`ContextSnapshot.compaction`), so only a real compaction is marked on the Scrubber.

Whatever is queued when a marker fires was in the pre-compaction window and did not survive
it, so it is discarded rather than scaled into the new one.

## Context window size

Also not recorded. What the id does give is the model's **native** window, which
[Anthropic documents per model](https://platform.claude.com/docs/en/build-with-claude/context-windows)
and which needs no beta header. tviz does **not** read it. A model id says what the model
is capable of; the grid needs what the Session ran against, and Claude Code's 1M window is
opt-in — so for most Sessions on a 1M-capable model those are different numbers (ADR-0009).

What the id contributes is the `[1m]` suffix, which is not a capability but the recorded
trace of the opt-in itself. It rarely survives: `message.model` is canonicalised before it
is written, and the suffix appears in none of 600 sampled sessions. Where it does appear it
is the most direct evidence there is.

That leaves the peak as the workhorse. Any Measured Total past 200k proves the larger
window, because no session can hold more context than its window holds. Under 200k the
transcript is simply silent — four unrecorded things can hold a session below its model's
ceiling (missing usage credits, `CLAUDE_CODE_DISABLE_1M_CONTEXT`, a configured auto-compact
window, a Claude Code predating the model's 1M support) and nothing distinguishes them from
a session that never needed the room. tviz takes the smaller claim there and leaves the
rest to the UI override.
