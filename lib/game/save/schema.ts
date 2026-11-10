import { MONK_JOBS } from "../monk-jobs"
import { z } from "zod"

import { ELEVATION_CONTROLS, elevationSettings } from "../map/elevation"
import { MIN_MAP_SIZE } from "../map/generate-map"
import { MAX_ROAD_TIER } from "../map/road"
import { treeModelForGame } from "../trees/render-model"
import { SIMULATION_SPEEDS } from "../simulation-store"
import { DEFAULT_VIEW_SIZE } from "../render/iso"
import { MAX_TRAFFIC } from "../travelers"
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
export const SAVE_VERSION = 3

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
  generation: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]).default(1).describe("Terrain generator version; older saves retain their original land"),
  seed: uint32.describe("World seed. With the settings below it fully determines the generated land"),
  // Retain larger dimensions when loading worlds saved before map size was fixed.
  size: z.number().int().min(MIN_MAP_SIZE).max(512).describe("Map edge length in tiles; new maps are 128×128"),
  coverage: finite.min(0).max(100).describe("Percent of the map left as forest after glades are carved"),
  glades: count.describe("Open grass glades carved out of the forest"),
  clearings: count.describe("Small forest-floor clearings scattered through the woods"),
  darkForests: count.describe("Ancient groves the road must go around"),
  relicDistance: count.describe("How far off the road the relic's hovel sits, in tiles"),
  traffic: finite.min(0).max(MAX_TRAFFIC).describe("Travelers per 128 × 128 tiles of map"),
  water: finite.min(0).max(100).describe("Maximum percent of the map under water"),
  rivers: z.number().int().min(WATER_COUNT_AUTO).describe("Forced river count, or -1 to let the seed decide"),
  lakes: z.number().int().min(WATER_COUNT_AUTO).describe("Forced lake count, or -1 to let the seed decide"),
  ponds: z.number().int().min(WATER_COUNT_AUTO).describe("Forced pond count, or -1 to let the seed decide"),
  elevation: elevationSettingsSchema,
}).describe("Everything that decides which land is generated. Changing any of these makes a different world")

export const displaySettingsSchema = z.object({
  playerColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  showTrees: z.boolean(),
  showCharacters: z.boolean(),
  showWildlife: z.boolean(),
  showScenery: z.boolean(),
  showGrid: z.boolean(),
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
  layoutSeed: finite.optional().describe("Rolls the interior layout; kept so the rooms come back as built"),
  fireplace: z.boolean().optional().describe("Whether the building has a hearth; absent means the type's seeded choice"),
  supportId: z.string().optional(),
  churchId: z.string().optional(),
  floorHeight: finite.min(0).optional(),
  tavernFlue: z.object({x:finite,z:finite}).optional(),
  hearthZ: finite.optional().describe("Row the hearth sits on"),
})

