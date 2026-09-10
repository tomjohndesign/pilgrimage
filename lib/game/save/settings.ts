import { DEFAULT_SCENE_VISIBILITY, type SceneVisibility } from "../scene-visibility"
import { DEFAULT_ELEVATION, elevationSettings, type ElevationSettings } from "../map/elevation"
import { BASE_CHARACTER_SCALE, DEFAULT_WALK_SPEED, DEFAULT_WALK_STRIDE } from "../base-person/gait"
import { BASE_PERSON } from "../base-person/pose"
import { DEFAULT_MOVEMENT } from "../motion"
import type { CharacterModel } from "../character-assets"
import { DEFAULT_TREE_MODEL, type TreeModel } from "../trees/render-model"
import { DEFAULT_ROAD_LOOK, DEFAULT_ROAD_TIER } from "../map/road"
import { DEFAULT_TRAFFIC } from "../travelers"
import {
  DEFAULT_CLEARING_COUNT,
  DEFAULT_DARK_FOREST_COUNT,
  DEFAULT_FOREST_COVERAGE,
  DEFAULT_GLADE_COUNT,
  DEFAULT_MAP_WIDTH,
  DEFAULT_RELIC_DISTANCE,
  DEFAULT_WATER_COVERAGE,
} from "../map/generate-map"

/**
 * The game's settings fall into two groups with different lifetimes.
 *
 * World settings, together with the seed, decide what land is generated and
 * how many people walk it. They identify a world: change one and the map is
 * regenerated and the settlement starts over. They travel in the URL so a map
 * can be shared, and in the game save so it can be resumed.
 *
 * Display settings only change how that world is drawn or tuned. They are a
 * preference of this browser, kept across new maps and never put in the URL.
 */
export interface WorldSettings {
  /** Internal terrain version, retained when resuming older worlds. */
  generation: number
  elevation: ElevationSettings
  /** Map edge length in tiles; maps are square. */
  size: number
  /** % of the map left as forest after the glades are carved. */
  coverage: number
  /** Number of open grass glades carved out of the forest. */
  glades: number
  /** Number of small forest-floor clearings scattered through the woods. */
  clearings: number
  /** How many ancient groves grow across the woods. */
  darkForests: number
  /** How far off the road the relic's hovel is sited, in tiles. */
  relicDistance: number
  /** Traffic density, in travelers per 128 × 128 tiles. */
  traffic: number
  /** Max % of the map under water (rivers, lakes, ponds). */
  water: number
  /** Forced counts for water bodies; −1 lets the seed roll them. */
  rivers: number
  lakes: number
  ponds: number
}

export interface DisplaySettings extends SceneVisibility {
  /** Walking speed in tiles per second at the reference character size. */
  walkSpeed: number
  characterFps: number
  walkSync: boolean
  stride: number
  paceVariation: number
  pathEase: number
  acceleration: number
  characterModel: CharacterModel
  /** Parametric trees, or the baked pixel foliage sprites from the tree playground. */
  treeModel: TreeModel
  /** Uniform sprite-size multipliers, independently tuned for each model. */
  baseSize: number
  draftSize: number
  /** Road development tier — index into ROAD_TIERS. */
  road: number
  /** Road surface look, 0–1 opacity over the grass. */
  roadOpacity: number
  /** Road surface brightness multiplier. */
  roadShade: number
  /** 0–1 darkness of the line along the road's edge. */
  roadEdgeLine: number
  /** Width of that line in CSS pixels, like the tree and building outlines. */
  roadEdgeWidth: number
}

/** Slider value that means "let the seed decide" for water body counts. */
export const WATER_COUNT_AUTO = -1

export const DEFAULT_WORLD_SETTINGS: WorldSettings = {
  generation: 2,
  elevation: DEFAULT_ELEVATION,
  size: DEFAULT_MAP_WIDTH,
  coverage: Math.round(DEFAULT_FOREST_COVERAGE * 100),
  glades: DEFAULT_GLADE_COUNT,
  clearings: DEFAULT_CLEARING_COUNT,
  darkForests: DEFAULT_DARK_FOREST_COUNT,
  relicDistance: DEFAULT_RELIC_DISTANCE,
  traffic: DEFAULT_TRAFFIC,
  water: Math.round(DEFAULT_WATER_COVERAGE * 100),
  rivers: WATER_COUNT_AUTO,
  lakes: WATER_COUNT_AUTO,
  ponds: WATER_COUNT_AUTO,
}

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  ...DEFAULT_SCENE_VISIBILITY,
  walkSpeed: DEFAULT_WALK_SPEED,
  characterFps: BASE_PERSON.defaultFps,
  walkSync: true,
  stride: DEFAULT_WALK_STRIDE,
  paceVariation: DEFAULT_MOVEMENT.variation,
  pathEase: DEFAULT_MOVEMENT.pathEase,
  acceleration: DEFAULT_MOVEMENT.acceleration,
  characterModel: "base",
  treeModel: DEFAULT_TREE_MODEL,
  baseSize: BASE_CHARACTER_SCALE,
  draftSize: 1,
  road: DEFAULT_ROAD_TIER,
  roadOpacity: DEFAULT_ROAD_LOOK.opacity,
  roadShade: DEFAULT_ROAD_LOOK.shade,
  roadEdgeLine: DEFAULT_ROAD_LOOK.edgeLine,
  roadEdgeWidth: DEFAULT_ROAD_LOOK.edgeWidth,
}

export const WORLD_SETTING_KEYS = Object.keys(DEFAULT_WORLD_SETTINGS) as (keyof WorldSettings)[]
export const DISPLAY_SETTING_KEYS = Object.keys(DEFAULT_DISPLAY_SETTINGS) as (keyof DisplaySettings)[]

export function worldSettingsOf(settings: WorldSettings): WorldSettings {
  return Object.fromEntries(WORLD_SETTING_KEYS.map(key => [key, settings[key]])) as unknown as WorldSettings
}

export function displaySettingsOf(settings: DisplaySettings): DisplaySettings {
  return Object.fromEntries(DISPLAY_SETTING_KEYS.map(key => [key, settings[key]])) as unknown as DisplaySettings
}

/** Two worlds are the same land when every generation input agrees. */
export function sameWorldSettings(a: WorldSettings, b: WorldSettings): boolean {
  for (const key of WORLD_SETTING_KEYS) {
    if (key === "elevation") continue
    if (a[key] !== b[key]) return false
  }
  const ea = elevationSettings(a.elevation), eb = elevationSettings(b.elevation)
  return (Object.keys(ea) as (keyof ElevationSettings)[]).every(key => ea[key] === eb[key])
}
