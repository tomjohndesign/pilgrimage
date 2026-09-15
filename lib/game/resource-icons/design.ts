/** Shared game icon identities; appearance drafts are reviewed in the playground. */
export const RESOURCE_ICONS = [
  { id: "wood", label: "Wood", subject: "Stacked roundwood", count: "240" },
  { id: "food", label: "Food", subject: "Meat on the bone", count: "180" },
  { id: "gold", label: "Gold", subject: "Bright gold coins", count: "96" },
  { id: "population", label: "Population", subject: "Paired portraits", count: "24 / 40" },
  { id: "stone", label: "Stone", subject: "Chunky stone blocks", count: "64" },
  { id: "faith", label: "Faith", subject: "Radiant wooden cross", count: "32" },
] as const
export type ResourceIcon = typeof RESOURCE_ICONS[number]["id"]
export const ACTION_ICONS = [
  { id: "build", label: "Build", subject: "Carpenter’s wooden mallet" },
  { id: "map", label: "Map", subject: "Folded parchment map" },
  { id: "new-map", label: "New map", subject: "Map with a new destination" },
  { id: "visits", label: "Pilgrim visits", subject: "Leather footprints" },
  { id: "renown", label: "Renown", subject: "Golden radiance" },
  { id: "music", label: "Music", subject: "Carved musical notes" },
  { id: "play", label: "Play", subject: "Carved play marker" },
  { id: "pause", label: "Pause", subject: "Paired timber markers" },
] as const
export const ILLUSTRATED_ICONS = [...RESOURCE_ICONS.map(icon => ({ ...icon, group: "Resources" })), ...ACTION_ICONS.map(icon => ({ ...icon, group: "Actions" }))]
export type IllustratedIcon = typeof ILLUSTRATED_ICONS[number]["id"]
export const ICON_SIZES = [16, 24, 32, 48] as const
export type IconSize = typeof ICON_SIZES[number]
export interface IconDesign { view: number; ink: number; glow: number }
export const DEFAULT_ICON_DESIGN: IconDesign = { view: 0, ink: .6, glow: .7 }

export const ICON_THEMES = ["light", "dark"] as const
export type IconTheme = typeof ICON_THEMES[number]