export const settlementSaveSchema = z.object({
  demolishedBuildings: z.array(z.string()).default([]).describe("Removed buildings and reserved structure IDs"),
  claimedBuildings: z.array(z.string()).describe("Generated roadside buildings that have joined the settlement"),
  resources: resourcesSchema,
  deliveredWood: finite.min(0).describe("Cumulative timber credited from the camps"),
  spentWood: finite.min(0).describe("Cumulative timber spent on construction"),
  shrineAdmission: finite.min(0).describe("Gold asked of each visitor to the relic"),
  collectedAdmission: finite.min(0).describe("Cumulative donations credited"),
  collectedTrade: finite.min(0).describe("Cumulative counter takings credited"),
  paidWages: finite.min(0).default(0).describe("Cumulative wages debited from the treasury"),
  grantedRenown: finite.min(0).default(0).describe("Renown bestowed by cheat codes"),
  church: structureSchema.optional().describe("Purchased upgrade of the founding chapel"),
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
  wageDay: finite.optional().describe("Game day their last wage was paid"),
  employer: z.string().nullable().describe("Building they work at, or null while travelling"),
  jobSlot: count,
  home: z.string().nullable().describe("House they sleep in"),
  deliveryBuilding: z.string().nullable().optional(),
  beggar: z.boolean().optional(),
  goldlessSeconds: finite.optional(),
  carrying: finite.min(0).describe("Timber carried"),
  visits: count.describe("Times they have venerated the relic"),
  visitCooldown: finite,
  lastBreadDay: count.optional().describe("Last game day this person received free bread"),
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
  wagesPaid: finite.min(0).default(0).describe("Cumulative wages handed to the settlement's workers"),
  constructionWood: finite.min(0).describe("Timber already taken from the piles for building"),
  shrineQueueSequence: count,
  admissionSequence: count,
  relic: z.object({ sanctity: finite, spectacle: finite, doubt: finite }).describe("The relic's reputation"),
  felled: z.array(count).describe("Indices of trees that have been cut"),
  treeResources: z.array(z.tuple([count, treeResourceSchema])).describe("Trees with work done on them, by index"),
  foodStores: z.array(z.tuple([z.string(), z.record(z.string(), finite.min(0))])).describe("Stored food by building id"),
  piles: z.array(z.object({ id: z.string(), campId: z.string(), slot: count, wood: finite.min(0) })).describe("Timber stacked at the camps"),
  travelers: z.array(travelerSaveSchema),
  monkJobs: z.record(z.string().regex(/^\d+$/), z.enum(MONK_JOBS)).optional().describe("Assigned jobs by monk id; unassigned brothers help where needed"),
  partyGold: z.array(z.tuple([count, finite.min(0)])).optional()
    .describe("Shared purse baselines by party id; member balances include unreconciled transactions"),
  joinedMonks: z.array(joinedMonkSchema).describe("Friars who joined the brotherhood; they are no longer travelers"),
}).describe("Progress of the living world on top of the settlement")

export const cameraSaveSchema = z.object({
  targetX: finite.describe("Camera focus on the ground plane, world units"),
  targetZ: finite,
  viewIndex: finite.describe("Quarter turns of the isometric view"),
  viewSize: finite.positive().describe("Orthographic frustum height in world units"),
})

/** A speed the HUD no longer offers falls to the nearest it does, rather than failing the load. */
function nearestSimulationSpeed(rate: number): number {
  let best: number = SIMULATION_SPEEDS[0].rate
  for (const speed of SIMULATION_SPEEDS) if (Math.abs(speed.rate - rate) < Math.abs(best - rate)) best = speed.rate
  return best
}

export const playbackSaveSchema = z.object({
  paused: z.boolean(),
  speed: finite.positive().transform(nearestSimulationSpeed).describe("Simulation rate; snapped to a speed the HUD offers"),
})

export const gameSaveSchema = z.object({
  version: z.literal(SAVE_VERSION),
  savedAt: z.string().describe("ISO 8601 time of the save"),
  world: worldSettingsSchema,
  settlement: settlementSaveSchema,
  simulation: simulationSaveSchema,
  camera: cameraSaveSchema,
  playback: playbackSaveSchema,
})

export type ElevationSave = z.output<typeof elevationSettingsSchema>
export type SettlementSave = z.output<typeof settlementSaveSchema>
export type StructureSave = z.output<typeof structureSchema>
export type TravelerSave = z.output<typeof travelerSaveSchema>
export type SimulationSave = z.output<typeof simulationSaveSchema>
export type CameraSave = z.output<typeof cameraSaveSchema>
export type PlaybackSave = z.output<typeof playbackSaveSchema>
export type GameSave = z.output<typeof gameSaveSchema>
/** The seed with its world settings: what identifies one world. */
export type WorldIdentity = z.output<typeof worldSettingsSchema>

function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0]
  return issue ? `${issue.path.join(".") || "save"}: ${issue.message}` : "Invalid save."
}

/**
 * Bring one numeric world input inside the bounds the schema enforces, so a
 * link or an older save can never name a world that cannot be saved. Integer
 * inputs are rounded. Undefined for a key without numeric bounds, or a value
 * that is not a finite number.
 */
