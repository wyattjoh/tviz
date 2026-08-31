import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as GitHub from "alchemy/GitHub";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";

/**
 * Bootstrap stack: mints the Cloudflare credential GitHub Actions needs to
 * deploy `alchemy.run.ts`, and writes it into the repo as an Actions secret.
 *
 * This is a one-shot stack you run from your laptop under an elevated profile.
 * Creating an account API token requires `API Tokens > Write`, which the
 * everyday deploy credential deliberately does not have — hence
 * `--profile admin` (Cloudflare Global API Key + `gh` CLI for GitHub):
 *
 *     bun run bootstrap:ci
 *
 * Re-run it to rotate the token or change its permissions. Cloudflare returns a
 * token's value only once, so Alchemy captures it in state and pipes it
 * straight into `GitHub.Secret` — the raw value never reaches the terminal.
 *
 * State is local (`.alchemy/`, gitignored) because this stack only ever runs
 * from a developer machine. The app stack uses the shared remote store so CI
 * and laptop agree on what is deployed — see ADR-0005.
 */

const OWNER = "wyattjoh";
const REPOSITORY = "tviz";

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
