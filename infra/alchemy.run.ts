import * as path from "node:path";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";

/**
 * Deploys the Vite SPA as an assets-only Cloudflare Worker on `*.workers.dev`.
 *
 * Alchemy runs the app's own Vite build (plugins from its `vite.config.ts`,
 * `vite` resolved from the app's `package.json`) and uploads the client bundle
 * as static assets. There is no server bundle, so no transcript data can ever
 * reach the Worker — the browser does all parsing.
 *
 * This file lives in `infra/`, a package installed separately from the app, so
 * Alchemy's `effect` requirement (`>= 4.0.0-rc.112`) cannot drag the app's
 * pinned `effect@4.0.0-beta.107` forward — see ADR-0007. The consequence is
 * that every path here is anchored to `import.meta.dirname` rather than
 * `process.cwd()`: `rootDir` is the repository root one level up, and `memo`'s
 * globs resolve against that same root.
 *
 * Stage `prod` pins the Worker name to `tviz` for a stable public URL
 * (https://tviz.wyattjoh.workers.dev); every other stage (default `dev_$USER`)
 * gets Alchemy's derived name.
 *
 * State lives in the Cloudflare-hosted state store so the laptop and GitHub
 * Actions deploy against the same state instead of each other's shadow — see
 * ADR-0005. Bootstrap it once per account with `bun alchemy cloudflare
 * bootstrap`. Deploy from `infra/` with `bun alchemy deploy --stage prod
 * --yes`.
 */

/** The app: the repository root, where `index.html` and `vite.config.ts` live. */
const appRoot = path.resolve(import.meta.dirname, "..");

export default Alchemy.Stack(
  "tviz",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const stack = yield* Stack;

    const site = yield* Cloudflare.Website.Vite("Website", {
      name: stack.stage === "prod" ? "tviz" : undefined,
      rootDir: appRoot,
      assets: { notFoundHandling: "single-page-application" },
      // Paths are relative to `rootDir`. `infra/**` is deliberately absent:
      // changing a stack does not change the bundle, so it must not force a
      // rebuild. `lockfile` is the app's `bun.lock`, not this package's.
      memo: {
        include: [
          "src/**",
          "public/**",
          "index.html",
          "vite.config.ts",
          "package.json",
          "tsconfig*.json",
        ],
        lockfile: true,
      },
    });

    return { url: site.url };
  }),
);
