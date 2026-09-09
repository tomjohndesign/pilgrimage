import { z } from "zod"

import { ELEVATION_CONTROLS, elevationSettings } from "../map/elevation"
import { MIN_MAP_SIZE } from "../map/generate-map"
import { MAX_MAP_SIZE } from "../map-size-storage"
import { MAX_ROAD_TIER } from "../map/road"
import { treeModelForGame } from "../trees/render-model"
import { SIMULATION_SPEEDS } from "../simulation-store"
import { DEFAULT_DISPLAY_SETTINGS, DEFAULT_WORLD_SETTINGS, WATER_COUNT_AUTO, type DisplaySettings, type WorldSettings } from "./settings"

/**
 * The game save: one plain JSON document describing everything a player has
 * done to a world, from which the running game can be rebuilt.
 *
 * The map itself is never stored. Land is a pure function of the seed and the
 * world settings, so the document keeps those inputs and only the changes made
 * on top: the settlement, the economy, and where everyone is in their lives.
 * That keeps a save small enough for browser storage and, later, for an
 * account, and makes the document readable as a description of the world.
 *
 * Every field carries a description. Together the schemas double as the
 * machine-readable contract for tools that read or edit a world on the
 * player's behalf (a WebMCP surface is planned), so names are stable, values
 * are plain, and nothing here depends on renderer or simulation internals.
 *
 * Bump SAVE_VERSION when the shape changes, and add a migration in
 * `parseGameSave` rather than rejecting older saves.
 */
export const SAVE_VERSION = 1

const finite = z.number().finite()
const count = z.number().int().min(0)
const uint32 = z.number().int().min(0).max(0xffffffff)
const tile = z.number().int()

export const elevationSettingsSchema = z
  .object(Object.fromEntries(Object.entries(ELEVATION_CONTROLS).map(([key, control]) =>
    [key, finite.min(control.min).max(control.max).describe(control.label)])) as
    Record<keyof typeof ELEVATION_CONTROLS, z.ZodNumber>)
  .partial()
  .transform(value => elevationSettings(value))
  .describe("Terrain shaping inputs for the hills, cliffs and bridges")

export const worldSettingsSchema = z.object({
  seed: uint32.describe("World seed. With the settings below it fully determines the generated land"),
  size: z.number().int().min(MIN_MAP_SIZE).max(MAX_MAP_SIZE).describe("Map edge length in tiles; maps are square"),
  coverage: finite.min(0).max(100).describe("Percent of the map left as forest after glades are carved"),
  glades: count.describe("Open grass glades carved out of the forest"),
  clearings: count.describe("Small forest-floor clearings scattered through the woods"),
  darkForests: count.describe("Ancient groves the road must go around"),
  relicDistance: count.describe("How far off the road the relic's hovel sits, in tiles"),
  traffic: finite.min(0).describe("Travelers per 128 × 128 tiles of map"),
  water: finite.min(0).max(100).describe("Maximum percent of the map under water"),
  rivers: z.number().int().min(WATER_COUNT_AUTO).describe("Forced river count, or -1 to let the seed decide"),
  lakes: z.number().int().min(WATER_COUNT_AUTO).describe("Forced lake count, or -1 to let the seed decide"),
  ponds: z.number().int().min(WATER_COUNT_AUTO).describe("Forced pond count, or -1 to let the seed decide"),
  elevation: elevationSettingsSchema,
}).describe("Everything that decides which land is generated. Changing any of these makes a different world")

