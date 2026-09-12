---
status: accepted
---

# Per-item token estimates are scaled to the API's measured totals

No browser tokenizer exists for Claude models, and `chars / 4` undercounts code-heavy content by 1.3–1.5×. Every API Call does, however, report exact input tokens. We estimate each item added since the previous call by character count, then scale those estimates so they sum to the measured delta. Totals and the fill level of the grid are therefore exact; only the split between items within one call is approximate — the same "estimated" caveat `/context` itself carries.

## Consequences

- Items added in the same API Call share one scaling factor; a large tool result and a short user message in the same call keep their relative proportion, not their absolute accuracy.
- A delta is only meaningful while the window grows. When a call comes back carrying less than the one before it, there is no negative amount to scale: attribution restarts from that call, keeping System. That restart is not the same thing as a compaction, and is not evidence of one — see ADR-0008.
- An API Call is a call that measured something. Claude Code logs interrupts and API errors as assistant Records carrying a complete `usage` whose input fields are all zero; scaling against those produces an empty snapshot and a Measured Total that can only fall, so they are not admitted.
