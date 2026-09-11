---
status: accepted
---

# One combined System category instead of /context's three

`/context` lists System prompt, System tools, and Memory files separately, but transcripts never log the system prompt, built-in tool schemas, or root CLAUDE.md content — only lazily loaded nested memory is recorded. We therefore report one **System** category computed as the first API Call's Measured Tokens minus the Estimated Tokens of every logged part (skills, agents, MCP, deferred tools, first message). Across 101 real sessions this remainder is stable within ±1k per Claude Code version, so it is trustworthy as a total even though it cannot be split.

## Considered options

- **Split via the first-call cache boundary** (`cache_read` ≈ static prefix, `cache_creation` ≈ per-project part). Rejected: relies on undocumented caching behaviour and fails whenever `cache_read` is 0 (first session after a version bump).
- **User-supplied calibration** by pasting a `/context` snapshot per version. Deferred to "with more time": adds UI and stored state for a marginal gain.
