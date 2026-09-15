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
  {
    label: "Playground",
    description: "Assets, game tuning & debugging",
    href: "/assets",
  },
  { label: "Changelog", description: "What changed, release by release", href: "/changelog" },
]
