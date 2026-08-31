---
status: accepted
---

# Transcripts are processed only in the browser; all committed data is synthetic

Transcripts contain private code, paths, and conversation content. Parsing happens entirely client-side (Web Worker), nothing is uploaded or persisted, and the deployed Worker is assets-only. The repo, tests, and bundled Demo Sessions never contain real transcript text: Demo Sessions and fixtures come from a structure-preserving Anonymizer that replaces every free-text string (same length, deterministic word salad) and fakes paths and names while keeping record types, order, and Measured Tokens intact. This keeps the demo faithful to real context growth without shipping PII.

## Considered options

- **Parametric generator** producing sessions from parameters. Rejected as the primary source: invented usage numbers make the demo less convincing. Still acceptable for edge-case test fixtures (compaction, unknown record types).
