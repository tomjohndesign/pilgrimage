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
      { label: "Characters", description: "Every calling on the road", href: "/assets/characters" },
    ],
  },
  { label: "Changelog", description: "What changed, release by release", href: "/changelog" },
]
