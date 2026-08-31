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

| Record                                                                                                                                                                                                                                                                      | Category / use                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `assistant` → `message.usage.{input_tokens,cache_read_input_tokens,cache_creation_input_tokens}`                                                                                                                                                                            | **Exact total context** for that API call. Several `assistant` records share one `message.id`/`requestId` (one call, many content blocks) — dedupe per call.          |
| `attachment.type = skill_listing` (`content`, `names`, `skillCount`, `isInitial`)                                                                                                                                                                                           | Skills                                                                                                                                                                |
| `attachment.type = agent_listing_delta` (`addedLines`, `addedTypes`, `removedTypes`)                                                                                                                                                                                        | Custom agents                                                                                                                                                         |
| `attachment.type = nested_memory` (`path`, `content.rawContent`, `content.globs`)                                                                                                                                                                                           | Memory files (lazy-loaded rules/MEMORY.md/nested CLAUDE.md only)                                                                                                      |
| `attachment.type = mcp_instructions_delta` (`addedBlocks`), `deferred_tools_delta` (`addedLines`)                                                                                                                                                                           | MCP / deferred tool names                                                                                                                                             |
| `user`/`assistant` content blocks (`text`, `tool_use`, `tool_result`, `image`; `thinking` is not re-sent) and remaining attachments (`hook_success`, `total_tokens_reminder`, `task_reminder`, …)                                                                           | Messages, with sub-kinds User / Assistant / Tool result / Reminder                                                                                                    |
| system prompt, built-in tool schemas, root CLAUDE.md                                                                                                                                                                                                                        | **Not logged.** Combined "System" bucket = first-call total − estimated logged parts; stable per CC version (±1k).                                                    |
| `type` ∈ `system` (`subtype`: `stop_hook_summary`, `turn_duration`, `local_command`, `compact_boundary`, …), `progress`, `last-prompt`, `mode`, `permission-mode`, `ai-title`, `file-history-*`, `agent-*`, `queue-operation`, … — the full list is `METADATA_RECORD_TYPES` | Metadata, not in context. Skipped silently. A record type that is _not_ on that list is skipped and counted, never fatal — that count is the signal the format moved. |
| `<session>/subagents/agent-*.jsonl` + `.meta.json` (`agentType`, `spawnDepth`)                                                                                                                                                                                              | Separate context windows. MVP: count only.                                                                                                                            |
| `<session>/tool-results/*.txt`                                                                                                                                                                                                                                              | Offloaded outputs, not in context. Ignore.                                                                                                                            |

## Context window size

Also not recorded. Default from a model→window table (Claude 5 family = 1M, older = 200k),
bump to 1M when any observed total exceeds 200k, and allow a UI override.
