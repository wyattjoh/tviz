# tviz — design rationale

## Theme and approach

Theme 1, Exploration & Understanding.

I picked this theme because the thing I most wanted to understand was sitting on my own
disk. A Claude Code session accretes context in a way that is hard to see while it happens:
the system prompt and tool schemas arrive up front, skills and agent listings load on first
use, memory files get pulled in lazily as directories are touched, and every tool result
lands in the window and stays there. Each of those is invisible in the moment, and the sum
of them is what decides when a session starts compacting. `/context` gives a single live
snapshot; it can't show the creep, and it can't show it for a session that is already over.
The transcript records enough to reconstruct it — that was the bet — and once reconstructed,
the creep is obvious in a way no amount of reading the file could make it.

Claude Code transcripts are an unfamiliar artifact. A single session is a 0.5–13 MB JSONL
file with around twenty record types, and the one question every user asks of it — "where
did my context go?" — is only answerable _live_, via `/context`, for the session you are
currently sitting in. Once a session ends, the transcript is the only thing left, and
nothing reads it.

tviz answers that question after the fact: drop a finished transcript in your browser and
see where its context window went, call by call. It draws the same picture `/context`
draws — a grid of fixed-size cells coloured by category — but for every API call in the
session, so you can watch the window fill, see what a compaction cost, and see which
categories were fixed overhead versus which ones grew.

Two constraints shaped everything below: the prototype had to be usable by a reviewer with
no local install and no data of their own, and transcripts are sensitive enough that
sending them anywhere was never an option.

## What is non-obvious

**The `/context` breakdown is not in the transcript.** This is the finding the whole
project turns on. I surveyed about 57,000 records across a hundred of my own sessions with
throwaway analysis scripts, and the categories `/context` reports are simply not stored.
The system prompt, the built-in tool schemas, and the root `CLAUDE.md` are never logged at
all. A naive tool built on this data either silently omits roughly a third of the window
or invents a number for it.

**But two things are exact, and that's enough.** Every `assistant` record carries
`message.usage`, and `input_tokens + cache_read_input_tokens + cache_creation_input_tokens`
is the true total context for that API call. Separately, the parts that _are_ logged —
skills, custom agents, MCP instructions, nested memory files — appear as attachment records
containing their actual injected text. So the unlogged portion is recoverable as a
remainder: measured total, minus everything the transcript accounts for. Across versions it
comes out stable to within about a thousand tokens for a given Claude Code release.

**That remainder is one bucket, not three.** The data cannot distinguish system prompt from
tool schemas from root memory — they arrive as a single opaque difference. tviz shows them
as one combined **System** category and says so in the UI, rather than splitting it on a
heuristic that would look more precise than it is (ADR-0001).

**Character-based estimates undercount code by 1.3–1.5×.** Per-item token sizes have to be
estimated, and characters-over-four is badly wrong for the source code and tool output that
dominate a coding session. Rather than chase a better estimator in the browser, tviz scales
every per-call estimate so the items sum to that call's measured total (ADR-0003). Individual
item sizes stay approximate; the _fill level of the grid is always exact_. That trade — exact
where it's measurable, honestly approximate where it isn't — is the one I'd defend hardest.

**Several records share one API call.** A single call emits multiple `assistant` records
that repeat the same `message.usage`, so per-call aggregation has to dedupe on
`message.id` / `requestId` before summing anything. Missing this inflates the window by a
large multiple, and it is not obvious from reading a handful of records.

## Key decisions and trade-offs

**Browser-only processing.** Transcripts contain your code, your prompts, and your file
paths. There is no server: the deployment is an assets-only Cloudflare Worker serving static
files, parsing happens in a Web Worker in the tab, and nothing is written to `localStorage`
or `IndexedDB`. Close the tab and it's gone. The cost is real — a 13 MB file is parsed on
the user's machine with no caching, which is why parsing is off the main thread (ADR-0002).

**Synthetic demo data.** A reviewer must be able to evaluate this with no data of their own,
and shipping real transcripts is out of the question. `scripts/anonymize.ts` is a
structure-preserving anonymizer: it replaces every string — including object keys, enum-ish
values, and ids — while preserving record structure and the real token counts. The demo
sessions have real growth curves and zero private content, and they load through exactly the
same code path as a dropped file (ADR-0002).

