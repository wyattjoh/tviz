---
status: accepted
---

# The context grid is append-only, with Cells of a fixed token quantum

Grouping Cells by Category — System first, then Custom Agents, Memory Files, Skills, MCP, Messages — makes the grid re-flow on almost every API Call: a skill loaded at call 40 inserts ahead of every message already drawn, so the whole picture shifts. Stepping through the Scrubber then reads as churn rather than growth. Cells are instead laid out in the order items entered the context, so moving forward one call only ever fills Cells at the frontier and a compaction is the single event that rewrites earlier ones. A Cell is a fixed 1,000 tokens rather than `windowSize / 200`, so a 1M window renders 1,000 Cells at the same physical size instead of 200 smaller ones, and the grid's area is proportional to the window it represents.

## Consequences

- Category colours interleave instead of forming contiguous blocks. Proportions are read from the legend; the grid answers "when did this enter" and "how full is it", not "how big is each bucket". A single green Cell in a field of blue is a skill that loaded mid-session, which is information the grouped layout threw away.
- Filtering must blank Cells in place for Message Kinds as well as Categories. Removing a Kind's items would shift everything after them, which is the re-flow this decision exists to avoid, so hiding is purely visual and legend totals do not change.
- The parser must emit each Context Snapshot's `added` items in context order, so that the cumulative sequence for a call — `cumulativeItems(calls, index)`, the calls since the last reset concatenated — is stable: the items of call `n` are a prefix of the items of call `n + 1`. Re-sorting items downstream would silently reintroduce the re-flow. The cumulative sequence is derived rather than stored per call: keeping a copy on every Context Snapshot is quadratic, and on a transcript the size of the largest real one it cost 24.5M item slots, a 1.1s structured clone across the Worker boundary and ~1 GB of memory, against 7k slots and 11 ms derived on demand.
- A Cell takes the colour of the Category holding the majority of its token range, with one floor: a Category holding tokens gets at least one Cell, taken from the Cell it reaches furthest into and only from a Category that holds more than one. Otherwise a Category smaller than the quantum — 175 tokens of MCP — is listed in the legend and invisible on the grid. The floor changes a Cell's colour, never its position, so it does not re-flow anything. Where several sub-quantum Categories crowd into the same Cell there are fewer Cells than Categories and the grid can only show as many as it has Cells; the legend stays the whole truth.
- Only the frontier Cell can change colour as a Session grows. A fully covered Cell keeps its majority for ever, but the partly-filled Cell at the end of the context is finished by the next API Call, and the majority of its range can change hands. That is the frontier advancing, not a re-flow.
- The grid always spans the whole Context Window, empty Cells included, so two Sessions on the same window are visually comparable and headroom stays legible.
- Column count follows the width of the grid pane while Cells keep their physical size, so a wider window gives a shorter block and the pane scrolls when the block outgrows it. Cell size is a constant the reader can trust across Sessions.
- Validated in the UI prototype on branch `wyattjoh/ui-prototype` (see `src/prototype/README.md` there).
