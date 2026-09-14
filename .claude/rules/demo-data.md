---
description: How the bundled Demo Sessions are wired, regenerated, and gated against private content
paths:
  - "public/demo/**"
  - "src/demo/**"
  - "scripts/demo-data.test.ts"
alwaysApply: false
---

# Demo mode is data, not a mock

Someone opens the deployed prototype with no install and no transcript of their own, so
the Demo Sessions are the product. They are real data, not a fixture path.

`public/demo/manifest.json` (`note`, `defaultSessionId`, `sessions[]` of
`id`/`file`/`name`/`description`/`bytes`/`calls`/`model`/`claudeCodeVersion`) is decoded by
`src/demo/manifest.ts` and fetched by `src/demo/load-demo-sessions.ts`, which wraps each
`.jsonl` in a `File` and sends it through the **same Worker client the drop path uses**.
Never add a demo-only parse path — a demo that parses differently from a dropped file
stops being evidence that the real thing works.

The manifest's `note` is the app's own statement that the Demo Sessions are synthetic, and
it is rendered in the right rail's Transcript panel whenever a Demo Session is on screen:
regenerating the data can change what the app says about itself.

## The landing page fetches one of them on load

`loadPreviewSession(PREVIEW_SESSION_ID)` — `small`, and `small.jsonl` is 110 KB — is fetched
on **every** landing view, before anyone has asked for anything, to fill the blurred
Workbench behind the drop panel. It is the one Demo Session whose bytes are spent
unconditionally, so keep `PREVIEW_SESSION_ID` pointed at the smallest file; switching it to
`medium` is a 7x bandwidth decision, not a cosmetic one.

It goes through the same `fetchManifest`/`loadOne` and so the same Worker client. It reports
nothing: a missing manifest, an unknown id or a parse failure all return `undefined` and the
landing page falls back to a plain drop panel. Only a demo load someone clicked for earns an
alert. The preview is never an open Session — it is not in the loader, not in the file
dropdown, and a dropped transcript replaces it.

## Regenerating a Demo Session

```sh
bun run anonymize <real.jsonl> public/demo/<size>.jsonl --seed tviz-demo-<size> --force
```

The seed is `tviz-demo-<size>`, not the default. Then update the manifest numbers until
`scripts/demo-data.test.ts` passes.

A source Session is recoverable from the Demo Session itself: the Anonymizer keeps
`sessionId`, so line 1's `sessionId` is the source's file name in the corpus. Every
replacement preserves JavaScript string length, but UTF-8 byte size can change when source
text contains non-ASCII characters; update the manifest's `bytes` from the generated file.

## The gate

`scripts/demo-data.test.ts` runs on every `bun run test`. It re-parses the committed files,
checks every manifest number _and every claim the descriptions make_ against them, asserts
their parsed Session ids are distinct (the UI keys on those, not on the manifest ids), and
scans `public/demo/` and `src/fixtures/` two ways: the forbidden-term scan
(`KNOWN_PRIVATE_TERMS`) and `findRealText`, which requires every string the Anonymizer
would have replaced to read as word salad, so prose that names nobody still fails.

**Both scans have a blind spot: neither looks at values the Anonymizer _keeps_.** That is
how 19 real hook names once shipped in these files — `hookName` was allow-listed in
`ENUM_KEYS`, so `findRealText` never examined it and the forbidden-term scan found nothing
private in `FormatOnSave`. When a key is added to an Anonymizer allow-list, assert here
that its committed values are still safe; see
[`synthetic-data.md`](./synthetic-data.md) for how to judge a key.
