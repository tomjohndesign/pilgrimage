# Deployments

This repo deploys to Vercel project `v0-pilgrimage` (scope: `tomjohns-projects`).

## Current state: PR previews are not firing

The Vercel GitHub integration deployed this repo in April 2026 — production
builds from `main` and one preview for the v0-authored PR #1, all successful.
It is **not** deploying now.

Evidence, from PR #2 (branch `tomjohndesign/vercel-pr-previews`):

- No deployment record on the branch after ~10 minutes
  (`GET /repos/tomjohndesign/pilgrimage/deployments?ref=…` returns empty)
- No `Vercel` or `Vercel Preview Comments` check on the head commit
- No comment from the Vercel bot

PR #1 got both checks and a working preview URL, so the wiring existed and
has since stopped. The likely causes, in order:

1. The Vercel GitHub App lost access to this repo
   (GitHub → Settings → Applications → Vercel → Repository access)
2. The project was disconnected from Git
   (Vercel → `v0-pilgrimage` → Settings → Git)
3. A branch filter or Ignored Build Step is skipping non-`v0/*` branches
   (same Git settings page)

Reconnecting the repo under Settings → Git is enough to restore previews;
Vercel deploys every branch by default and needs no `vercel.json` or
workflow file.

## Once it's working

Open a PR against `main`. The Vercel bot comments with a preview URL when
the build finishes, and each new commit redeploys and updates that comment.
Pushes to `main` go to production.

The repo is private, so preview URLs sit behind Vercel Authentication —
only `tomjohns-projects` members can open them. To share a link outside the
team, turn off Deployment Protection or mint a Protection Bypass token under
**Project → Settings → Deployment Protection**.

## Adding the app and marketing site

The game design doc is currently the Next.js app at the repo root, and the
Vercel project's Root Directory points there. A second and third surface
means a monorepo layout, e.g.:

```
apps/doc/         # game design doc (currently the repo root)
apps/app/
apps/marketing/
```

That move needs two coordinated steps, or deploys break:

1. Restructure the repo and add a workspace config (`pnpm-workspace.yaml`).
2. Point the existing Vercel project's **Root Directory** at `apps/doc`, then
   create one Vercel project per remaining app in the same scope, each
   pointing at this repo with its own Root Directory.

Each project gets its own domains and its own preview URL per PR. Set each
one's **Ignored Build Step** to skip builds when its directory is untouched,
so a marketing-copy PR doesn't rebuild all three.