export function clampWorldSetting(key: string, value: number): number | undefined {
  const field = (worldSettingsSchema.shape as Record<string, z.ZodTypeAny>)[key]
  if (key === "seed" || !(field instanceof z.ZodNumber) || !Number.isFinite(value)) return undefined
  const bounded = Math.min(field.maxValue ?? Infinity, Math.max(field.minValue ?? -Infinity, value))
  return field.isInt ? Math.round(bounded) : bounded
}

function clampWorld(world: unknown): unknown {
  if (typeof world !== "object" || world === null) return world
  const clamped: Record<string, unknown> = { ...world }
  for (const [key, value] of Object.entries(clamped)) {
    if (typeof value === "number") clamped[key] = clampWorldSetting(key, value) ?? value
  }
  return clamped
}

/** Fallbacks for the optional sections; a resumed world opens with them rather than failing. */
export const DEFAULT_CAMERA_SAVE: CameraSave = { targetX: 0, targetZ: 0, viewIndex: 0, viewSize: DEFAULT_VIEW_SIZE }
export const DEFAULT_PLAYBACK_SAVE: PlaybackSave = { paused: false, speed: 2 }
const DEFAULT_SECTIONS = { camera: DEFAULT_CAMERA_SAVE, playback: DEFAULT_PLAYBACK_SAVE } as const

/**
 * Independent records: one that fails validation is dropped on its own, so a
 * single bad traveler, building or tree never costs the rest of the save.
 * Lists drop the item, keyed maps the key, optional records themselves.
 */
const RECORD_LISTS = [
  ["settlement", "claimedBuildings"], ["settlement", "demolishedBuildings"], ["settlement", "structures"],
  ["simulation", "felled"], ["simulation", "treeResources"], ["simulation", "foodStores"], ["simulation", "piles"],
  ["simulation", "travelers"], ["simulation", "partyGold"], ["simulation", "joinedMonks"],
] as const
const KEYED_RECORDS = [["simulation", "monkJobs"]] as const
const OPTIONAL_RECORDS = [["settlement", "church"]] as const

type Path = readonly (string | number)[]
const startsWith = (path: Path, prefix: Path) => prefix.every((part, index) => path[index] === part)
type Container = Record<string | number, unknown>
function at(root: unknown, path: Path): Container | undefined {
  let value = root
  for (const part of path) value = typeof value === "object" && value !== null ? (value as Container)[part] : undefined
  return typeof value === "object" && value !== null ? value as Container : undefined
}

/**
 * Remove whatever the issues point at, when each lies in a record or an
 * optional section. Returns how many were removed or reset, or null when an
 * issue concerns a field the world cannot do without and the save must fail.
 */
function repairSave(doc: Container, issues: readonly z.ZodIssue[]): number | null {
  const items = new Map<Path, Set<number>>(), keys = new Map<Path, Set<string>>()
  const optional = new Set<Path>(), sections = new Set<keyof typeof DEFAULT_SECTIONS>()
  for (const { path } of issues) {
    const section = path[0]
    if (section === "camera" || section === "playback") { sections.add(section); continue }
    const list = RECORD_LISTS.find(prefix => path.length > prefix.length && startsWith(path, prefix) && typeof path[prefix.length] === "number")
    if (list) { items.set(list, (items.get(list) ?? new Set()).add(path[list.length] as number)); continue }
    const keyed = KEYED_RECORDS.find(prefix => path.length > prefix.length && startsWith(path, prefix))
    if (keyed) { keys.set(keyed, (keys.get(keyed) ?? new Set()).add(String(path[keyed.length]))); continue }
    const record = OPTIONAL_RECORDS.find(prefix => startsWith(path, prefix))
    if (record) { optional.add(record); continue }
    return null
  }
  let repaired = 0
  for (const section of sections) { doc[section] = { ...DEFAULT_SECTIONS[section] }; repaired++ }
  for (const [path, indices] of items) {
    const parent = at(doc, path.slice(0, -1)), list = parent?.[path[path.length - 1]]
    if (!parent || !Array.isArray(list)) return null
    parent[path[path.length - 1]] = list.filter((_, index) => !indices.has(index))
    repaired += indices.size
  }
  for (const [path, names] of keys) {
    const record = at(doc, path)
    if (!record) return null
    for (const name of names) delete record[name]
    repaired += names.size
  }
  for (const path of optional) {
    const parent = at(doc, path.slice(0, -1))
    if (!parent) return null
    delete parent[path[path.length - 1]]
    repaired++
  }
  return repaired
}

