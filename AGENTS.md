# AGENTS.md

Local guidance for working in this `simple-bar` checkout.

## Scope

These notes apply to:

- `/Users/seonjunkim/Library/Application Support/Übersicht/widgets/simple-bar`

## Remotes

- `origin`: `https://github.com/seonjunn/simple-bar.git`
- `upstream`: `https://github.com/Jean-Tinland/simple-bar`

When preparing upstream contributions, prefer basing work on the latest `upstream/master`.

## Local vs Upstream

- Keep local machine-specific glue separate from upstreamable fixes.
- Small general fixes should be isolated into clean branches and worktrees before opening PRs.
- Do not mix local AeroSpace machine config changes with upstream `simple-bar` changes.

Current upstream PR created from this checkout:

- <https://github.com/Jean-Tinland/simple-bar/pull/509>

## Local Notes

Use `LOCAL_NOTES.md` to record:

- current local patches
- upstream PR status
- debugging history
- anything likely to matter when revisiting this checkout later

## Validation

Before opening or updating an upstream PR, follow repository guidance:

- install dependencies if needed
- run `npm run lint -- <changed-file>` at minimum
- keep PR descriptions compact but include problem, fix, and tradeoff

## Editing Caution

- This checkout may contain local uncommitted changes that are not intended for upstream.
- Review `git status` before editing.
- Avoid reverting local user changes unless explicitly requested.
