---
name: tanstack-table
description: Build React data tables with TanStack Table. Use for columns, row models, sorting, filtering, pagination, row selection, controlled table state, or Table version migrations.
---

# TanStack Table

## Load version-matched guidance

1. Find the app workspace and inspect its `package.json` and installed `@tanstack/react-table` major version. Table v8 and v9 have different setup and state APIs; choose guidance for the installed major.
2. From the workspace root, run `npx --no-install @tanstack/intent list`. If listed, load `@tanstack/table-core#core`, then `@tanstack/react-table#getting-started` with `npx --no-install @tanstack/intent load <package>#<skill>`. For controlled state, also load `@tanstack/react-table#table-state`. Follow task-specific references for features or migrations.
3. If the installed version has no skills, use the official [Table docs](https://tanstack.com/table/latest/docs/introduction), selecting the installed major in the version switcher. Use a matching source checkout or release tag to resolve API uncertainty.

## Project scope

- Use the React adapter. Install dependencies only as part of an app implementation task, using Bun and the root catalog convention.
- For URL-driven sorting, filtering, or pagination, also load `tanstack-router`; treat validated search params as the source of truth for URL-owned state.
- Choose client-side or server-side data processing explicitly before wiring sorting, filtering, and pagination.
