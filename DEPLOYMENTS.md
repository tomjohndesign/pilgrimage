# Deployments

This repo deploys to Vercel via the Vercel GitHub integration.

- **Vercel project:** `v0-pilgrimage` (scope: `tomjohns-projects`)
- **Production:** every push to `main`
- **Preview:** every push to any other branch, with a deployment URL posted to the PR

Two checks run on each PR: `Vercel` (the build/deploy itself) and
`Vercel Preview Comments`. No workflow files or `vercel.json` are needed —
the integration handles both.

## Staging a change

Open a PR against `main`. The Vercel bot comments with the preview URL once
the build finishes. Each new commit on the branch redeploys and updates
that same comment.

The repo is private, so preview URLs are behind Vercel Authentication by
default — only members of the `tomjohns-projects` team can open them. To
share a link with someone outside the team, either turn off Deployment
Protection or generate a Protection Bypass token in
**Project → Settings → Deployment Protection**.

## Adding the app and marketing site

Right now the game design doc is the Next.js app at the repo root, and the
Vercel project's Root Directory points there. Adding a second and third
surface means moving to a monorepo layout, e.g.:

```
apps/doc/         # game design doc (currently the repo root)
apps/app/
apps/marketing/
```

That move needs two coordinated steps, or deploys break:

1. Restructure the repo and add a workspace config (`pnpm-workspace.yaml`).
2. Update the existing Vercel project's **Root Directory** to `apps/doc`,
   then create one Vercel project per remaining app in the same scope,
   each pointing at this repo with its own Root Directory.

Each project gets its own domains and its own preview URL per PR. Set each
one's **Ignored Build Step** to skip builds when its directory is untouched,
so a marketing-copy PR doesn't rebuild all three.
