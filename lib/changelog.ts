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
    version: "0.0.12",
    title: "Wider Horizons",
    summary:
      "The map size slider now climbs to 512 × 512 tiles, twice the old limit on a side, so a world can hold room for rivers, roads, and settlements far beyond the first glade.",
  },
  {
    version: "0.0.11",
    title: "Changelog & Versioning",
    summary:
      "The game now keeps a public record of its own history. Every release gets a version number, a title, and a summary, all reachable from the main menu.",
  },
  {
    version: "0.0.10",
    title: "The Assets Gallery",
    summary:
      "Textures and characters moved under a single Assets menu, each with its own gallery, and peasants joined the cast of figures on the road.",
  },
  {
    version: "0.0.9",
    title: "Softer Ground",
    summary:
      "Forests now fade into grassland at their edges instead of stopping at a hard line, and the ground was flattened for a calmer, more readable landscape.",
  },
  {
    version: "0.0.8",
    title: "A Clearer View",
    summary:
      "Trees settled at one or two per tile for a consistent canopy, zoom gained a per-map limit, and a minimap arrived to keep your bearings.",
  },
  {
    version: "0.0.7",
    title: "Travelers on the Road",
    summary:
      "The road came alive: travelers walk it with needs of their own, stopping at camps and vendors, all keeping time against a proper game clock.",
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
