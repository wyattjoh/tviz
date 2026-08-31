# tviz

A browser tool that shows how a Claude Code session's context window is filled, using the same buckets the `/context` command reports.

## Language

### Transcript

**Session**:
One Claude Code conversation, recorded as one JSONL transcript file. May own Subagent Sessions.
_Avoid_: conversation, chat, log

**Subagent Session**:
A session spawned by a parent Session's agent tool; it has its own, separate Context Window.
_Avoid_: sidechain, child transcript

**Record**:
One line of a transcript. Records are messages, attachments, or metadata.
_Avoid_: entry, event, line

**Attachment**:
A Record Claude Code injects into the conversation alongside a user message (skill listing, hook output, nested memory, reminders).
_Avoid_: system reminder (that is how an Attachment is rendered, not what it is)

**API Call**:
One request to the model. Several assistant Records can belong to the same API Call.
_Avoid_: turn, step, round (ambiguous between user turns and model calls)

### Context accounting

**Context Window**:
The maximum number of input tokens the model accepts; the grid's denominator.
_Avoid_: context limit, max tokens

**Context Snapshot**:
The composition of the context by Category as of one API Call.
_Avoid_: state, frame

**Measured Tokens**:
Token counts reported by the API for an API Call; exact.
_Avoid_: actual tokens, real tokens

**Estimated Tokens**:
Token counts derived from text length and scaled so that estimates within an API Call sum to its Measured Tokens.
_Avoid_: approximate tokens, guessed tokens

**Category**:
One `/context` bucket: System, Skills, Custom Agents, Memory Files, MCP, Messages.
_Avoid_: bucket, group, segment

**System**:
The Category holding everything the transcript does not log: the system prompt, built-in tool schemas, and root CLAUDE.md files.
_Avoid_: System prompt (too narrow), overhead, remainder

**Message Kind**:
A sub-division of the Messages Category: User, Assistant, Tool Result, Reminder.
_Avoid_: message type, role

### Visualization

**Workbench**:
The loaded view as a whole, in four regions: the Menu Bar, the Session Strip, a body of grid pane plus right rail, and the Scrubber across the bottom.
_Avoid_: dashboard, console, main view

**Cell**:
One box in the grid, representing a fixed quantum of tokens and coloured by the Category that fills it.
_Avoid_: box, tile, block

**Scrubber**:
The control that selects which API Call's Context Snapshot the grid shows.
_Avoid_: timeline, slider

**Free Cell**:
A Cell nothing has reached: headroom left in the Context Window. Always drawn, so two Sessions on the same window stay comparable.
_Avoid_: empty cell, unused cell

**Hidden Cell**:
A Cell blanked because its Category — or, for a Messages Cell, its Message Kind — is toggled off in the legend. It keeps its position and its tokens and is drawn as an outlined recess, because filtering is a paint decision and never re-flows the grid (ADR-0006). A Hidden Cell is not a Free Cell: the tokens are still there.
_Avoid_: removed cell, filtered-out cell, empty cell

**Colour by Kind**:
The legend switch that repaints Messages Cells with their Message Kind accents instead of the Messages Category accent. Other Categories are unaffected.
_Avoid_: group by kind, kind mode

**Inspector**:
The panel docked in the right rail describing one Cell — what fills it, the token range it covers, and the items reaching into it. Filled by hovering a Cell and held by clicking one (pinning).
_Avoid_: tooltip, popover, details pane

**Session Strip**:
The horizontal band under the Menu Bar naming the Session on screen — file name, id, model, Claude Code version, API Call position, fill level, and the Context Window override.
_Avoid_: header, toolbar, breadcrumb

**Menu Bar**:
The top region of the Workbench, holding the wordmark and the File menu.
_Avoid_: navbar, toolbar

**File menu**:
The only way into the app besides a drop: Open files…, Open folder…, Load demo sessions, the list of open Sessions, and Close all sessions. It is where Sessions are switched, so there is no session sidebar.
_Avoid_: session list, sidebar, session picker

**Cell Share**:
How many of a Cell's tokens one item covers. An item larger than the Cell quantum has a Share in each Cell it crosses, and the Shares of a Cell sum to the Cell — which is what the Inspector lists, rather than the items' own sizes.
_Avoid_: overlap, item tokens

### Data

**Demo Session**:
A bundled Session, produced by the Anonymizer, that lets a reviewer use the tool without supplying data.
_Avoid_: sample, example, fixture (fixtures are for tests)

**Anonymizer**:
The script that turns a real Session into a synthetic one by replacing all free text while preserving Record structure, order, and Measured Tokens.
_Avoid_: scrubber (taken), redactor, sanitizer
