# alchemy.run for Alchemist's Cloudflare resources

## Bottom line

- Alchemy has implementations for the requested Cloudflare resources: a Worker with static assets and API handlers, public R2 delivery, D1, Hyperdrive, secrets, stages, and custom domains. This establishes resource coverage; it does not establish that Alchemist's complete deployment has been tested. [Worker][worker], [R2 source][r2-source], [D1][d1], [Hyperdrive source][hyperdrive-source]
- The Effect-native variant is now the main Alchemy v2 project: the former `alchemy-run/alchemy-effect` URL redirects to `alchemy-run/alchemy`. npm currently publishes `alchemy` and `@alchemy.run/cloudflare` at `2.0.0-beta.84`, with Effect peer range `^4.0.5`, which includes Alchemist's `4.0.6`. It remains explicitly beta, with breaking changes in the latest release. [Repository][repo], [npm core][npm-core], [npm Cloudflare][npm-cf], [release][release]
- The single-Worker requirement is supported by `Worker` with `main` plus `assets`. A plain React `Website.Vite` resource produces an assets-only Worker; following its separate frontend/backend tutorial literally would produce two Workers. SPA fallback must give API/RPC and OAuth paths priority. [Worker][worker], [Vite][vite], [Cloudflare SPA routing][cf-spa]
- R2 public custom domains provide the production public-read mechanism; `r2.dev` is rate-limited and intended for development. Alchemy exposes bucket domains and CORS configuration. Stable exported image URLs still depend on retaining the hostname, bucket, and object keys. [R2 source][r2-source], [Cloudflare public buckets][cf-public]
- Local D1/R2 emulation and remote state are available, but state is additional infrastructure: the Cloudflare backend uses a Worker, Durable Object, and Secrets Store. Hyperdrive local development connects to a database directly. Documentation contains inconsistencies, so version-pinned source matters. [Local development][local], [state][state], [Hyperdrive binding source][hyperdrive-binding]

## Scope and evidence

