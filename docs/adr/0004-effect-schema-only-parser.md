---
status: accepted
---

# Effect v4 beta is used for Schema decoding and a pure pipeline, not for services or layers

The parser uses Effect Schema to decode JSONL records leniently and `Effect.gen`/`Effect.fn` to compose parse and aggregation, returning plain data to React. Services, Layers, and Streams are deliberately not used: the assignment's 2–3h time box does not justify the setup cost on a beta API whose surface still changes between releases, and a single Web Worker with an in-memory string is fast enough for 13 MB files. A future reader should not "complete" the Effect adoption without a concrete need.
