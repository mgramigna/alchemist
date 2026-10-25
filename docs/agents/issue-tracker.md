# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `mgramigna/alchemist`.
Use the `gh` CLI with `--repo mgramigna/alchemist` for issue operations;
this works even when no Git remote is configured.

## Conventions

- Create: `gh issue create --repo mgramigna/alchemist --title "..." --body-file <file>`.
  Use a temporary file or heredoc for multiline bodies.
- Read: `gh issue view <number> --repo mgramigna/alchemist --json number,title,body,labels,comments`.
- List: `gh issue list --repo mgramigna/alchemist --state open --json number,title,body,labels`.
  Add label and state filters as needed.
- Comment: `gh issue comment <number> --repo mgramigna/alchemist --body "..."`.
- Apply/remove labels: `gh issue edit <number> --repo mgramigna/alchemist --add-label "..."` / `--remove-label "..."`.
- Close: `gh issue close <number> --repo mgramigna/alchemist --comment "..."`.

When a skill says "publish to the issue tracker", create a GitHub issue.
When a skill says "fetch the relevant ticket", read the GitHub issue.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

- Map: one issue labelled `wayfinder:map`, holding Notes, Decisions-so-far,
  and Fog.
- Child tickets: link to the map using GitHub sub-issues. If unavailable,
  add children to a task list in the map and put `Part of #<map>` in each
  child body. Use `wayfinder:<type>` labels:
  `research`, `prototype`, `grilling`, or `task`.
- Blocking: use native GitHub issue dependencies:
  `gh api --method POST repos/mgramigna/alchemist/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Get the database ID with
  `gh api repos/mgramigna/alchemist/issues/<number> --jq .id`.
  If dependencies are unavailable, put `Blocked by: #<number>` at the top
  of the child body.
- Frontier: among the map's open children, exclude assigned tickets and
  tickets with open blockers; select the first in map order.
- Claim: assign the ticket to `@me` as the session's first write.
- Resolve: comment with the answer, close the ticket, and append a gist
  and link to the map's Decisions-so-far.