Research for [issue #4](https://github.com/mgramigna/alchemist/issues/4), checked **2026-10-25**. npm registry metadata was read with `npm view alchemy` and `npm view @alchemy.run/cloudflare`; GitHub repository and release metadata were read through `gh api`. The published release is `v2.0.0-beta.84`, released **2026-10-24**, commit `5be1df35aaecda8d072264b5ddf51b963635447b`. Source links below pin that tag. Live docs were cross-checked with the repository at `93c674305ddaa391377118a8340a11cc5af4cf83`. No Cloudflare resources were provisioned and no application spike was run. [Release][release], [source snapshot][snapshot]

## One Worker: React SPA assets plus Effect RPC and OAuth routes

`Cloudflare.Worker` accepts a script entry through `main` and an asset directory through `assets.directory`. Assets can use `notFoundHandling: "single-page-application"`; `runWorkerFirst` accepts path patterns, allowing the API/RPC and OAuth endpoints to run before the SPA fallback. This meets the structural requirement without SSR or Cloudflare Pages. An implementation shape is: build the React SPA with Node, point `assets.directory` at its output, and deploy the API entrypoint on the same Worker. This is a composition of documented capabilities, not a tested Alchemist configuration. [Worker][worker], [Worker source][worker-source], [Cloudflare SPA routing][cf-spa]

For example, the asset configuration could contain `runWorkerFirst: ["/api/*", "/rpc", "/rpc/*", "/auth/*"]`, adjusted to the eventual route scheme. API handlers must return their own errors rather than falling back to `index.html`. Cloudflare documents why SPA navigation requests otherwise bypass Worker logic. [Cloudflare SPA routing][cf-spa]

The plain `Website.Vite` helper loads Vite and uploads its client output. Unless the build emits a server bundle, it creates an assets-only Worker and has no `main` entrypoint prop. Its SPA walkthrough shows a separate API Worker. For the standing one-Worker architecture, the lower-level Worker plus a separately built asset directory is the directly documented route. The Vite helper also supplies its own Cloudflare Vite integration and documents incompatibility with `@cloudflare/vite-plugin`. [Vite][vite], [SPA walkthrough][spa-guide]

Alchemy's Worker can run an Effect constructor and Effect HTTP handlers, or deploy a conventional async module with explicit `env` bindings and `InferEnv`. Its `RpcWorker` implementation explicitly describes wrapping `RpcServer.toHttpEffect(schema)` in a Worker `fetch` handler. Thus native Effect RPC has a supported integration surface; an ordinary Worker also leaves room for OAuth and other routes. Effect Atom remains browser application state and needs no distinct Cloudflare provisioning resource. The latter is an architectural inference, not a separately verified Atom integration. [Worker][worker], [RPC source][rpc-source]

## R2: public icons and stable exported URLs

`Cloudflare.R2.Bucket` provisions a bucket and exposes `domains`, `publicAccess`, and `cors`. Custom domain entries can be as small as `{ name: "icons.example.com" }`. `publicAccess: true` enables the managed `r2.dev` endpoint; it is independent of custom domains. A Worker can separately receive a read/write binding for authenticated upload and deletion handlers. Public object reads do not require exposing write credentials. [R2 source][r2-source], [R2 guide][r2]

Cloudflare requires the custom domain's zone to be in the bucket's account. Public buckets are private until enabled; custom domains permit caching, whereas the managed development endpoint has restrictions. Public access does not list a bucket's contents at its root. [Cloudflare public buckets][cf-public]

For Alchemist, an exported `image` could therefore be `https://icons.example.com/<object-key>`, with no expiring signature or Google login on the read path. Longevity is an application/lifecycle property: replacing keys, destroying the bucket, or disconnecting the domain can invalidate previously exported scripts. Alchemy supports `RemovalPolicy.retain()`; non-empty R2 deletion normally fails unless forced. These are relevant controls, not a guarantee of URL permanence or backups. [R2 guide][r2], [R2 source][r2-source]

CORS is separate from public access. Cloudflare documents CORS rules for browser JavaScript fetching bucket objects. Whether BOTC needs a particular rule depends on how it consumes images; this research did not inspect its image-fetch/render implementation. Likewise, Alchemist's PNG export may impose cross-origin canvas requirements. Alchemy can configure the bucket policy, but the necessary origins/headers remain unconfirmed. [Cloudflare CORS][cf-cors], [R2 source][r2-source]

## D1 and/or Hyperdrive

`Cloudflare.D1.Database` creates D1 and supports a `migrations` directory. Alchemy applies ordered SQL migrations and tracks them in `__alchemy_migrations`. A Worker can use `D1.QueryDatabase` with `QueryDatabaseBinding`, or receive the native binding through its `env`. [D1 guide][d1]

There is a concrete Effect SQL adapter: `@alchemy.run/cloudflare/D1/SQL` wraps `@effect/sql-d1`, exposing a generic `SqlClient` layer. Its client is lazy and scoped to an execution. D1's driver does not provide session transactions or streaming queries; atomic multi-statement writes use the native batch API. Provisioning support therefore does not settle the application's SQL semantics or database choice. [SQL adapter source][d1-sql-source], [Effect SQL D1 guide][d1-sql]

`Cloudflare.Hyperdrive.Connection` provisions a connection configuration with database origin, credentials, caching, and optional development origin; `ConnectBinding` creates the Worker `hyperdrive` binding and exposes connection information. Hyperdrive accelerates an external PostgreSQL/MySQL database; it does not itself create that database. An existing database or an additional provider resource is still necessary. [Hyperdrive source][hyperdrive-source], [binding source][hyperdrive-binding], [Cloudflare Hyperdrive][cf-hyperdrive]

Alchemy documents PostgreSQL/MySQL Effect SQL integrations above Hyperdrive. Actual driver selection, migration execution, connection lifecycle, and any `nodejs_compat` requirement must match the eventual SQL client; this investigation did not validate an Alchemist database implementation. [Hyperdrive guide][hyperdrive]

## Secrets: Google OAuth and session keys

During an Effect Worker's construction phase, resolving `Config.Redacted("GOOGLE_CLIENT_SECRET")` or a session-key config causes Alchemy to bind it as a Cloudflare `secret_text` value. Config read only inside a request handler is not discovered at deployment. Async Workers can declare Config entries explicitly in `env`. Values can come from deploy-time environment variables or secret-provider configuration. [Secrets guide][secrets]

This covers delivery of an existing OAuth secret or session key to the Worker. It does not create the Google OAuth client, register redirect URIs, implement cookies/sessions, or define rotation behavior. Those remain application and Google configuration work. Never put these values in `VITE_` entries: Vite-prefixed values are inlined into the browser build, including values unwrapped from `Redacted`. [Secrets guide][secrets], [Vite environment behavior][vite]

## Stages, domains, deployment credentials

Stages partition state and generated physical names. Current CLI source resolves an explicit `--stage`, then `ALCHEMY_STAGE`, then `live_$USER` for deployment and `dev_$USER` for local development. Some overview text still says deployment defaults to `dev_$USER`; the pinned CLI source is the more precise evidence. Explicit production/staging names avoid reliance on defaults. Profiles select credentials separately from stages. Manually fixed resource names, shared external databases, and a shared hostname still require deliberate per-stage configuration. [CLI source][stage-source], [stage guide][stages]

A Worker supports `domain: "app.example.com"`, aliases, and `workersDev: false`. The native custom-domain path requires a Cloudflare zone in the account; Alchemy manages DNS and certificate setup. R2 uses its separate bucket-domain configuration. This does not purchase a domain or move registrar nameservers for the project. [Custom domains][domains], [R2 source][r2-source]

The repository's GitHub Action documents deployment using `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`, plus `GITHUB_TOKEN` for GitHub operations. It requires the CLI to be installed first. Account authorization, token permissions for the selected resources, and the actual production workflow remain setup work. [Repository][repo]

## Local development and state storage

The dedicated Cloudflare dev guide describes `alchemy dev` running Workers in workerd, with local R2/D1 simulators, D1 migrations, hot reload, and framework dev servers. Resources without local implementations may still provision cloud resources, and `Alchemy.remote()` opts resources into live operation. Hyperdrive uses a direct database connection, with `dev` origin overrides; Access/VPC origins and looked-up configurations require an accessible development origin when the local binding cannot infer one. [Local guide][local], [Hyperdrive binding source][hyperdrive-binding]

There is a documentation conflict: the SPA walkthrough says backing R2/D1 resources are real cloud resources, while the dedicated guide and local providers describe emulation. R2 and D1 source implement local providers; this supports the emulation description for these resources in this release. Local emulation does not prove deployed permissions, public R2 domains, OAuth redirects, or CDN behavior. [SPA walkthrough][spa-guide], [R2 source][r2-source], [D1 source][d1-source]

State records input properties, output attributes, bindings, and lifecycle status. Local storage lives under `.alchemy/`; `Cloudflare.state()` stores shared state in a Worker backed by a Durable Object with embedded storage and encryption. The bootstrap provisions supporting Secrets Store entries for its bearer token and encryption key. These resources are additional to Alchemist's app Worker, D1, and image bucket. [State guide][state], [state-store implementation][state-source]

The remote backend makes the same deployment state available to developer machines and CI. The docs require bootstrapping ahead of a CI run: with `CI=true`, a missing store fails rather than being created implicitly. State backup/recovery and concurrent same-stage deployment behavior were not independently exercised. Application data backups are a separate concern from IaC state. [State guide][state]

## Maturity and Effect v4 fit

The Effect-native implementation is no longer merely an unconnected experimental fork: the old `alchemy-effect` repository redirects to the current Alchemy project. Legacy async v1 documentation remains at `v1.alchemy.run`; its imports such as `alchemy/cloudflare` and Promise-based resource declarations must not be mixed with current v2 examples. [Repository][repo], [v1 docs][v1]

As checked, npm's `latest` is `2.0.0-beta.84` (`next` for the core package is older, `beta.72`). Both core and Cloudflare packages declare Effect `^4.0.5`; the Cloudflare package requires the same beta version of core. Alchemist's catalog version `4.0.6` satisfies the declared Effect range. That is dependency compatibility evidence, not a successful installation/typecheck of these packages in this repository. [npm core][npm-core], [npm Cloudflare][npm-cf], [published package source][package-source]

The README explicitly warns that v2 is beta and breaking changes should be expected. The latest release splits Cloudflare and other providers into separate packages and changes provider contributions and runtime integration boundaries. Although GitHub's release metadata marks `prerelease: false`, the version and maintainer warning still say beta. The release includes Cloudflare/Hyperdrive/R2 features and fixes, providing evidence of active maintenance, not an SLA or proof of production reliability. [Repository][repo], [release][release]

Node execution is supported: the CLI has a Node shebang and a published-bundle path. Its runtime guard requires Node 22.22.3+, 24.11.1+, 25.1+, or 26+ within the supported release lines. Alchemist's `node >=24` declaration alone permits older Node 24 versions that this guard rejects. Bun can remain the package manager while Node runs app builds and the CLI; no project dependency changes were made for this research. [CLI launcher source][launcher]

The trade-off is concrete: v2 supplies native Effect construction, binding Layers, RPC hooks, and SQL integration, while introducing a beta deployment engine and version-sensitive APIs. An ordinary async Worker deployment offers an alternative boundary around an Effect application. This research establishes the available interfaces; it does not choose between those integration styles or between D1 and external SQL. [Worker][worker], [RPC source][rpc-source], [release][release]

## Unconfirmed

- No complete Alchemist deployment, Effect RPC request, Google OAuth callback, public BOTC icon fetch, or PNG canvas export was executed.
- No independent reliability assessment, state disaster recovery exercise, same-stage concurrency exercise, or account-specific permission/cost check was performed.
- The exact production domains, environment policy, SQL engine, migration ownership, CORS origins, and data retention policy remain project choices. The resource coverage above does not resolve them.

[repo]: https://github.com/alchemy-run/alchemy
[snapshot]: https://github.com/alchemy-run/alchemy/tree/93c674305ddaa391377118a8340a11cc5af4cf83
[release]: https://github.com/alchemy-run/alchemy/releases/tag/v2.0.0-beta.84
[npm-core]: https://www.npmjs.com/package/alchemy/v/2.0.0-beta.84
[npm-cf]: https://www.npmjs.com/package/@alchemy.run/cloudflare/v/2.0.0-beta.84
[package-source]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/cloudflare/package.json
[worker]: https://alchemy.run/cloudflare/compute/workers/
[worker-source]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/cloudflare/src/Workers/Worker.ts
[vite]: https://alchemy.run/cloudflare/frontend/vite/
[spa-guide]: https://alchemy.run/cloudflare/frontend/vite-spa/
[cf-spa]: https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
[rpc-source]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/cloudflare/src/Workers/RpcWorker.ts
[r2]: https://alchemy.run/cloudflare/data/r2/
[r2-source]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/cloudflare/src/R2/Bucket.ts
[cf-public]: https://developers.cloudflare.com/r2/buckets/public-buckets/
[cf-cors]: https://developers.cloudflare.com/r2/buckets/cors/
[d1]: https://alchemy.run/cloudflare/data/d1/
[d1-source]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/cloudflare/src/D1/Database.ts
[d1-sql]: https://alchemy.run/sql/effect-sql/d1/
[d1-sql-source]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/cloudflare/src/D1/SQL.ts
[hyperdrive]: https://alchemy.run/cloudflare/data/hyperdrive/
[hyperdrive-source]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/cloudflare/src/Hyperdrive/Connection.ts
[hyperdrive-binding]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/cloudflare/src/Hyperdrive/ConnectBinding.ts
[cf-hyperdrive]: https://developers.cloudflare.com/hyperdrive/get-started/
[secrets]: https://alchemy.run/environments/secrets/
[stages]: https://alchemy.run/environments/stages/
[stage-source]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/alchemy/src/Cli/commands/flags.ts
[domains]: https://alchemy.run/cloudflare/networking/custom-domains/
[local]: https://alchemy.run/cloudflare/local-development/
[state]: https://alchemy.run/state-store/
[state-source]: https://github.com/alchemy-run/alchemy/tree/v2.0.0-beta.84/packages/cloudflare/src/StateStore
[v1]: https://v1.alchemy.run/
[launcher]: https://github.com/alchemy-run/alchemy/blob/v2.0.0-beta.84/packages/alchemy/bin/cli.js
