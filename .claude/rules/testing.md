---
description: Vitest conventions — where tests live, which environment they run in, and where DOM stand-ins come from
paths:
  - "**/*.test.ts"
  - "**/*.test.tsx"
  - "src/fixtures/**"
alwaysApply: false
---

# Tests

**Vitest**, run with `bun run test`. Tests live beside their source as `*.test.ts` /
`*.test.tsx`, covering `src/**` and `scripts/**`.

- Parser and pure-logic tests run in the **default Node environment**. Don't reach for
  jsdom unless the test renders something.
- Component tests opt into jsdom with a `// @vitest-environment jsdom` docblock at the top
  of the file, and use `@testing-library/react`.
- Shared DOM stand-ins (`FileList`, transcript `File`) live in `src/ui/test-dom.ts` — use
  those rather than hand-rolling a second `FileList` shim.

Fixtures are synthetic JSONL builders under `src/fixtures/`, never real transcript
content: see [`synthetic-data.md`](./synthetic-data.md).
