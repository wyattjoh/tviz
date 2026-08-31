# tviz — design rationale

## Why this theme and approach

Drop a finished Claude Code transcript into your browser and watch its context window
fill up, call by call. tviz draws the same picture `/context` draws — a grid of fixed-size
cells coloured by category — but for every API call in the session, so you can see the
window fill, what a compaction cost, and which categories were fixed overhead versus which
ones grew.

I picked Theme 1, Exploration & Understanding, because the artifact I most wanted to
understand was already on my disk. Context creeps in ways you can't see while it happens,
and `/context` only shows a live snapshot of the session you are sitting in. Once a
session ends, the transcript is all that's left, and nothing reads it.

Two constraints shaped everything: a reviewer had to use it with no install and no data
of their own, and transcripts are private enough that sending them anywhere was never an
option.

## What's non-obvious

**The breakdown `/context` shows is not in the transcript.** I surveyed my own sessions
with scripts that print record shapes, never content, and the categories `/context`
reports are simply not recorded. The system prompt, the built-in tool schemas and the root
memory file are never logged. A naive tool either silently omits a large part of the
window or invents a number for it.

**But the totals are exact, and that is enough.** Every assistant record carries the true
token count for its API call, and the parts that _are_ logged — skills, agents, MCP
instructions, nested memory files — appear with their actual text. So the unlogged part is
recoverable as a remainder: measured total, minus everything the transcript accounts for.
The data can't split that remainder further, so tviz shows it as one **System** bucket and
says so, rather than guessing a split that would look more precise than it is.

**Per-item sizes are estimates, scaled to fit the exact total.** Counting characters
undercounts code badly, and code is most of what a coding session holds. Rather than chase
a better estimator in the browser, tviz scales each call's estimates so the items sum to
that call's measured total. Individual items stay approximate; the fill level of the grid
is always exact. Exact where it's measurable, approximate where it isn't.

## Key decisions and trade-offs

**Everything happens in the browser.** Transcripts contain your code, your prompts and
your file paths. There is no server: the deployment is a static site, parsing happens in a
Web Worker in the tab, and nothing is written to browser storage. Close the tab and it's
gone. The cost is parsing a multi-megabyte file on your machine with no caching, which is
why parsing stays off the main thread.

**Demo data is anonymized, not invented.** A reviewer has to evaluate this with no data of
their own, and shipping real transcripts was out of the question. An anonymizer replaces
every string in a real transcript — keys and ids included — while keeping the structure
and the real token counts, so the demo sessions have real growth curves and zero private
content. The hard part was deciding what to keep verbatim: only values identical for every
user. The first cut allow-listed by shape instead and leaked real names; review caught it
before it shipped.

**A fixed-cell grid, not a treemap.** A treemap packs more into each pixel, but the grid is
the picture Claude Code users already have in their heads, and because every cell is the
same number of tokens, two sessions or two points in time compare directly by eye. Cells
are appended in arrival order rather than grouped by category, and filters hide cells in
place rather than re-flowing, so scrubbing reads as growth at the edge and toggling a
category doesn't rescale what you were comparing against. The cost is that colours
interleave — but a lone skill cell in a field of tool output is exactly the mid-session
load a grouped layout hides.

**A docked inspector, not a tooltip.** Hovering a cell answers "what is actually in
there", and the answer is a list with a token count per item. A tooltip that vanishes when
the pointer moves can't be read down, compared with the next cell, or kept while you
scrub. So the inspector lives beside the grid, and clicking a cell pins it. Message kinds
get the same treatment as categories — hide in place, optionally recolour — because "how
much of this session is tool output" is the question people actually arrive with.

## How I used Claude Code

Almost every line of code was written by Claude Code. My time went on the judgment calls,
and the submitted transcripts show them in order.

**Surveying, not reading.** No agent ever opened a real transcript; the first hour was
throwaway scripts that print record types and counts and nothing else. That rule, with
"nothing leaves the browser" and "no real content in the repo", sits in the project
instructions every agent reads first. It is also why the finding above exists: you only
learn what a format doesn't contain by counting everything it does.

**Grilling before building.** Before any code, I had Claude interrogate the idea: what
`/context` actually shows, what a transcript can and can't support, what a reviewer with
no data would see. The one-bucket System decision and the scale-to-measured rule both came
out of that conversation, not out of implementation.

**A throwaway prototype that overturned the design.** Once the parser existed, I had three
UI shapes built side by side on fake data. Stepping through the prototype's scrubber
showed the category-grouped grid re-flowing on every call. That killed the layout the
first implementation had already shipped and replaced it with the append-only grid above.
The prototype code was never promoted.

## With more time

- **Subagent context windows.** Subagent transcripts are separate windows. tviz counts
  them today; nesting them under the parent session is the most obviously missing thing.
- **Provenance.** Link an item in the inspector back to the API call that added it — the
  next question after "which tool result ate the window".
- **Small multiples.** A folder of sessions as a wall of grids, to compare how differently
  structured sessions fill up.
- **Calibration.** Paste a real `/context` output and solve for the split of the System
  bucket, turning the honest one-bucket answer into an exact three-part one.

## Time spent

About N hours: roughly an hour of research and grilling, then implementation, deploy,
write-up and video.

The decisions above are recorded in more detail in [`docs/adr/`](adr/).