export const displaySettingsSchema = z.object({
  showTrees: z.boolean(),
  showCharacters: z.boolean(),
  showWildlife: z.boolean(),
  showScenery: z.boolean(),
  buildingVisibility: z.enum(["auto", "interiors", "hidden"]).describe("When building interiors are shown"),
  walkSpeed: finite.positive().describe("Walking speed in tiles per second at the reference character size"),
  characterFps: finite.min(1).max(24).describe("Animation frames per second"),
  walkSync: z.boolean().describe("Drive walk cycles by distance covered rather than by frame rate"),
  stride: finite.min(0.15).max(1.2),
  paceVariation: finite.min(0).max(0.4),
  pathEase: finite.min(0).max(1),
  acceleration: finite.min(0).max(1.5),
  characterModel: z.enum(["base", "callings"]).describe("Shared base person, or the earlier calling-specific sprite sheets"),
  treeModel: z.string().transform(value => treeModelForGame(value)).describe("Baked foliage sprites or parametric trees"),
  baseSize: finite.min(0.5).max(4).describe("Sprite size multiplier for the base person"),
  draftSize: finite.min(0.5).max(4).describe("Sprite size multiplier for the calling sprites"),
  road: z.number().int().min(0).max(MAX_ROAD_TIER).describe("Road development tier"),
  roadOpacity: finite.min(0).max(1),
  roadShade: finite.min(0),
  roadEdgeLine: finite.min(0).max(1),
  roadEdgeWidth: finite.min(0),
}).partial().describe("How the world is drawn and tuned on this device; never part of a world's identity")

export const resourcesSchema = z.object({
  gold: finite.describe("Gold in the settlement's coffer"),
  wood: finite.describe("Timber on hand for building"),
})

export const constructionSchema = z.object({
  work: finite.min(0).describe("Worker-seconds of building done so far"),
  required: finite.positive().describe("Worker-seconds needed to finish"),
  cost: resourcesSchema.optional().describe("What was paid to plan the building"),
})

/** A player-placed structure, as it appears among the map's buildings. */
export const structureSchema = z.object({
  id: z.string().min(1).describe("Stable identifier; other records refer to buildings by it"),
  buildType: z.string().min(1).describe("Catalogue entry the structure was bought from"),
  label: z.string().describe("Display name"),
  x: tile.min(0).describe("West-most tile of the footprint"),
  z: tile.min(0).describe("North-most tile of the footprint"),
  w: tile.min(1).describe("Footprint width in tiles, after rotation"),
  d: tile.min(1).describe("Footprint depth in tiles, after rotation"),
  rotation: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional().describe("Clockwise quarter turns"),
  height: finite.positive().describe("Body height in world units"),
  color: z.string(),
  roofColor: z.string(),
  admissionFee: finite.min(0).optional().describe("Gold asked of each visitor, on the relic enclosure"),
  construction: constructionSchema.optional().describe("Absent once a founding structure is complete"),
})

export const settlementSaveSchema = z.object({
  claimedBuildings: z.array(z.string()).describe("Generated roadside buildings that have joined the settlement"),
  resources: resourcesSchema,
  deliveredWood: finite.min(0).describe("Cumulative timber credited from the camps"),
  spentWood: finite.min(0).describe("Cumulative timber spent on construction"),
  shrineAdmission: finite.min(0).describe("Gold asked of each visitor to the relic"),
  collectedAdmission: finite.min(0).describe("Cumulative donations credited"),
  collectedTrade: finite.min(0).describe("Cumulative counter takings credited"),
  structures: z.array(structureSchema).describe("Player-built structures in purchase order"),
}).describe("The player's settlement layered over the generated map. Ground levelling is replayed from the structures")

const point = z.object({ x: finite, y: finite, z: finite })

export const travelerSaveSchema = z.object({
  id: count.describe("Index into the generated cast for this world"),
  gold: finite,
  piety: finite,
  happiness: finite,
  hunger: finite,
  thirst: finite,
  stamina: finite,
  hoursSinceChurch: finite.optional(),
  jobless: z.boolean().describe("Whether they would take settlement work"),
  employer: z.string().nullable().describe("Building they work at, or null while travelling"),
  jobSlot: count,
  home: z.string().nullable().describe("House they sleep in"),
  deliveryBuilding: z.string().nullable().optional(),
  beggar: z.boolean().optional(),
  goldlessSeconds: finite.optional(),
  carrying: finite.min(0).describe("Timber carried"),
  visits: count.describe("Times they have venerated the relic"),
  visitCooldown: finite,
  admissionPaid: finite,
  fled: count.describe("Times they turned back from trouble"),
  rolls: count.describe("Dice rolled so far; keeps their luck deterministic"),
  cycle: count,
  direction: z.union([z.literal(1), z.literal(-1)]).describe("+1 walks west to east"),
  progress: finite.min(0).describe("Distance along the road in tiles"),
  laneOffset: finite,
  lane: finite,
  position: point.describe("World position. Residents resume here; travelers rejoin the road at `progress`"),
}).describe("One person's lasting state. Errands in progress are dropped and re-planned on load")

