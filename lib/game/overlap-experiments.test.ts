import { readFileSync, existsSync } from "node:fs"
import { describe, expect, it } from "vitest"
import * as THREE from "three"
import {
  createExperiment, experimentSuite, experimentJson, parseExperiments, experimentEngineOrder, experimentCamera,
  reviseExperiment, moveExperimentActor, editExperimentActor, experimentSortAnchor, refreshExperimentBaseline, EXPERIMENT_RULE, EXPERIMENT_SCENARIOS, EXPERIMENT_KINDS, EXPERIMENT_CLIPS, EXPERIMENT_TRANSPORT, TRANSPORT_SCENARIOS,
} from "./overlap-experiments"
import { experimentSprite } from "./overlap-experiment-assets"
import { characterOverlapBounds } from "./render/character-overlap"
import { overlapOrder } from "./render/overlap-order"
import { TILE_HEIGHT } from "./map/terrain"
import { cartOffset, PACK_LEAD } from "./transport/assets"
import { BASE_CHARACTER_SCALE } from "./base-person/gait"
import { experimentRoadSegments } from "./overlap-experiment-paths"

describe("portable overlap experiments", () => {
  it("refreshes old engine orders without rewriting human reviews or scene data", () => {
    const scene = createExperiment(42, "convoy", 6, experimentSprite)
    scene.reviewed = true; scene.manualOrder.reverse(); scene.notes = "Keep the driver visible"
    delete scene.actors.find(a => a.kind === "cartDriver")!.sprite.railSeat!.y
    scene.engineOrder = [...scene.manualOrder]
    const old = { ...experimentSuite([scene]), rule: "sort-rail-v1" }, before = structuredClone(old)
    const next = refreshExperimentBaseline(old)
    expect(old).toEqual(before)
    expect(next.rule).toBe(EXPERIMENT_RULE)
    expect(next.tests[0]).toEqual({ ...scene, engineOrder: experimentEngineOrder(scene) })
    expect(next.tests[0].engineOrder).not.toEqual(old.tests[0].engineOrder)
    expect(refreshExperimentBaseline(next)).toBe(next)
  })
  it("preserves path geometry through export and rejects invalid path dimensions", () => {
    const scene = createExperiment(42, "convoy", 6, experimentSprite)
    scene.paths = [{ width: 2.8, points: [[0, -8], [0, 8]] }, { width: 2, points: [[-8, 0], [0, 0]] }]
    const suite = experimentSuite([scene])
    expect(parseExperiments(experimentJson(suite))).toEqual(suite)
    scene.paths[0].width = -1
    expect(() => parseExperiments(experimentJson(suite))).toThrow()
  })
  it("keeps the same world-space path across tile boundaries and unions junction branches", () => {
    const map = { width: 22, depth: 22 }
    const paths = [{ width: 2.8, points: [[0, -8], [0, 8]] as [number, number][] },
      { width: 2, points: [[-8, 0], [0, 0]] as [number, number][] }]
    const roads = experimentRoadSegments(map, paths)
    expect(roads.get(11 * 22 + 11)).toHaveLength(2)
    for (const [index, segments] of roads) for (const segment of segments) {
      const x = index % 22 - 11, z = Math.floor(index / 22) - 11
      expect(paths.some(path => path.width === segment[6]
        && path.points[0][0] === segment[0] + x && path.points[0][1] === segment[1] + z
        && path.points[1][0] === segment[2] + x && path.points[1][1] === segment[3] + z)).toBe(true)
      expect(index).toBeGreaterThanOrEqual(0); expect(index).toBeLessThan(22 * 22)
    }
    expect(experimentRoadSegments(map, undefined).size).toBe(0)
  })
  it("reproduces every scenario from its seed", () => {
    for (const scenario of Object.keys(EXPERIMENT_SCENARIOS) as (keyof typeof EXPERIMENT_SCENARIOS)[]) {
      const a = createExperiment(42, scenario, 12, experimentSprite)
      expect(createExperiment(42, scenario, 12, experimentSprite)).toEqual(a)
      expect(createExperiment(43, scenario, 12, experimentSprite).actors).not.toEqual(a.actors)
      expect(parseExperiments(experimentJson(experimentSuite([a]))).tests[0]).toEqual(a)
      expect(new Set(a.actors.map(actor => actor.color)).size).toBe(12)
    }
  })
  it("round-trips corrected orders, review status, notes and exact atlas versions", () => {
    const test = createExperiment(0, "crossing", 7, experimentSprite)
    test.manualOrder.reverse(); test.reviewed = true; test.notes = "The red person's arm should remain behind the donkey."
    const suite = experimentSuite([test])
    expect(parseExperiments(experimentJson(suite))).toEqual(suite)
    expect(test.engineOrder).not.toEqual(test.manualOrder)
  })
  it("rejects corrupt collections without accepting partial data", () => {
    const fixture = () => experimentSuite([createExperiment(1, "crowd", 5, experimentSprite)])
    const edits = [
      (s: ReturnType<typeof fixture>) => { s.tests[0].actors[0].x = Infinity },
      (s: ReturnType<typeof fixture>) => { s.tests[0].manualOrder[0] = "missing" },
      (s: ReturnType<typeof fixture>) => { s.tests[0].manualOrder.pop() },
      (s: ReturnType<typeof fixture>) => { s.tests[0].actors[1].id = s.tests[0].actors[0].id },
      (s: ReturnType<typeof fixture>) => { s.tests.push(s.tests[0]) },
      (s: ReturnType<typeof fixture>) => { s.tests[0].actors[0].sprite.url = "https://example.com/asset.png" },
      (s: ReturnType<typeof fixture>) => { s.tests[0].actors[0].sprite.rowOffset = 120 },
      (s: ReturnType<typeof fixture>) => { s.tests[0].actors[0].frame = 127 },
    ]
    for (const edit of edits) { const suite = fixture(); edit(suite); expect(() => parseExperiments(experimentJson(suite))).toThrow() }
    expect(() => parseExperiments('{"version":2}')).toThrow()
    expect(() => parseExperiments(" ".repeat(2_000_001))).toThrow()
  })
  it("invalidates geometry reviews without losing the manual draft or notes", () => {
    const scene = createExperiment(9, "procession", 5, experimentSprite)
    scene.reviewed = true; scene.manualOrder.reverse(); scene.notes = "Keep this observation"
    const next = reviseExperiment(scene, { view: (scene.view + 2) % 4 })
    expect(next.reviewed).toBe(false); expect(next.manualOrder).toEqual(scene.manualOrder)
    expect(next.notes).toBe(scene.notes); expect(next.engineOrder).not.toEqual(scene.engineOrder)
  })
  it("moves figures through the full stack without dropping or duplicating IDs", () => {
    const order = ["a", "b", "c"]
    expect(moveExperimentActor(order, "a", 1)).toEqual(["b", "a", "c"])
    expect(moveExperimentActor(order, "c", -1)).toEqual(["a", "c", "b"])
    expect(moveExperimentActor(order, "a", -1)).toEqual(order)
    expect(moveExperimentActor(order, "c", 1)).toEqual(order)
    expect(moveExperimentActor(order, "absent", 1)).toEqual(order)
  })
  it("records the same baseline as the real renderer at every camera angle", () => {
    for (const scenario of ["coincident", "crossing", "transport"] as const) for (let view = 0; view < 4; view++) {
      const scene = createExperiment(23, scenario, 12, experimentSprite); scene.view = view
      scene.actors[0].elevation = .5
      const camera = experimentCamera(view)
      const sprites = scene.actors.map((actor, i) => {
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial())
        sprite.position.set(actor.x, TILE_HEIGHT + actor.elevation, actor.z)
        sprite.userData.heading = actor.heading * Math.PI / 180
        sprite.scale.setScalar(actor.sprite.worldSize * actor.scale); sprite.updateMatrixWorld()
        return { sprite, ids: sprite, ground: { value: new THREE.Vector4() }, depth: { map: { value: null }, enabled: { value: false } },
          id: new THREE.Vector3((actor.sortId ?? i + 1) / 255, 0, 0), railPart: actor.sprite.railPart,
          railSeat: experimentSortAnchor(actor) }
      })
      expect(experimentEngineOrder(scene)).toEqual(overlapOrder(sprites.map(entry => characterOverlapBounds(entry, camera))).map(i => scene.actors[i].id))
      sprites.forEach(entry => entry.sprite.material.dispose())
    }
  })
  it("always generates complete transport teams at shared game spacing", () => {
    for (const scenario of TRANSPORT_SCENARIOS) for (const count of [2, 7, 12]) for (const seed of [1, 42, 100]) {
      const scene = createExperiment(seed, scenario, count, experimentSprite)
      expect(scene.connections.length).toBeGreaterThan(0)
      const connected = new Set(scene.connections.flatMap(c => [c.source, c.animal, c.driver]))
      for (const actor of scene.actors) if ((EXPERIMENT_TRANSPORT as readonly string[]).includes(actor.kind)) expect(connected.has(actor.id)).toBe(true)
      for (const connection of scene.connections) {
        const source = scene.actors.find(a => a.id === connection.source)!, animal = scene.actors.find(a => a.id === connection.animal)!
        const distance = Math.hypot(source.x - animal.x, source.z - animal.z)
        if (connection.kind === "cart") {
          const driver = scene.actors.find(a => a.id === connection.driver)!
          expect(driver.kind).toBe("cartDriver"); expect([driver.x, driver.z, driver.heading]).toEqual([source.x, source.z, source.heading])
          expect(distance).toBeCloseTo(-cartOffset(animal.kind === "hitchedDonkey" ? "donkey" : "horse") * BASE_CHARACTER_SCALE, 5)
          expect(driver.sortId).toBe(source.sortId); expect(animal.sortId).toBe(source.sortId)
        } else {
          expect(source.kind).toBe("packHandler")
          expect(distance).toBeCloseTo(PACK_LEAD * BASE_CHARACTER_SCALE, 5)
        }
      }
      expect(parseExperiments(experimentJson(experimentSuite([scene]))).tests[0]).toEqual(scene)
    }
  })
  it("preserves the hitch and lead when positioning, rotating and scaling a team", () => {
    for (const scenario of ["convoy", "packTrain"] as const) {
      const scene = createExperiment(2, scenario, 7, experimentSprite), link = scene.connections[0]
      const source = scene.actors.find(a => a.id === link.source)!, animal = scene.actors.find(a => a.id === link.animal)!
      const moved = editExperimentActor(scene, source.id, { x: 2, z: -1, heading: 45, scale: 1.5 })
      const movedSource = moved.actors.find(a => a.id === source.id)!, movedAnimal = moved.actors.find(a => a.id === animal.id)!
      expect(Math.hypot(movedSource.x - movedAnimal.x, movedSource.z - movedAnimal.z)).toBeCloseTo(Math.hypot(source.x - animal.x, source.z - animal.z) * 1.5)
      expect(movedSource.heading).toBe(45); expect(movedAnimal.scale).toBe(1.5)
      const connected = new Set([link.source, link.animal, link.driver])
      for (const actor of scene.actors) if (!connected.has(actor.id)) expect(moved.actors.find(a => a.id === actor.id)).toBe(actor)
    }
  })
  it("uses shipped color/depth atlases with valid frame dimensions for every supported pose", () => {
    for (const kind of EXPERIMENT_KINDS) for (const clip of EXPERIMENT_CLIPS) {
      const sprite = experimentSprite(kind, 5, clip)
      for (const url of [sprite.url, sprite.depth]) {
        const path = `public${url}`
        expect(existsSync(path), path).toBe(true)
        const png = readFileSync(path), width = png.readUInt32BE(16), height = png.readUInt32BE(20)
        expect(width / sprite.columns, path).toBe(height / sprite.rows)
        expect(sprite.rowOffset + sprite.directions).toBeLessThanOrEqual(sprite.rows)
      }
    }
  })
})
