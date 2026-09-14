# tviz — design rationale

## Why this

Drop a finished Claude Code transcript into your browser and watch its context window
fill up, call by call. tviz draws the same picture `/context` draws — a grid of fixed-size
cells coloured by category — but for every API call in the session, so you can see the
window fill, what a compaction cost, and which categories were fixed overhead versus which
ones grew.

I built this because the artifact I most wanted to understand was already on my disk. Context creeps in ways you can't see while it happens,
and `/context` only shows a live snapshot of the session you are sitting in. Once a
session ends, the transcript is all that's left, and nothing reads it.

Two constraints shaped everything: anyone had to be able to use it with no install and no
data of their own, and transcripts are private enough that sending them anywhere was never
an option.

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

**Demo data is anonymized, not invented.** Anyone trying this has no data of
their own, and shipping real transcripts was out of the question. An anonymizer replaces
every string in a real transcript — keys and ids included — while keeping the structure
and the real token counts, so the demo sessions have real growth curves and zero private
content. The hard part was deciding what to keep verbatim: only values identical for every
user. The first cut allow-listed by shape instead and leaked real names; review caught it
before it shipped. The large demo deliberately spends 5.4 MB on the complete arc: growth to
471k, a recorded Compaction, and 102 more API Calls that show the window filling again.

**The landing page is the tool, not a description of it.** A first-time visitor used to get
a dashed box on an empty canvas and had to decide whether the thing was worth a click
before seeing anything it did. Now there is no landing page as such — there's one view in
two states. The app always renders the workbench; with nothing loaded it holds a demo
session, blurred and stepping through its own API calls so the grid visibly fills, under an
opaque drop panel. Drop a transcript anywhere in the window and the panel fades out while
the blur lifts off the session underneath. Because neither layer ever unmounts, that
transition is a fade rather than a blink, and closing the last session runs it backwards.
The preview is the smallest demo session, since unlike the rest of the demo it is fetched
whether or not anyone asked; it's inert and hidden from assistive tech, because scenery
with tab stops in it is a trap; and it stops animating under `prefers-reduced-motion`. The
cost is 110 KB on every first view and a preview thin enough — five API calls — that the
loop reads as a slow pulse rather than a session filling up.

**One compact top bar, not stacked file chrome.** File identity used to occupy a Session
strip below the File menu. That made identity clear, but it permanently took height away
from the visualization. The static details now share the menu bar, with lower-priority
metadata disappearing at narrow breakpoints and the active filename anchored at the right.
That filename opens the only file dropdown: it imports transcripts or folders, loads demos,
switches among open Sessions, and closes them. With no Session selected, the same right-side
control says “File” so demo mode and file import remain reachable. Its trigger and rows grow
to 44px touch targets on phones while desktop keeps the compact treatment. API-call position
stays in the Scrubber. The grid gets the reclaimed row without turning the header into a
second transport.

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
scrub. So the inspector is an expandable section at the bottom of the desktop sidebar and
one of three floating Info Panes on a phone. The settings rail is itself an expandable
Legend section above it and scrolls internally when open, keeping those controls available
without spending the whole window's width on inspection. Every Legend-pane control, each
Info Pane tab, and the Scrubber's
controls use 44px mobile tap targets while the desktop chrome stays compact. The Scrubber
keeps transport on the left, the concise `call x/y` position between the controls, and its
speed choices behind an icon-labelled dropdown on the right. This reduces clutter without
hiding the current position or selected speed. Clicking a cell pins the
Inspector and raises that pane without taking the legend or Context Window controls away;
hovering another cell previews it, then returns to the pinned reading. Message kinds get the same treatment as categories — they hide in
place and always keep their own colours — because "how much of this session is tool output"
is the question people actually arrive with. The Messages row gathers the enabled kinds
into one radial, multicolour swatch and remains the all/none control, so the overview and
the individual filters tell the same story. A second all/none control in the Categories
heading covers every category and kind at once; its icon names the next action rather than
the current state, so one click always has a predictable result.

The decisions above are recorded in more detail in [`docs/adr/`](adr/).
