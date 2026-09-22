import { z } from "zod"
import * as THREE from "three"
import { makeRng } from "./rng"
import { cameraOffset, yawForView } from "./render/iso"
import { sortRailDistance } from "./render/sort-rail"
import { overlapOrder } from "./render/overlap-order"
import { TILE_HEIGHT } from "./map/terrain"
import { cartOffset, PACK_LEAD, DRIVER_SEAT, RIG_TO_WORLD } from "./transport/assets"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"
import { bodySortAnchor } from "./render/body-sort-anchor"

export const EXPERIMENT_STORAGE = "pilgrimage-overlap-experiments-v1"
export const EXPERIMENT_RULE = "body-sort-v2"
export const EXPERIMENT_COLORS = ["#ed5348", "#48a9ff", "#ffce45", "#b985f4", "#36d3ad", "#f58bc4", "#ff963d", "#e9edf5", "#6871f1", "#a8d957", "#bf7857", "#55d7e7"]
export const EXPERIMENT_PEOPLE = ["peasant", "pilgrim", "friar", "nun", "knight", "merchant", "beggar", "minstrel"] as const
export const EXPERIMENT_TRANSPORT = ["donkey", "horse", "ox", "cart", "donkeyCart", "horseCart", "cartDriver", "packDonkey", "packHorse", "hitchedDonkey", "hitchedHorse", "hitchedOx", "packHandler"] as const
export const EXPERIMENT_KINDS = [...EXPERIMENT_TRANSPORT, ...EXPERIMENT_PEOPLE] as const
export const EXPERIMENT_KIND_LABELS: Record<typeof EXPERIMENT_KINDS[number], string> = {
  donkey: "Donkey", horse: "Horse", ox: "Ox", cart: "Hand cart", donkeyCart: "Donkey cart", horseCart: "Horse cart", cartDriver: "Seated cart driver",
  packDonkey: "Pack donkey", packHorse: "Pack horse", hitchedDonkey: "Harnessed donkey", hitchedHorse: "Harnessed horse", hitchedOx: "Harnessed ox", packHandler: "Animal handler",
  peasant: "Peasant", pilgrim: "Pilgrim", friar: "Friar", nun: "Nun", knight: "Knight", merchant: "Merchant", beggar: "Beggar", minstrel: "Minstrel",
}
export const EXPERIMENT_CLIPS = ["idle", "walk", "wearyWalk", "sitting", "praying"] as const
export const TRANSPORT_SCENARIOS = ["convoy", "cartCrossing", "animalCrossing", "opposingCarts", "packTrain", "turningCart"] as const
export const EXPERIMENT_SCENARIOS = {
  convoy: "Cart, driver & animal", cartCrossing: "Walkers crossing a cart", animalCrossing: "Animals crossing a cart",
  opposingCarts: "Opposing carts & teams", packTrain: "Crowded pack animals", turningCart: "Cart turning through a crowd",
  procession: "Dense procession", crossing: "Crossing paths", crowd: "Gathered crowd", coincident: "Coincident anchors", transport: "People & transport",
} as const
export type ExperimentScenario = keyof typeof EXPERIMENT_SCENARIOS
const finite = z.number().finite()
const id = z.string().min(1).max(80)
const assetUrl = z.string().regex(/^\/textures\/[a-zA-Z0-9_/-]+\.png$/).max(240)
// Persist the immutable atlas layout, not just a name whose asset version may change.
export const experimentSpriteSchema = z.object({
  url: assetUrl, depth: assetUrl, columns: finite.int().min(1).max(128), rows: finite.int().min(1).max(128),
  rowOffset: finite.int().min(0).max(120), directions: z.union([z.literal(8), z.literal(16)]),
  start: finite.int().min(0).max(127), frames: finite.int().min(1).max(128),
  center: z.tuple([finite.min(0).max(1), finite.min(0).max(1)]), worldSize: finite.min(.1).max(10),
  railPart: finite.int().min(0).max(15).optional(), railSeat: z.object({ x: finite.min(-4).max(4), y: finite.min(0).max(4).optional(), z: finite.min(-4).max(4) }).optional(),
}).refine(s => s.start + s.frames <= s.columns && s.rowOffset + s.directions <= s.rows, "Sprite frame range exceeds atlas")
export type ExperimentSprite = z.infer<typeof experimentSpriteSchema>
const actorSchema = z.object({
  id, label: z.string().min(1).max(100), kind: z.enum(EXPERIMENT_KINDS), variant: finite.int().min(0).max(5),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/), x: finite.min(-8).max(8), z: finite.min(-8).max(8),
  elevation: finite.min(0).max(3), heading: finite.min(0).max(360), scale: finite.min(.5).max(2),
  clip: z.enum(EXPERIMENT_CLIPS), frame: finite.int().min(0).max(127), sprite: experimentSpriteSchema,
  sortId: finite.int().min(1).max(12).optional(),
}).refine(a => a.frame < a.sprite.frames, "Frame exceeds clip length")
export type ExperimentActor = z.infer<typeof actorSchema>
const connectionSchema = z.object({ kind: z.enum(["cart", "lead"]), source: id, animal: id, driver: id.optional() })
export type ExperimentConnection = z.infer<typeof connectionSchema>
const orderSchema = z.array(id).min(2).max(12)
const pathSchema = z.object({
  width: finite.min(.5).max(4),
  points: z.array(z.tuple([finite.min(-10).max(10), finite.min(-10).max(10)])).min(2).max(16),
})
const caseSchema = z.object({
  id, name: z.string().min(1).max(100), seed: finite.int().min(0).max(0xffffffff),
  scenario: z.enum([...TRANSPORT_SCENARIOS, "procession", "crossing", "crowd", "coincident", "transport"]), view: finite.int().min(0).max(3),
  actors: z.array(actorSchema).min(2).max(12), engineOrder: orderSchema, manualOrder: orderSchema,
  connections: z.array(connectionSchema).max(6).default([]),
  /** World-space centrelines rendered with the game's terrain road shader. */
  paths: z.array(pathSchema).max(4).optional(),
  reviewed: z.boolean(), notes: z.string().max(4000),
}).superRefine((scene, ctx) => {
  const ids = scene.actors.map(a => a.id)
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Duplicate character IDs" })
  for (const connection of scene.connections) {
    if ([connection.source, connection.animal, ...(connection.driver ? [connection.driver] : [])].some(value => !ids.includes(value)))
      ctx.addIssue({ code: "custom", path: ["connections"], message: "Attachment refers to a missing figure" })
    if (connection.kind === "cart" && !connection.driver) ctx.addIssue({ code: "custom", path: ["connections"], message: "Cart team needs a driver" })
  }
  for (const key of ["engineOrder", "manualOrder"] as const) {
    const order = scene[key]
    if (order.length !== ids.length || new Set(order).size !== ids.length || order.some(item => !ids.includes(item)))
      ctx.addIssue({ code: "custom", path: [key], message: "Order must contain every character exactly once" })
  }
})
export type OverlapExperiment = z.infer<typeof caseSchema>
const suiteSchema = z.object({
  format: z.literal("pilgrimage-overlap-experiments"), version: z.literal(1),
  rule: z.string().min(1).max(100), orderConvention: z.literal("back-to-front"),
  tests: z.array(caseSchema).min(1).max(100),
}).superRefine((suite, ctx) => {
  if (new Set(suite.tests.map(t => t.id)).size !== suite.tests.length) ctx.addIssue({ code: "custom", message: "Duplicate test IDs" })
})
export type OverlapExperimentSuite = z.infer<typeof suiteSchema>

