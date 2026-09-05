import history from "./releases.json"

export type Release = {
  version: string
  title: string
  summary: string
  commit?: string
}

/** Generated after merges by the release workflow. See docs/releases.md. */
export const CHANGELOG: Release[] = history.releases

/** Shared by the landing page, game HUD, and changelog. */
export const CURRENT_VERSION = `Alpha v${CHANGELOG[0].version}`
