# Production deployment

Alchemist has local development and one production stage, `prod`. Infrastructure
is managed by the pinned Alchemy version. Do not create app resources manually,
use the CLI's implicit per-user stage, or run `destroy`/`nuke` on production.

## Maintainer prerequisites

- Bun 1.4.3, Node 24.11.1+, authenticated `gh`, and a reviewed checkout.
- An active Cloudflare zone for `alchemist.town`, in the deployment account.
- R2 activated in that account (Cloudflare may require billing activation).
- Hostnames `alchemist.town` and `assets.alchemist.town` available for Worker
  custom domains. Review conflicting DNS/site attachments before a cutover;
  do not delete existing records blindly. Alchemy manages domain attachments,
  DNS and certificates. Mail DNS records are unrelated and should remain intact.
- A Cloudflare API **token**, not the Global API Key. Scope it to this account
  and this zone. Start with account Workers Scripts Edit, Workers R2 Storage
  Edit, D1 Edit, Secrets Store Edit, Account Settings Read; zone Zone Read and
  Workers Routes Edit. State bootstrap also needs Worker/Secrets Store access.
  Permission names may be displayed as Write in API documentation. Verify
  bootstrap with the pinned CLI; report any denied operation rather than granting
  every permission. Do not restrict a CI token to your home IP address.
- An existing Google OAuth **Web application** client. Register exactly
  `https://alchemist.town/auth/google/callback`. Configure the consent screen's
  authorized domain and external audience. In Testing, add your test accounts;
  publish for the intended audience before open sign-up. See [authentication](authentication.md).

## Private configuration

Keep local development `.env` unchanged. Create ignored `.env.production` with
mode `0600`, containing these keys (never commit or paste their values):

```dotenv
CLOUDFLARE_API_TOKEN=<scoped deployment token>
CLOUDFLARE_ACCOUNT_ID=<account ID, not zone ID>
APP_ORIGIN=https://alchemist.town
ASSET_ORIGIN=https://assets.alchemist.town
GOOGLE_CLIENT_ID=<web client ID>
GOOGLE_CLIENT_SECRET=<web client secret>
```

Origins must be HTTPS without ports, paths or trailing slashes. The app hostname
is canonical for authentication and sharing. The asset hostname is a Worker
alias: it serves both bundled versioned generic icons and immutable R2 artwork
at `/artwork/*`. This avoids exporting generic-icon URLs to a bucket that does
not contain them. Both R2 buckets have no public R2 endpoint. Only published
artwork is anonymously served; original artwork is accessed through owner-checked
RPCs. Artwork and generic icons permit anonymous cross-origin reads and immutable
caching. API/auth routes remain Worker-first and reject the asset host as an
application origin.

The app origin supplies the OAuth callback. The asset origin supplies absolute
image URLs in JSON exports. Do not change these after distributing real exports.
The Google client secret is bound as a Worker secret through `Config.Redacted`;
Cloudflare deployment credentials are not application bindings.

Shell environment overrides dotenv files. Before deployment, remove stale
exported configuration or use a clean shell; explicitly load the production file:

```sh
bun --env-file=.env.production alchemy state bootstrap --backend cloudflare --name alchemist
```

This command **writes infrastructure**: it initializes the named remote state
Worker (`alchemy-state-store-alchemist`), Durable Object and Secrets Store
credentials. It is not the application deployment. Bootstrap once locally before
CI. Keep the account, state name `alchemist`, stack name `alchemist`, stage `prod`
and resource IDs `App`, `Scripts`, `ArtworkSources`, `PublishedArtwork` stable.
Back up local Alchemy profile/state credentials securely; never commit `.alchemy/`.

## Verify, plan, deploy

```sh
bun install --frozen-lockfile
bun run check
bun run build
bun --env-file=.env.production alchemy plan --stage prod
```

Tests use the root Vitest command, not `bun test`. The plan does not apply application changes, but Alchemy may initialize
or upgrade its state infrastructure while loading state. Review prompts.

For a first deploy, expect the app Worker, one D1 database, two R2 buckets and
Worker custom-domain attachments. For later deployments, stop on unexpected
persistent-resource creation, deletion or replacement. Retention prevents normal
provider deletion, **not replacement or loss of the resource's state association**.
Do not use adoption to paper over an account/stage/state mismatch.

Deploy only a reviewed, committed revision, with no concurrent Actions deployment:

```sh
bun --env-file=.env.production alchemy deploy --stage prod
git rev-parse HEAD
```