export type ParsedGameSave =
  | { save: GameSave; error: null; /** Records dropped and sections reset to defaults while reading. */ dropped: number }
  | { save: null; error: string }

/**
 * Validate a stored document. Older versions migrate here; unknown fields are
 * dropped. The version, seed and world settings must be sound, though world
 * inputs outside their range are clamped. Beyond those, a record that fails
 * is dropped and a broken camera or playback section falls back to defaults,
 * rather than the whole save being rejected.
 */
export function parseGameSave(input: unknown): ParsedGameSave {
  if (typeof input !== "object" || input === null) return { save: null, error: "Save is not an object." }
  const version = (input as { version?: unknown }).version
  if (typeof version !== "number" || version > SAVE_VERSION) return { save: null, error: `Unsupported save version ${String(version)}.` }
  let doc: Container = { ...input, version: version === 1 || version === 2 ? SAVE_VERSION : version, world: clampWorld((input as Container).world) }
  let dropped = 0
  // Each pass reports every issue zod finds; a second only catches what the first exposed.
  for (let pass = 0; pass < 4; pass++) {
    const result = gameSaveSchema.safeParse(doc)
    if (result.success) return { save: result.data, error: null, dropped }
    if (pass === 0) doc = structuredClone(doc)
    const repaired = repairSave(doc, result.error.issues)
    if (!repaired) return { save: null, error: describeIssue(result.error) }
    dropped += repaired
  }
  return { save: null, error: "Save could not be repaired." }
}

function hasNonFinite(value: unknown): boolean {
  if (typeof value === "number") return !Number.isFinite(value)
  if (typeof value !== "object" || value === null) return false
  for (const item of Array.isArray(value) ? value : Object.values(value)) if (hasNonFinite(item)) return true
  return false
}

function zeroNonFinite(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (typeof value !== "object" || value === null) return value
  if (Array.isArray(value)) return value.map(zeroNonFinite)
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, zeroNonFinite(item)]))
}

/**
 * JSON writes NaN and Infinity as null, which no load accepts, so they must
 * never reach storage. Matching what `parseGameSave` would do with them: a
 * record holding one is dropped, a camera or playback section holding one is
 * reset to defaults, and any other number (a total, the coffer) becomes 0.
 * The world settings are left alone: they are bounded where they are set.
 */
export function withoutNonFinite(save: GameSave): GameSave {
  if (!hasNonFinite(save.settlement) && !hasNonFinite(save.simulation) && !hasNonFinite(save.camera) && !hasNonFinite(save.playback)) return save
  const doc = structuredClone(save) as unknown as Container
  for (const section of ["camera", "playback"] as const) if (hasNonFinite(doc[section])) doc[section] = { ...DEFAULT_SECTIONS[section] }
  for (const path of RECORD_LISTS) {
    const parent = at(doc, path.slice(0, -1)), list = parent?.[path[path.length - 1]]
    if (parent && Array.isArray(list)) parent[path[path.length - 1]] = list.filter(item => !hasNonFinite(item))
  }
  for (const path of OPTIONAL_RECORDS) {
    const parent = at(doc, path.slice(0, -1))
    if (parent && hasNonFinite(parent[path[path.length - 1]])) delete parent[path[path.length - 1]]
  }
  doc.settlement = zeroNonFinite(doc.settlement)
  doc.simulation = zeroNonFinite(doc.simulation)
  return doc as unknown as GameSave
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
