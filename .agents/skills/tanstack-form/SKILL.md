---
name: tanstack-form
description: Build React forms with TanStack Form. Use for form setup, validation, async validation, field arrays, reusable field composition, submission, or reactive form state.
---

# TanStack Form

## Load version-matched guidance

1. Find the app workspace and inspect its `package.json` and installed `@tanstack/react-form` version.
2. From the workspace root, run `npx --no-install @tanstack/intent list`. If `@tanstack/react-form` or `@tanstack/form-core` exposes relevant skills, load them with `npx --no-install @tanstack/intent load <package>#<skill>` and follow their references. Skill availability depends on the installed release; discover names rather than guessing them.
3. When package skills are unavailable, use the official [React Form docs](https://tanstack.com/form/latest/docs/framework/react/overview), starting with the [quick start](https://tanstack.com/form/latest/docs/framework/react/quick-start). Match examples to the installed version; use a matching source checkout or release tag to resolve API uncertainty.

## Project scope

- Use `@tanstack/react-form` for the React SPA. Install dependencies only as part of an app implementation task, using Bun and the root catalog convention.
- Read the relevant official guides before implementing validation, subscriptions, field arrays, or reusable form composition.
- Handle submissions and dependent field updates through the form APIs and event handlers; derive display values during rendering rather than mirroring form state into React state.
