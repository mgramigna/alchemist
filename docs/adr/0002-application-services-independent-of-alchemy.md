# Keep application services independent of Alchemy

Alchemist separates browser-safe domain code, the API application, and the React SPA into `packages/domain`, `packages/api`, and `packages/web`. The placeholder `@alchemist/core` will be removed during implementation. `@alchemist/domain` contains schemas and pure domain functions, including validation, JSON transformations, and derived night priorities; `@alchemist/domain/rpc` is a subpath export of that same package containing browser-safe RPC contracts, rather than a separate workspace package. Shared code imports neither application implementation nor infrastructure code.

Application services inside `packages/api` own workflows and authorization, with dependencies supplied through Effect layers. Thin RPC handlers delegate to these services. Cloudflare-specific persistence and storage code lives in adapters; services can be exercised with controlled dependencies without running Alchemy or deploying a Worker. The web package consumes the domain package and contracts without importing API implementations.

Root `alchemy.run.ts` declares resources, migrations, secrets, SPA assets, and a conventional Worker entrypoint. That entrypoint translates explicit Cloudflare bindings into application layers and composes the HTTP application. Alchemy imports stay in deployment wiring. We choose this separation over embedding business workflows in Alchemy resource declarations so that infrastructure changes remain local and application services remain independently testable. D1 atomic batch constraints and Alchemy-managed migrations from ADR 0001 still apply.

Context: [Repo layout and client/server boundary](https://github.com/mgramigna/alchemist/issues/12).
