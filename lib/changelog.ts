/**
 * Release history, newest first. Add a new entry (and bump the version) with
 * every release — the landing page shows the latest version, and /changelog
 * renders the full list.
 */
export type Release = {
  version: string
  title: string
  summary: string
}

export const CHANGELOG: Release[] = [
  {
    version: "0.0.7",
    title: "Changelog & Versioning",
    summary:
      "The game now keeps a public record of its own history. Every release gets a version number, a title, and a summary, all reachable from the main menu.",
  },
  {
    version: "0.0.6",
    title: "Music of the Road",
    summary:
      "Looping background music accompanies the prototype, starting from a random point in the track so every visit sounds a little different. A HUD toggle silences it.",
  },
  {
    version: "0.0.5",
    title: "The Dense Forest",
    summary:
      "Forests grew thick and believable: dense tree cover broken by glades, winding trails, and passable clearings, tuned for exploration on foot.",
  },
  {
    version: "0.0.4",
    title: "A Seeded World",
    summary:
      "A full rendering pass over the map, worlds generated from shareable seeds, and site-wide navigation linking the game, docs, and textures together.",
  },
  {
    version: "0.0.3",
    title: "Terrain Takes Shape",
    summary:
      "Seeded map generation arrived with tunable forests, a road crossing the land, and adjustable map sizes.",
  },
  {
    version: "0.0.2",
    title: "First Steps on the Map",
    summary:
      "An isometric camera and map prototype opened at /play — pan, zoom, and rotate across the first tiles of the world.",
  },
  {
    version: "0.0.1",
    title: "The Pilgrimage Begins",
    summary:
      "The founding release: a landing page, the game design document, and the vision for a medieval pilgrimage-site builder.",
  },
]

/** The version currently on the home screen — always the newest release. */
export const CURRENT_VERSION = `Alpha v${CHANGELOG[0].version}`
