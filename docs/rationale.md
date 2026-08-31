# tviz — design rationale (draft)

> Working notes kept current during development. Edit voice and fill in **Time spent** before submitting.

## Theme and approach

Theme 1, Exploration & Understanding. Claude Code transcripts are an unfamiliar artifact: 0.5–13 MB JSONL files with ~20 record types, and the one question everyone asks — "where did my context go?" — is only answerable live via `/context`. tviz answers it after the fact, for any session, in the browser.

## What is non-obvious

- The `/context` breakdown is **not in the transcript**. Verified with schema-survey scripts over 57k records: usage totals are exact per API call, but the system prompt, tool schemas, and root CLAUDE.md are never logged. Skills, agents, MCP, and nested memory _are_ logged as attachments with their injected text.
- The unlogged part is recoverable as a remainder that is stable to ±1k tokens within a Claude Code version — so it can be shown honestly as one "System" bucket rather than faked as three.
- Character-based estimates undercount code by 1.3–1.5×, but because each API call reports exact totals, estimates can be scaled per call so the grid's fill level is always exact.

## Key decisions and trade-offs

- **Browser-only processing.** Transcripts are sensitive; nothing leaves the tab. Cost: no server-side caching, 13 MB files parse in a Web Worker.
- **One System category** (ADR-0001) instead of a heuristic split via cache boundaries or user calibration.
- **Synthetic demo data via a structure-preserving anonymizer** (ADR-0002): real growth curves, zero PII.
- **Fixed-quantum grid like `/context`** rather than a treemap: familiar to Claude Code users, and filtering keeps cells in place so proportions stay comparable.
- **Append-only cells on a fixed 1k-token quantum** (ADR-0006) rather than cells grouped by category: stepping through calls then reads as growth at the frontier instead of a re-flow, and a 1M window renders 1,000 cells rather than 200 smaller ones. Cost: category colours interleave, so proportions are read from the legend — a lone green cell in a field of blue is a skill that loaded mid-session, which the grouped layout threw away.
- **Effect v4 beta limited to Schema + a pure pipeline** (ADR-0004): typed lenient decoding without paying for Layers/Services in a 2–3h build.

## With more time

- Subagent context windows nested under the parent session.
- Small multiples across a folder of sessions; per-call growth chart.
- Calibration by pasting a `/context` snapshot to split System into prompt / tools / memory.
- Item-level drilldown (which tool result ate 40k tokens).

## Time spent

_TODO_ — include research/grilling (~1h so far, 2026-08-31), implementation, deploy, video.
