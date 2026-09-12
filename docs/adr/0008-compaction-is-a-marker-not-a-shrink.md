---
status: accepted
---

# Compaction is read from the transcript's markers, never inferred from a shrink

Attribution has to restart whenever an API Call carries less context than the one before it — there is no negative delta to scale (ADR-0003). The parser originally treated that shrink as the definition of a compaction. A census of the local corpus shows it is not one, in both directions: the `measuredTotal < previousTotal` test has **never** identified a compaction that the transcript's own markers missed, seven real compactions _grew_ the measured total, and 163 of the 344 resets it produced across the marker-bearing files were cache churn or Claude Code shedding old tool results. Roughly half the compaction rules the Scrubber drew marked something that never happened.

So the two questions are separated. **Reset** — did attribution restart here? — stays inferred, because the arithmetic needs it and a smaller window really does rewrite the grid. **Compaction** — was this the event Claude Code calls a compaction? — is answered only by the transcript: a `{type: "system", subtype: "compact_boundary"}` record, or the `isCompactSummary` flag on the summary that follows it. `ContextSnapshot` carries both, and only `compaction` is marked on the Scrubber.

The boundary record is authoritative and the flag is the fallback. The boundary precedes the summary in every pair observed (178/178) and fires even when the total grew; the flag covers the seven files carrying no boundary. Whichever arrives first also clears the queued items, which were in the pre-compaction window and did not survive it — before the fix they were scaled into the new window at a median 13% of its budget.

## Consequences

- `compact_boundary` is decoded as a known record rather than skipped as `system` bookkeeping. It is matched on the subtype, so every other `system` subtype stays metadata.
- A shrink with no marker still resets, and still rewrites the grid, but says so as a plain reset. The Scrubber draws nothing there, because there is nothing the transcript lets us name.
- None of the bundled Demo Sessions carries a marker, so none of them may describe itself as compacting — `scripts/demo-data.test.ts` enforces that.
- `compactMetadata.preTokens` is recorded but unused. It is an exact pre-compaction total and a possible signal for the _effective_ context window (an `auto` trigger fires near 96.7% of the window), which is left to "with more time".
