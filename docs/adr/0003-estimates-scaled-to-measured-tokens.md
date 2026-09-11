---
status: accepted
---

# Per-item token estimates are scaled to the API's measured totals

No browser tokenizer exists for Claude models, and `chars / 4` undercounts code-heavy content by 1.3–1.5×. Every API Call does, however, report exact input tokens. We estimate each item added since the previous call by character count, then scale those estimates so they sum to the measured delta. Totals and the fill level of the grid are therefore exact; only the split between items within one call is approximate — the same "estimated" caveat `/context` itself carries.

## Consequences

- Items added in the same API Call share one scaling factor; a large tool result and a short user message in the same call keep their relative proportion, not their absolute accuracy.
- Compaction shows as a negative delta; the parser must reset attribution from the compaction summary rather than scale a negative number.
