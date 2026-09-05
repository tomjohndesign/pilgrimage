# Pilgrimage

## Rules

- **Property panels are opt-in development tools.** For a branch that needs the
  World tuning sidebar, set `NEXT_PUBLIC_PROPERTY_PANELS=1` in that workspace's
  gitignored `.env.local` and restart `npm run dev` (or run
  `NEXT_PUBLIC_PROPERTY_PANELS=1 npm run dev`). Leave it unset elsewhere.
  Production builds always omit the sidebar, even with the flag set. Keep player
  controls such as settlement building available without the tuning sidebar.
  Traffic density is the exception: keep its compact control visible in production.

- **Releases and documentation have shared ownership rules.** Follow
  [docs/releases.md](docs/releases.md). The post-merge GitHub Action owns version
  increments and changelog entries; feature workspaces must leave those fields
  alone. Batch game-doc and GitHub documentation reviews about every ten releases
  in one dedicated workspace, using the generated review checklist.

- **Local dev tabs are named after the git branch.** Every locally running dev
  version of this app must set its browser tab title to the current branch name,
  so several Conductor workspaces running side by side stay tellable apart. The
  branch is resolved once at dev-server boot in `next.config.mjs`
  (`NEXT_PUBLIC_GIT_BRANCH`, empty outside `next dev`) and applied as the root
  `metadata.title` in `app/layout.tsx`, where the title template overrides every
  per-page title. Production titles are unchanged. Keep this wired up when
  touching either file or adding new routes with their own metadata.

- **Link Paper frames wherever they are used.** UI work in this repo is
  designed in Paper (https://app.paper.design). Whenever a Paper frame is
  created for a screen or component, include a link to that frame in every
  place the work lands: the PR description, the commit message, and a
  `@see` line in the doc comment of the component it describes. A frame link
  looks like `https://app.paper.design/file/<file-id>/<page-id>`; the game UI
  lives on the "UI" page of the "Creative cloud" file. Agents
  read Paper frames through the Paper MCP server, never by scraping the web
  app, which is client-rendered and needs a login. The server is local to the
  Paper Desktop app (`http://127.0.0.1:29979/mcp`, HTTP transport) and starts
  when a file is open there; register it once with
  `claude mcp add paper --transport http http://127.0.0.1:29979/mcp --scope user`
  or install the `paper-desktop` plugin from the `paper-design/agent-plugins`
  marketplace.