export const joinedMonkSchema = z.object({
  travelerId: count.describe("The traveler who took vows"),
  monk: z.object({
    id: count,
    name: z.string(),
    duty: z.string(),
    complexion: z.unknown().optional(),
    attributes: z.object({ age: finite, piety: finite, happiness: finite, skills: z.array(z.string()) }),
    home: z.string().optional(),
    bedSlot: count.optional(),
    arrival: point.extend({ stamina: finite }).optional(),
  }),
})

export const treeResourceSchema = z.object({
  maxHealth: finite, health: finite, wood: finite, remainingWood: finite, size: finite, fellingHours: finite,
  trunkHeight: finite, trunkRadius: finite, trunkTaper: finite, footprintRadius: finite, trunkVolume: finite,
  felledAt: finite.nullable(), stumpUntil: finite.nullable(),
})

export const simulationSaveSchema = z.object({
  time: finite.min(0).describe("Game time in days since founding"),
  treeModel: z.string().transform(value => treeModelForGame(value)).describe("Tree placement model the felled indices refer to"),
  visits: count.describe("Completed relic visits"),
  wood: finite.min(0).describe("Cumulative timber delivered"),
  shrineGold: finite.min(0).describe("Cumulative donations"),
  tradeGold: finite.min(0).describe("Cumulative counter takings"),
  constructionWood: finite.min(0).describe("Timber already taken from the piles for building"),
  shrineQueueSequence: count,
  admissionSequence: count,
  relic: z.object({ sanctity: finite, spectacle: finite, doubt: finite }).describe("The relic's reputation"),
  felled: z.array(count).describe("Indices of trees that have been cut"),
  treeResources: z.array(z.tuple([count, treeResourceSchema])).describe("Trees with work done on them, by index"),
  foodStores: z.array(z.tuple([z.string(), z.record(z.string(), finite.min(0))])).describe("Stored food by building id"),
  piles: z.array(z.object({ id: z.string(), campId: z.string(), slot: count, wood: finite.min(0) })).describe("Timber stacked at the camps"),
  travelers: z.array(travelerSaveSchema),
  joinedMonks: z.array(joinedMonkSchema).describe("Friars who joined the brotherhood; they are no longer travelers"),
}).describe("Progress of the living world on top of the settlement")

export const cameraSaveSchema = z.object({
  targetX: finite.describe("Camera focus on the ground plane, world units"),
  targetZ: finite,
  viewIndex: finite.describe("Quarter turns of the isometric view"),
  viewSize: finite.positive().describe("Orthographic frustum height in world units"),
})

export const playbackSaveSchema = z.object({
  paused: z.boolean(),
  speed: z.number().refine(rate => SIMULATION_SPEEDS.some(speed => speed.rate === rate), "Unknown simulation speed"),
})

const relativePoint = z.object({
  x: finite.describe("East of the camera focus, world units"),
  y: finite.describe("Ground height, world units"),
  z: finite.describe("South of the camera focus, world units"),
})

