# Pilgrimage

## Rules

- **Local dev tabs are named after the git branch.** Every locally running dev
  version of this app must set its browser tab title to the current branch name,
  so several Conductor workspaces running side by side stay tellable apart. The
  branch is resolved once at dev-server boot in `next.config.mjs`
  (`NEXT_PUBLIC_GIT_BRANCH`, empty outside `next dev`) and applied as the root
  `metadata.title` in `app/layout.tsx`, where the title template overrides every
  per-page title. Production titles are unchanged. Keep this wired up when
  touching either file or adding new routes with their own metadata.
