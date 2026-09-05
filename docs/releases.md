# Releases and documentation

## Every release

Each new first-parent commit on `main` is one release: a merged PR normally
produces one patch increment. Use squash or merge commits; rebase merges produce
one release per rebased commit. Direct commits also count. The release bot's own
commits do not count. A release here means an integrated change, not confirmation
that a production deployment succeeded.

The **Release** GitHub Action runs after a push to `main`, independently of the
PR merge. It assigns versions in main-history order and reuses the commit/PR
title as the changelog summary. Write a clear, factual title describing the
resulting change. Do not spend tokens inventing release names or descriptions.

The action exclusively owns:

- `lib/releases.json` (version, history, processed-commit cursor, release count).
- `package.json`'s `version` and both root version fields in `package-lock.json`.
- `CHANGELOG.md`; `/changelog`, the landing page, and the HUD use the same history
  through `lib/changelog.ts`.

**Feature PRs must not bump versions or edit generated release history.** Package
and lockfile dependency edits are fine; preserve main's current root versions
when resolving conflicts. Never copy a workspace's older release data over main.
`pnpm-lock.yaml` has no root package version and needs no release edit.

Only one release job runs at a time. Each run fetches current `main` and catches
up on every unprocessed first-parent commit, even if a pending workflow was
replaced. A racing merge rejects the normal push; the job regenerates against
the new main and retries, without force pushes. Re-running after success is a
no-op. Source commit hashes persist alongside each new changelog entry.

## Documentation about every ten releases

Every ten automated releases, the action creates a new checklist at
`docs/release-reviews/NNNN.md`, with those ten changes. This is a review reminder,
not an automatic claim that prose was updated. No model/API calls are involved.

When a checklist is open, use **one documentation workspace and one PR** for
that checkpoint. Search open PRs for `docs: release review NNNN` before starting;
continue the existing review if present instead of opening a competing one.
Check off the tasks and link the review PR in that file. Later releases create
different files and never rewrite completed checklists.

Review and update these together based on the code actually shipped:

- The game design document at `app/docs/page.tsx` and its supporting components.
  Keep implemented behavior distinct from future design. Update the header and
  footer revision/date together when the design changes; this revision is
  independent of the game release number.
- GitHub-facing documentation: `README.md` and relevant `docs/` pages. Do not
  rewrite the repository's About description every release. If it becomes
  inaccurate, include proposed wording in the documentation review.

Ordinary feature work leaves these broad descriptions for the batch review.
Correct broken setup instructions or materially misleading documentation in
the PR that introduces the change; that exception does not justify a full rewrite.

## Operations and migration

The existing public history ends at `0.0.14`; the package and npm lockfile were
aligned to that baseline without inventing another release. Automated counting
starts after commit `64b0397b4049906f46f140bd47fd9c7a9127e111`. The first checkpoint
is ten new releases later (`0.0.24`), including the automation's own merge.

The workflow requires Actions to have `contents: write` and permission to push
to `main`. If branch rules later prohibit bot pushes, configure an approved bot
exception before expecting automation to work. It fails rather than bypassing
protection or force pushing. For a transient failure, rerun **Release**, or use
its **Run workflow** button on main. Do not repair a failed job by bumping a version
in a feature branch. A rewritten main history requires deliberate cursor repair;
the script refuses to guess.

The bot uses `GITHUB_TOKEN`, so its push does not trigger another push workflow
([GitHub documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)).
Any future Actions deployment must explicitly run after the release job if it
needs the newly assigned version. The existing Vercel Git integration is separate;
verify its deployment behavior when enabling this workflow. This workflow updates
repository release records; it does not publish GitHub Release objects or tags.

Run the isolated Git integration tests with `node --test scripts/test-release.mjs`.
