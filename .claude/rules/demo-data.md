---
description: How the bundled Demo Sessions are wired, regenerated, and gated against private content
paths:
  - "public/demo/**"
  - "src/demo/**"
  - "scripts/demo-data.test.ts"
alwaysApply: false
---

# Demo mode is data, not a mock

A reviewer opens the deployed prototype with no install and no transcript of their own, so
the Demo Sessions are the product. They are real data, not a fixture path.

`public/demo/manifest.json` (`note`, `defaultSessionId`, `sessions[]` of
`id`/`file`/`name`/`description`/`bytes`/`calls`/`model`/`claudeCodeVersion`) is decoded by
`src/demo/manifest.ts` and fetched by `src/demo/load-demo-sessions.ts`, which wraps each
`.jsonl` in a `File` and sends it through the **same Worker client the drop path uses**.
Never add a demo-only parse path — a demo that parses differently from a dropped file
stops being evidence that the real thing works.

The manifest's `note` is the app's own statement that the Demo Sessions are synthetic, and
it is rendered under the grid: regenerating the data can change what the app says about
itself.

## Regenerating a Demo Session

```sh
bun run anonymize <real.jsonl> public/demo/<size>.jsonl --seed tviz-demo-<size> --force
```

The seed is `tviz-demo-<size>`, not the default. Then update the manifest numbers until
`scripts/demo-data.test.ts` passes.

A source Session is recoverable from the Demo Session itself: the Anonymizer keeps
`sessionId`, so line 1's `sessionId` is the source's file name in the corpus. Regenerating
never changes `bytes`, because every replacement preserves string length exactly.

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