Deploy computes a fresh plan and requests approval; it does not consume a saved,
immutable plan from the preceding command. Record the actual revision and resource
IDs privately, then perform the checks below. Do not claim a deployment succeeded
from the plan alone.

### GitHub Actions promotion

After these workflows are merged to `main`:

1. In repository Settings → Environments, create `production`. Restrict deployment
   branches to `main`; add required reviewers if supported by your GitHub plan.
2. In that environment, set secrets `CLOUDFLARE_API_TOKEN`,
   `CLOUDFLARE_ACCOUNT_ID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
3. Set environment variables `APP_ORIGIN=https://alchemist.town` and
   `ASSET_ORIGIN=https://assets.alchemist.town`.
4. Wait for `Verify` to succeed on the intended main revision. Actions → Deploy
   production → Run workflow → select `main`.
5. Inspect logs and the successful job's deployed-revision summary. Record smoke
   results separately; a successful deployment is not proof of working OAuth.

`Verify` runs checks/build for PRs and main pushes, and rejects modifications or
removals of existing SQL migrations. Protect main with this required check.
Manual promotion requires a successful main-push `Verify` run for the exact SHA,
then re-runs root verification and the production build before
plan/deploy. Deployments in Actions are serialized, not cancelled midway. After
bootstrap, prefer this single deployment channel; its concurrency group cannot
serialize an independent local CLI invocation.

The production environment gate approves the job **before** its plan. Plan output
is informational and deploy uses `--yes`; reviewers are trusting the reviewed main
revision, not approving the displayed plan afterward. For infrastructure changes
needing plan review, perform a supervised local deployment instead, with Actions
idle. Never approve an unexpected resource replacement.

## Migrations and recovery

`infra/database.ts` owns the D1 resource and committed numbered migrations.
Alchemy resolves this resource before deploying its dependent Worker/binding,
applying pending migrations to that resource's database ID, not a manually named
Wrangler database. Fixture imports are enabled only in dev mode. Confirm the
production D1 ID in the deployment and dashboard; it must not be a local emulator
or an independently created database.

Applied migrations are immutable: add the next numbered file rather than editing
an old one. CI protects files already on main. Before each schema promotion,
review the SQL and obtain a database backup/recovery point using Cloudflare D1's
supported backup/Time Travel tools. Test recovery before depending on it.
Retention does not prevent destructive SQL. Use schema changes compatible with the
currently running Worker because migrations can commit before Worker deployment.
A failed deployment does not roll them back. Prefer a forward fix; redeploying an
old Worker is safe only if it supports the new schema. Never recover by deleting
and recreating the database or public-artwork bucket.

For the first promotion, inspect deployment ordering and D1's
`__alchemy_migrations` records. Re-deploy the same revision and confirm no pending
migrations, unchanged database/bucket IDs, and preserved saved data and image URLs.
Source inspection and local tests are not evidence that this happened remotely.

## Deployed smoke checklist

Record date, deployed Git SHA, app/asset origins and results. Do not put credentials,
session cookies, Google codes or private original-image URLs in an issue.

- Open the home page and a nested SPA route; reload the nested route. Confirm
  `/api/rpc` and `/auth/*` are not answered with SPA HTML.
- Sign in with Google. Confirm callback host/path and only `openid profile`
  scopes. Edit your display name, sign out and sign back in; confirm persistence.
  Sign out in one browser profile without signing out another. Inspect cookie
  flags; check denied consent and invalid/replayed callback behavior.
- Create a Script, add valid Characters, upload artwork, save and reload. Open
  the public share link in a separate signed-out browser; confirm read-only access.
  Check a non-owner cannot mutate the Script or read its private originals.
- Export JSON anonymously. Generic icon URLs must use `assets.alchemist.town`;
  uploaded artwork must use that host's `/artwork/<opaque-id>.png` URLs. Open both
  without cookies. Check `Access-Control-Allow-Origin: *`, PNG/SVG content types,
  and immutable caching. Test with an Origin header using curl, not just a tab.
- Download both sheet PNGs anonymously. Load exported JSON in the official BOTC
  app, including a Script with a one-sided Jinx. Record unsupported device checks
  explicitly rather than implying full browser/device coverage.
- Replace/delete uploaded artwork and delete a disposable Script. Its old public
  artwork URL must still return the original image; private originals must not
  become publicly readable.
- Deploy the same revision again. Confirm unchanged D1/R2 IDs, preserved Script
  data, unchanged exported URLs and migration records. Keep this evidence for #36.

Until these checks are recorded, production behavior and repeat-deployment
preservation remain **unverified**, even when local verification passes.