export function parseExperiments(json: string): OverlapExperimentSuite {
  if (json.length > 2_000_000) throw new Error("Experiment JSON exceeds 2 MB")
  const parsed = suiteSchema.safeParse(JSON.parse(json))
  if (!parsed.success) throw new Error(parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`).slice(0, 3).join("; "))
  return parsed.data
}
export function experimentJson(suite: OverlapExperimentSuite) { return JSON.stringify(suite, null, 2) }
/** Upgrade only the computed baseline; the user's orders, reviews and geometry remain intact. */
export function refreshExperimentBaseline(suite: OverlapExperimentSuite): OverlapExperimentSuite {
  if (suite.rule === EXPERIMENT_RULE) return suite
  return { ...suite, rule: EXPERIMENT_RULE, tests: suite.tests.map(scene => ({ ...scene, engineOrder: experimentEngineOrder(scene) })) }
}
/** Old exports recorded only the seat's ground offset. Recover its body height
 * with the same rig rule as live transport, preserving the recorded X/Z. */
export function experimentSortAnchor(actor: ExperimentActor) {
  const unit = RIG_TO_WORLD * BASE_CHARACTER_SCALE * actor.scale, seat = actor.sprite.railSeat
  if (actor.kind === "cartDriver") return {
    ...bodySortAnchor(unit, DRIVER_SEAT), ...(seat ? { x: seat.x * actor.scale, z: seat.z * actor.scale,
      ...(seat.y === undefined ? {} : { y: seat.y * actor.scale }) } : {}),
  }
  if (actor.kind === "packHandler" || (EXPERIMENT_PEOPLE as readonly string[]).includes(actor.kind)) return bodySortAnchor(unit)
  return seat ? { x: seat.x * actor.scale, y: (seat.y ?? 0) * actor.scale, z: seat.z * actor.scale } : undefined
}
export function experimentCamera(view: number) {
  const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .1, 400)
  camera.position.set(...cameraOffset(yawForView(view))); camera.lookAt(0, 0, 0); camera.updateMatrixWorld()
  return camera
}
/** Same identity, logical anchor and rail as characterOverlapBounds in the renderer. */
export function experimentEngineOrder(scene: Pick<OverlapExperiment, "view" | "actors">): string[] {
  const camera = experimentCamera(scene.view), world = new THREE.Matrix4()
  return overlapOrder(scene.actors.map((actor, i) => {
    world.makeTranslation(actor.x, TILE_HEIGHT + actor.elevation, actor.z)
    const order = (actor.sortId ?? i + 1) * 16 + (actor.sprite.railPart ?? 0)
    return { order, distance: sortRailDistance(world.elements, camera.matrixWorldInverse.elements, actor.heading * Math.PI / 180, order,
      experimentSortAnchor(actor)) }
  })).map(i => scene.actors[i].id)
}
/** Changing geometry invalidates a review; retain the manual draft for further editing. */
export function reviseExperiment(scene: OverlapExperiment, patch: Partial<OverlapExperiment>): OverlapExperiment {
  const next = { ...scene, ...patch, reviewed: false }
  return { ...next, engineOrder: experimentEngineOrder(next) }
}
export function moveExperimentActor(order: readonly string[], actor: string, delta: number) {
  const from = order.indexOf(actor), to = Math.max(0, Math.min(order.length - 1, from + delta))
  const next = [...order]
  if (from < 0) return next
  next.splice(from, 1); next.splice(to, 0, actor)
  return next
}
/** Keep each complete team together while editing placement, heading or scale. */
export function editExperimentActor(scene: OverlapExperiment, id: string, patch: Partial<ExperimentActor>): OverlapExperiment {
  const actor = scene.actors.find(item => item.id === id)!
  const connection = scene.connections.find(c => c.source === id || c.animal === id || c.driver === id)
  const group = new Set(connection ? [connection.source, connection.animal, connection.driver] : [id])
  const angle = ((patch.heading ?? actor.heading) - actor.heading) * Math.PI / 180
  const ratio = (patch.scale ?? actor.scale) / actor.scale
  const transform = patch.x !== undefined || patch.z !== undefined || patch.heading !== undefined || patch.scale !== undefined
  return reviseExperiment(scene, { actors: scene.actors.map(item => {
    if (!group.has(item.id)) return item
    const updated = item.id === id ? { ...item, ...patch } : item
    if (!transform) return updated
    const dx = (item.x - actor.x) * ratio, dz = (item.z - actor.z) * ratio
    return { ...updated, x: (patch.x ?? actor.x) + dx * Math.cos(angle) + dz * Math.sin(angle),
      z: (patch.z ?? actor.z) - dx * Math.sin(angle) + dz * Math.cos(angle),
      heading: ((item.heading + angle * 180 / Math.PI) % 360 + 360) % 360, scale: item.scale * ratio }
  }) })
}
function createTransportExperiment(seed: number, scenario: ExperimentScenario, count: number,
  spriteFor: (kind: ExperimentActor["kind"], variant: number, clip: ExperimentActor["clip"]) => ExperimentSprite): OverlapExperiment {
  const rng = makeRng(seed), heading = Math.floor(rng() * 8) * 45, angle = heading * Math.PI / 180
  const actors: ExperimentActor[] = [], connections: ExperimentConnection[] = []
  count = Math.max(scenario === "opposingCarts" ? 6 : scenario === "animalCrossing" ? 5 : 4, Math.min(12, Math.round(count)))
  const add = (kind: ExperimentActor["kind"], along: number, side: number, facing: number, sortId?: number) => {
    const i = actors.length, variant = Math.floor(rng() * 6), clip = "walk", sprite = spriteFor(kind, variant, clip)
    const actor: ExperimentActor = { id: `actor-${i + 1}`, label: `${i + 1} · ${EXPERIMENT_KIND_LABELS[kind]}`, kind, variant, color: EXPERIMENT_COLORS[i],
      x: Number((along * Math.sin(angle) + side * Math.cos(angle)).toFixed(6)) || 0,
      z: Number((along * Math.cos(angle) - side * Math.sin(angle)).toFixed(6)) || 0,
      elevation: 0, heading: (heading + facing + 360) % 360, scale: 1, clip,
      frame: Math.floor(rng() * sprite.frames), sprite, ...(sortId ? { sortId } : {}) }
    actors.push(actor); return actor
  }
  const cart = (along: number, side: number, facing: number, donkey = false, turning = false) => {
    const sortId = actors.length + 1, offset = -cartOffset(donkey ? "donkey" : "horse") * BASE_CHARACTER_SCALE, turn = facing * Math.PI / 180
    const source = add(donkey ? "donkeyCart" : "horseCart", along, side, facing, sortId)
    const animal = add(donkey ? "hitchedDonkey" : "hitchedHorse", along + offset * Math.cos(turn), side + offset * Math.sin(turn), facing + (turning ? 22.5 : 0), sortId)
    const driver = add("cartDriver", along, side, facing, sortId)
    connections.push({ kind: "cart", source: source.id, animal: animal.id, driver: driver.id })
  }
  const pack = (along: number, side: number, facing: number) => {
    const sortId = actors.length + 1, turn = facing * Math.PI / 180, lead = PACK_LEAD * BASE_CHARACTER_SCALE
    const animal = add(rng() < .5 ? "packDonkey" : "packHorse", along, side, facing, sortId)
    const source = add("packHandler", along + lead * Math.cos(turn), side + lead * Math.sin(turn), facing, sortId)
    connections.push({ kind: "lead", source: source.id, animal: animal.id })
  }
  if (scenario === "packTrain") {
    for (let i = 0; i < Math.floor(count / 2); i++) pack(Math.floor(i / 3) * 3.2 - 1.6, (i % 3 - 1) * 1.05, 0)
  } else {
    cart(-.6, scenario === "opposingCarts" ? -.42 : 0, 0, rng() < .5, scenario === "turningCart")
    if (scenario === "opposingCarts") cart(.6, .42, 180, true)
    if (scenario === "animalCrossing") pack(1.75, -.8, 90)
  }
  // Bystanders stay in a separate lane. Screen silhouettes still overlap naturally.
  while (actors.length < count) {
    const i = actors.length
    add(EXPERIMENT_PEOPLE[Math.floor(rng() * EXPERIMENT_PEOPLE.length)], (rng() - .5) * 2.4,
      (i % 2 ? 1 : -1) * (.65 + rng() * .25), scenario === "convoy" || scenario === "transport" ? 0 : 90)
  }
  const scene: OverlapExperiment = { id: `${scenario}-${seed}`, name: `${EXPERIMENT_SCENARIOS[scenario]} · ${seed}`, seed, scenario,
    view: Math.floor(rng() * 4), actors, connections, engineOrder: [], manualOrder: [], reviewed: false, notes: "" }
  scene.engineOrder = experimentEngineOrder(scene); scene.manualOrder = [...scene.engineOrder]
  return scene
}
export function createExperiment(seed: number, scenario: ExperimentScenario, count: number,
  spriteFor: (kind: ExperimentActor["kind"], variant: number, clip: ExperimentActor["clip"]) => ExperimentSprite): OverlapExperiment {
  if ((TRANSPORT_SCENARIOS as readonly string[]).includes(scenario) || scenario === "transport") return createTransportExperiment(seed, scenario, count, spriteFor)
  const rng = makeRng(seed), pick = <T,>(items: readonly T[]) => items[Math.floor(rng() * items.length)]
  count = Math.max(2, Math.min(12, Math.round(count)))
  const heading = Math.floor(rng() * 8) * 45, angle = heading * Math.PI / 180
  const actors = Array.from({ length: count }, (_, i): ExperimentActor => {
    const kind = pick(EXPERIMENT_PEOPLE)
    const variant = Math.floor(rng() * 6), clip = scenario === "crowd" ? pick(EXPERIMENT_CLIPS) : "walk"
    const sprite = spriteFor(kind, variant, clip)
    let along = (i - (count - 1) / 2) * .25, side = (rng() - .5) * .16
    if (scenario === "crowd") { along = (rng() - .5) * 1.6; side = (rng() - .5) * 1.5 }
    if (scenario === "coincident") along = side = 0
    if (scenario === "crossing") { along = (Math.floor(i / 2) - (Math.ceil(count / 2) - 1) / 2) * .28; side = i % 2 ? along : 0; if (i % 2) along = 0 }
    const actorHeading = (heading + (scenario === "crossing" && i % 2 ? 90 : 0)) % 360
    return { id: `actor-${i + 1}`, label: `${i + 1} · ${EXPERIMENT_KIND_LABELS[kind]}`, kind, variant, color: EXPERIMENT_COLORS[i],
      x: Number((along * Math.sin(angle) + side * Math.cos(angle)).toFixed(3)) || 0, z: Number((along * Math.cos(angle) - side * Math.sin(angle)).toFixed(3)) || 0,
      elevation: 0, heading: actorHeading,
      scale: 1, clip, frame: Math.floor(rng() * sprite.frames), sprite }
  })
  const scene = { id: `${scenario}-${seed}`, name: `${EXPERIMENT_SCENARIOS[scenario]} · ${seed}`, seed,
    scenario, view: Math.floor(rng() * 4), actors, connections: [] as ExperimentConnection[], engineOrder: [] as string[], manualOrder: [] as string[], reviewed: false, notes: "" }
  scene.engineOrder = experimentEngineOrder(scene); scene.manualOrder = [...scene.engineOrder]
  return scene
}
export function experimentSuite(tests: OverlapExperiment[]): OverlapExperimentSuite {
  return { format: "pilgrimage-overlap-experiments", version: 1, rule: EXPERIMENT_RULE, orderConvention: "back-to-front", tests }
}
