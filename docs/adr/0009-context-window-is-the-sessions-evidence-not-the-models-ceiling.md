---
status: accepted
---

# The Context Window is inferred from the Session's evidence, not the model's ceiling

A transcript never records the window its Session ran against, so the grid's denominator has to be derived. The parser originally derived it from the model id, against an explicit table of the ids whose **native** window is 1M. The table was correct — it matched Anthropic's context-windows documentation, id for id — and the inference built on it was still wrong, because a model id answers a question nobody asked. It says what the model is _capable_ of. The grid needs to know what this Session _had_.

Those differ for almost every Session on a recent model. Claude Code's 1M window is opt-in, and several unrecorded things hold a Session below its model's ceiling: missing usage credits, `CLAUDE_CODE_DISABLE_1M_CONTEXT`, a configured auto-compact window, a Claude Code old enough to predate the model's 1M support. The result was that every short Session on an Opus 4.6-or-later model was drawn as a nearly empty 1M grid. The bundled `medium` Demo Session — 62 API Calls, peaking at 105k — read as 10% full when the session it came from was running at roughly half its window.

So the model id contributes exactly one thing now: the `[1m]` / `[2m]` suffix, which is not a capability but a recorded trace of the opt-in itself. Two things raise the window above 200k, and both are properties of the Session:

- a Measured Total past 200k, which **proves** the larger window, since no Session can hold more context than its window; and
- the `[1m]` marker on the model id, which records the choice directly.

Absent either, the answer is 200k — the smaller claim. The native-ceiling table is deleted rather than demoted: nothing else read it, and a table that no longer decides anything is a table that silently rots against Anthropic's docs.

This is the same preference that makes System a derived remainder rather than a guessed split (ADR-0001) and scales per-item estimates to what was actually measured (ADR-0003). Where the data is silent, say the smaller thing and let the reader correct it.

## Consequences

- A Session that genuinely ran at 1M but stayed under 200k is now drawn against 200k. This under-states its headroom, which is the error this decision accepts: it makes a Session look fuller than it was rather than emptier, and one click of the Context Window override fixes it. A peak under 200k proves nothing in either direction, so there is no reading of that Session the transcript supports.
- `LARGE_WINDOW_MODELS`, `isLargeWindowModel` and the id canonicalisation that existed to look the table up (provider prefixes, release stamps) are gone. `window.ts` is the `[1m]` regex, the two sizes, and the peak comparison.
- Nothing has to be kept matched to Anthropic's model documentation any more. The previous table was a standing maintenance obligation that a new model release would quietly invalidate.
- Two of the three bundled Demo Sessions changed denominator, so their manifest descriptions changed with them: `small` reads 45k of 200k, `medium` half of 200k. `large` is unchanged and is now the one Demo Session whose window is evidence rather than a default — it passes 200k, which `scripts/demo-data.test.ts` asserts.
- The UI override carries more weight than it did, since it is now the only way to say "this Session really did have 1M". It stays where it is, behind the cog in the Context Window panel, with the panel's `(inferred)` / `(override)` note saying which is in force.
