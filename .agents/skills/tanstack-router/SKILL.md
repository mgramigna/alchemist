---
name: tanstack-router
description: Build a React SPA with TanStack Router. Use for router setup, route trees, typed navigation, search params, loaders, route context, authentication guards, or route errors.
---

# TanStack Router

## Load version-matched guidance

1. Find the app workspace and inspect its `package.json` and installed TanStack Router version. This project targets a client-side React SPA with `@tanstack/react-router`.
2. From the workspace root, run `npx --no-install @tanstack/intent list` to discover installed package skills. If listed, load `@tanstack/router-core#router-core`, then `@tanstack/react-router#react-router` with `npx --no-install @tanstack/intent load <package>#<skill>`. Follow their task-specific references.
3. If the installed version has no skills, use the official [React Router docs](https://tanstack.com/router/latest/docs/framework/react/overview). Match examples to the installed version; use a matching source checkout or release tag to resolve API uncertainty.

## Project scope

- Use the SPA setup and client-side loaders. TanStack Start and server functions are a separate architecture decision.
- For initial setup, use the official [manual installation guide](https://tanstack.com/router/latest/docs/framework/react/installation/manual). Install dependencies only as part of an app implementation task, using Bun and the root catalog convention.
- For URL-driven table sorting, filtering, or pagination, also load the `tanstack-table` skill.
