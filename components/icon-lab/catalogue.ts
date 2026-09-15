import { ILLUSTRATED_ICONS, type IllustratedIcon } from "@/lib/game/resource-icons/design"
import { UI_ICONS, SVG_ICONS } from "./ui-icon-inventory"

export const ICON_CATALOGUE = [
  ...ILLUSTRATED_ICONS.map(icon => ({ ...icon, kind: "illustrated" as const })),
  ...UI_ICONS.map(icon => ({ ...icon, kind: "ui" as const, group: "UI symbols", subject: "Current outline icon" })),
  ...SVG_ICONS.map(icon => ({ ...icon, kind: "artwork" as const, group: "App artwork", subject: "Existing app artwork" })),
]
export type CatalogueIcon = typeof ICON_CATALOGUE[number]
export const ICON_REPLACEMENTS: Partial<Record<string, IllustratedIcon>> = {
  "ui-Coins": "gold", "ui-Users": "population", "ui-House": "build", "ui-Map": "map", "ui-MapPlus": "new-map",
  "ui-Footprints": "visits", "ui-Sparkles": "renown", "ui-Music2": "music", "ui-Play": "play", "ui-Pause": "pause",
  "svg-timber": "wood", "svg-cross": "faith",
}
