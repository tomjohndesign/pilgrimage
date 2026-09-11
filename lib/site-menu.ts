export interface SiteMenuItem {
  label: string
  description: string
  href: string
  /** Sub-pages listed underneath the entry, in every menu that renders it. */
  children?: SiteMenuItem[]
}

/** Top-level navigation, shared by the landing page and the in-game menu. */
export const SITE_MENU: SiteMenuItem[] = [
  { label: "Play", description: "Enter the prototype", href: "/play" },
  { label: "Docs", description: "Game design document", href: "/docs", children: [{ label: "Game specs", description: "Implemented rules and defaults", href: "/docs/game-specs" }] },
  { label: "Game tuning", description: "Adjust economy and shrine progression", href: "/tuning" },
  {
    label: "Assets",
    description: "Everything the game is drawn with",
    href: "/assets",
    children: [
      { label: "Textures", description: "Every texture, in place", href: "/assets/textures" },
      { label: "Playground", description: "Characters, animals & buildings", href: "/assets/characters" },
      { label: "Path playgrounds", description: "Traffic, regrowth & settlement paths", href: "/assets/paths" },
      { label: "Map playground", description: "Compare meadows, groves & connected clearings", href: "/assets/maps" },
      { label: "Placement playground", description: "Level hillsides under new buildings", href: "/assets/placement" },
      { label: "Pixel workshop", description: "Compare rendering methods in motion", href: "/assets/rendering" },
    ],
  },
  { label: "Changelog", description: "What changed, release by release", href: "/changelog" },
]