export const surroundingsSchema = z.object({
  x: tile.describe("Tile under the camera focus"),
  z: tile,
  offsetX: finite.min(-1).max(1).describe("Tile centre minus camera focus, world units"),
  offsetZ: finite.min(-1).max(1),
  radius: z.number().int().min(0).max(16).describe("Patch reaches this many tiles each way"),
  terrain: z.array(z.string().nullable()).describe("Row-major terrain ids over the (2·radius+1)² patch; null outside the map"),
  height: z.array(finite).describe("Terrain height per patch tile, relative to the base, as the map stores it"),
  corners: z.array(finite).describe("Four corner heights per patch tile (NW, NE, SW, SE), for slopes"),
  trees: z.array(relativePoint.extend({
    species: z.string(),
    brightness: finite.optional(),
    oldGrowth: z.boolean().optional(),
    dead: z.boolean().optional(),
  })).describe("Standing trees inside the patch"),
  scenery: z.array(relativePoint.extend({
    kind: z.string(),
    scale: finite,
    yaw: finite,
    brightness: finite,
    seed: finite,
    boulderSize: z.string().optional(),
    cluster: finite.optional(),
  })).describe("Rocks, shrubs and boulders inside the patch"),
}).refine(patch => patch.terrain.length === (2 * patch.radius + 1) ** 2 && patch.height.length === patch.terrain.length
  && patch.corners.length === patch.terrain.length * 4, "Patch size mismatch")
  .describe("A small memory of the land around the camera, drawn with the game's own assets while the world regenerates")

export const gameSaveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  savedAt: z.string().describe("ISO 8601 time of the save"),
  world: worldSettingsSchema,
  settlement: settlementSaveSchema,
  simulation: simulationSaveSchema,
  camera: cameraSaveSchema,
  playback: playbackSaveSchema,
  surroundings: surroundingsSchema.optional(),
})

export type ElevationSave = z.output<typeof elevationSettingsSchema>
export type SettlementSave = z.output<typeof settlementSaveSchema>
export type StructureSave = z.output<typeof structureSchema>
export type TravelerSave = z.output<typeof travelerSaveSchema>
export type SimulationSave = z.output<typeof simulationSaveSchema>
export type CameraSave = z.output<typeof cameraSaveSchema>
export type SurroundingsSave = z.output<typeof surroundingsSchema>
export type PlaybackSave = z.output<typeof playbackSaveSchema>
export type GameSave = z.output<typeof gameSaveSchema>
/** The seed with its world settings: what identifies one world. */
export type WorldIdentity = z.output<typeof worldSettingsSchema>

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue ? `${issue.path.join(".") || "save"}: ${issue.message}` : "Invalid save."
}

/** Validate a stored document. Older versions migrate here; unknown fields are dropped. */
export function parseGameSave(input: unknown): { save: GameSave; error: null } | { save: null; error: string } {
  if (typeof input !== "object" || input === null) return { save: null, error: "Save is not an object." }
  const version = (input as { version?: unknown }).version
  if (typeof version !== "number" || version > SAVE_VERSION) return { save: null, error: `Unsupported save version ${String(version)}.` }
  const result = gameSaveSchema.safeParse(input)
  return result.success ? { save: result.data, error: null } : { save: null, error: describeIssue(result.error) }
}

export function parseWorldIdentity(input: unknown): WorldIdentity | null {
  const result = worldSettingsSchema.safeParse(input)
  return result.success ? result.data : null
}

/** Display settings are forgiving: unknown or invalid fields fall back to defaults one by one. */
export function parseDisplaySettings(input: unknown): Partial<DisplaySettings> {
  if (typeof input !== "object" || input === null) return {}
  const settings: Partial<DisplaySettings> = {}
  for (const key of Object.keys(DEFAULT_DISPLAY_SETTINGS) as (keyof DisplaySettings)[]) {
    const value = (input as Record<string, unknown>)[key]
    if (value === undefined) continue
    const result = displaySettingsSchema.shape[key].safeParse(value)
    if (result.success && result.data !== undefined) (settings as Record<string, unknown>)[key] = result.data
  }
  return settings
}

export function worldIdentity(seed: number, settings: WorldSettings): WorldIdentity {
  return { seed: seed >>> 0, ...Object.fromEntries(Object.keys(DEFAULT_WORLD_SETTINGS).map(key => [key, settings[key as keyof WorldSettings]])) } as WorldIdentity
}