**A fixed-cell grid, not a treemap.** A treemap packs more information per pixel. The grid is
the picture Claude Code users already have in their heads from `/context`, and because cells
are a fixed number of tokens, two sessions and two points in time are directly comparable by
eye. Filtering hides cells in place rather than re-flowing the grid, so toggling a category
doesn't silently rescale everything you were comparing against (ADR-0006). Familiarity and
comparability beat density here.

**Effect v4 for the parser only.** `Schema` gives lenient decoding of a format with ~20
record types where unknown types must be skipped and counted rather than throw, and
`Effect.gen` structures the parse-and-aggregate pipeline. No Layers, no Services: the parser
returns plain data to React (ADR-0004). Paying for the full architecture in a 2–3 hour build
would have bought nothing.

## How I worked with Claude Code

Almost every line of code here was written by Claude Code. The judgment calls were where I
spent my own time, and the transcripts submitted alongside this document show them in
order. The ones that mattered:

**Surveying, not reading.** Real transcripts are megabytes of my own code and prompts. I
never let an agent open one; instead the first hour was throwaway Bun scripts that print key
paths, record types and counts and nothing else. That rule is written into `CLAUDE.md` and
it is why the "breakdown is not in the transcript" finding above exists — you only discover
what a format _doesn't_ contain by counting everything it does.

**Grilling before building.** Before any code, I had Claude interrogate the idea: what
`/context` actually shows, what a transcript can and cannot support, what a reviewer with no
data would see. That produced the spec, a glossary (`CONTEXT.md`) and the first four ADRs.
The one-bucket System decision (ADR-0001) and the scale-to-measured rule (ADR-0003) both
came out of that session, not out of implementation.

**A throwaway prototype that overturned the design.** Once the parser existed, I had three
UI shapes built side by side on a branch with fake data — a terminal-faithful console, an
editorial filmstrip, and a workbench — purely to answer "what should this look like". The
workbench won, but the more important outcome was that stepping through the prototype's
scrubber showed the category-grouped grid _re-flowing_ on every call. That killed the layout
the first implementation ticket had already shipped, became ADR-0006 (append-only cells on
a fixed 1k-token quantum), and turned into a delta ticket rather than a rewrite. The
prototype code was never promoted.

**Tickets, adversarial review, and an integrator.** The spec was cut into nine tickets and
run as a workflow: one agent per ticket in an isolated worktree, a second agent told to
_refute_ the claim that the ticket was done, one repair round, and an integrator merging
into `main` and re-running every check. Both wave-one tickets failed their first review on
real defects — the anonymizer leaked free text through object keys and enum-looking values;
the grid didn't cover the drop path — and were fixed before merging. I read every review
verdict and every integration report; the workflow ran the mechanics, I decided what
counted as done.

**Hard rules as the anchor.** `CLAUDE.md` carries the non-negotiables — transcript data
never leaves the browser, no real transcript content anywhere in the repo, never print the
deploy token into a session log because the session logs are a deliverable. Agents read it
first; reviewers check against it. It was the cheapest way to keep my vision intact across
a dozen agents that never shared a context window.

## With more time

- **Subagent context windows.** `<session>/subagents/agent-*.jsonl` files are entirely
  separate context windows. tviz counts them today; nesting them under the parent session is
  the most obviously missing thing.
- **Item-level drilldown.** Hover currently shows a cell's category and token range. Carrying
  per-item provenance through the worker boundary would let it answer the better question —
  _which_ tool result ate 40k tokens.
- **Small multiples.** A folder of sessions rendered as a wall of grids, to compare how
  differently structured sessions fill up; plus a per-call growth chart.
- **Calibration.** Paste a real `/context` output and solve for the split of the System
  bucket into prompt / tools / memory, turning the honest one-bucket answer into an exact
  three-part one.
- **More than Mocha.** Single theme today.

## Time spent

_TODO_ — first session opened at 03:30 on 2026-08-31. Research and grilling (~1h), then
implementation, deploy, write-up and video; fill in the total from the transcript
timestamps before submitting.
