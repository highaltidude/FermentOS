# scripts

Repo-maintenance scripts that don't belong to any single workspace package.

## `post-merge.sh`

Runs `pnpm install --frozen-lockfile` followed by `pnpm --filter db push` —
picks up new dependencies and applies any schema changes after pulling new
commits. It's written as a git `post-merge` hook: to have it run
automatically after every `git pull`/merge, symlink or copy it into
`.git/hooks/post-merge` (and `chmod +x`) in your local checkout. It isn't
installed automatically by anything in this repo.
