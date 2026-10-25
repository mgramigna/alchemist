# PROTOTYPE: Script editor (#15)

Throwaway. Answers "how should editing a Script and its Custom Characters feel?"
for https://github.com/mgramigna/alchemist/issues/15. Not production code; the
real editor belongs in `packages/web`.

```sh
bun run prototype:script-editor   # from the repo root
```

Opens http://localhost:5199/?variant=A. Flip variants with the floating bar or
the ← / → keys (when no field is focused):

- **A · Workbench**: navigator │ form │ live preview that follows the selection.
- **B · On the sheet**: type directly onto the printed sheet; a drawer holds the
  fields that don't print. Night sheet is edited in place too.
- **C · Ledger**: one dense table, rows expand for long fields; both Night
  Orders docked underneath as draggable horizontal timelines.

All variants share one in-memory Script (edits survive switching). The `{ } state`
button shows validation and the derived export JSON. Reload resets everything.
The sample Script deliberately contains export-blocking problems (duplicate
name, blank ability, blank Jinx) and a missing-instructions nudge.
