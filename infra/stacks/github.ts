import { statSync } from "node:fs";
import * as path from "node:path";
import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

/**
 * Bootstrap stack: mints the Cloudflare credential GitHub Actions needs to
 * deploy `../alchemy.run.ts`, and writes it into the repo as an Actions secret.
 *
 * This is a one-shot stack you run from your laptop under an elevated profile.
 * Creating an account API token requires `API Tokens > Write`, which the
 * everyday deploy credential deliberately does not have — hence
 * `--profile admin` (Cloudflare Global API Key + `gh` CLI for GitHub), from the
 * repository root (not from `infra/` — see below):
 *
 *     bun run bootstrap:ci
 *
 * Re-run it to rotate the token or change its permissions. Cloudflare returns a
 * token's value only once, so Alchemy captures it in state and pipes it
 * straight into `GitHub.Secret` — the raw value never reaches the terminal.
 *
 * State is local (`.alchemy/` at the repository root, gitignored) because this
 * stack only ever runs from a developer machine. The app stack uses the shared
 * remote store so CI and laptop agree on what is deployed — see ADR-0005.
 *
 * Unlike `../alchemy.run.ts`, this stack cannot anchor its own paths: the local
 * state tree is `Alchemy.localState()`'s business and it takes no directory
 * argument — it pins `.alchemy/state` to the process's working directory,
 * captured once at module load. Moving the stacks into `infra/` (ADR-0007)
 * therefore re-rooted this stack's state while the live `tviz-ci` state stayed
 * at the repository root. The guard below restores the invariant the hard way.
 */

const OWNER = "wyattjoh";
const REPOSITORY = "tviz";

/** The main checkout's root, one level above `infra/`, where `.alchemy/` lives. */
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

/**
 * A git worktree's root has `.git` as a *file* pointing at the main checkout;
 * only the main checkout has it as a directory. A worktree gets its own empty
 * `.alchemy/` tree, which is the same hazard as running from `infra/`.
 */
const isMainCheckout = (root: string): boolean => {
  try {
    return statSync(path.join(root, ".git")).isDirectory();
  } catch {
    return false;
  }
};

// Running with any other working directory makes Alchemy read an empty state
// tree, which turns a token *rotation* into a `create`: it either collides on
// the account-unique name `tviz-github-actions` or mints a second token and
// leaves the one CI is using unmanaged and unrotatable. `--yes` means nobody
// would see the plan say "1 to create" first, so fail before Alchemy runs.
if (path.resolve(process.cwd()) !== repoRoot || !isMainCheckout(repoRoot)) {
  throw new Error(
    `stacks/github.ts must run from the main checkout's root (${repoRoot}), not ` +
      `${process.cwd()}. Alchemy's local state — including this stack's existing ` +
      `'tviz-ci' state — is anchored at the working directory, so running it from ` +
      `anywhere else re-mints the CI token instead of rotating it. Use ` +
      `\`bun run bootstrap:ci\` from the repository root of a non-worktree clone.`,
  );
}

export default Alchemy.Stack(
  "tviz-ci",
  {
    providers: Layer.mergeAll(Cloudflare.providers(), GitHub.providers()),
    state: Alchemy.localState(),
  },
  Effect.gen(function* () {
    // The service's value is itself an Effect (credentials are cached and can
    // refresh), so this yields twice: once for the service, once to resolve it.
    const { accountId } = yield* yield* Cloudflare.CloudflareEnvironment;

    const deployToken = yield* Cloudflare.ApiToken.AccountApiToken("DeployToken", {
      name: "tviz-github-actions",
      accountId,
      policies: [
        {
          effect: "allow",
          permissionGroups: [
            // Upload the assets-only Worker and its static assets.
            "Workers Scripts Write",
            // Resolve the account's `*.workers.dev` subdomain and enable it for
            // the Worker.
            "Account Settings Write",
            // `Cloudflare.state()` keeps the state-store bearer token in the
            // account-wide Secrets Store. Reading it back mounts the secret on
            // an ephemeral edge-preview Worker, which needs Write, not Read.
            "Secrets Store Write",
            // Lets `bun alchemy tail` work against a CI-deployed Worker.
            "Workers Tail Read",
          ],
          resources: {
            [`com.cloudflare.api.account.${accountId}`]: "*",
          },
        },
      ],
    });

    yield* GitHub.Secret("CloudflareApiToken", {
      owner: OWNER,
      repository: REPOSITORY,
      name: "CLOUDFLARE_API_TOKEN",
      value: deployToken.value,
    });

    yield* GitHub.Secret("CloudflareAccountId", {
      owner: OWNER,
      repository: REPOSITORY,
      name: "CLOUDFLARE_ACCOUNT_ID",
      value: Redacted.make(accountId),
    });

    return { tokenId: deployToken.tokenId, tokenName: deployToken.name };
  }),
);
