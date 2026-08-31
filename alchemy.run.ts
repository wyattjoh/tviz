import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import { Stack } from "alchemy/Stack";
import * as Effect from "effect/Effect";

/**
 * Deploys the Vite SPA as an assets-only Cloudflare Worker on `*.workers.dev`.
 *
 * Alchemy runs the project's own Vite build (plugins from `vite.config.ts`) and
 * uploads the client bundle as static assets. There is no server bundle, so no
 * transcript data can ever reach the Worker — the browser does all parsing.
 *
 * Stage `prod` pins the Worker name to `tviz` for a stable public URL; every
 * other stage (default `dev_$USER`) gets Alchemy's derived name.
 *
 * State lives in the Cloudflare-hosted state store so the laptop and GitHub
 * Actions deploy against the same state instead of each other's shadow — see
 * ADR-0005. Bootstrap it once per account with `bun alchemy cloudflare
 * bootstrap`. Deploy with `bun alchemy deploy --yes`.
 */
export default Alchemy.Stack(
  "tviz",
  { providers: Cloudflare.providers(), state: Cloudflare.state() },
  Effect.gen(function* () {
    const stack = yield* Stack;

    const site = yield* Cloudflare.Website.Vite("Website", {
      name: stack.stage === "prod" ? "tviz" : undefined,
      assets: { notFoundHandling: "single-page-application" },
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
