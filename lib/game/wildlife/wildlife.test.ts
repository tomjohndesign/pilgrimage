import * as THREE from "three"
import { wildlifeGeometry } from "./batch"
import { describe, expect, it, vi } from "vitest"
import { animalBoneLengths, animalLeg } from "../transport/animal-pose"
import { RIG_TO_WORLD } from "../transport/assets"
import { WALK_STANCE_FRACTION } from "../base-person/pose"
import { tileToWorldX, tileToWorldZ, type GameMap } from "../map/types"
import type { TreePlacement } from "../trees/placement"
import { habitatAllows, wildlifeHabitat, wildlifeSegmentClear } from "./habitat"
import { createWildlife, startleWildlife, stepWildlife } from "./simulation"
import { burrowApproach } from "./burrow-motion"
import { isBird, WILDLIFE_PROFILES, wildlifeStride } from "./species"
import { createWildlifeRig } from "./rig"

function fixture() {
  const map: GameMap = { width: 48, depth: 48, tiles: Array(48 * 48).fill("grass"), buildings: [], seed: 124 }
  const trees: TreePlacement[] = []
  for (let z = 0; z < 48; z++) {
    map.tiles[z * 48 + 24] = "path"
    for (let x = 0; x < 8; x++) map.tiles[z * 48 + x] = "forest"
    if (z % 3 === 0) trees.push({ x: tileToWorldX(map, 7), z: tileToWorldZ(map, z), y: 0.2, species: "oak" })
  }
  return { map, trees }
}

describe("wildlife habitats and social groups", () => {
  it("seeds all eight species, doe herds and solitary bucks deterministically", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees)
    expect(world.animals).toEqual(createWildlife(map, trees).animals)
    expect(new Set(world.animals.map(a => a.kind))).toEqual(new Set(Object.keys(WILDLIFE_PROFILES)))
    for (const kind of ["sheep", "goat", "deer"] as const) {
      const herd = world.animals.filter(a => a.kind === kind)
      expect(herd.length).toBeGreaterThanOrEqual(3)
      expect(new Set(herd.map(a => a.leader)).size).toBe(1)
    }
    expect(world.animals.filter(a => a.kind === "buck")).toHaveLength(1)
    world.animals.filter(a => !isBird(a.kind)).forEach(a => expect(habitatAllows(world.habitat, a.kind, a)).toBe(true))
  })
  it("avoids paths, buildings and open ground far from the forest, with domestic exceptions", () => {
    const { map, trees } = fixture(), habitat = wildlifeHabitat(map, trees)
    const nearPath = { x: tileToWorldX(map, 23), z: 0 }
    expect(habitatAllows(habitat, "deer", nearPath)).toBe(false)
    expect(habitatAllows(habitat, "sheep", nearPath)).toBe(true)
    expect(habitatAllows(habitat, "fox", { x: -10, z: 0 })).toBe(false)
    expect(habitatAllows(habitat, "boar", { x: -14, z: 0 })).toBe(true)
    map.buildings.push({ id: "new", label: "House", x: 13, z: 23, w: 2, d: 2, height: 1, color: "#fff", roofColor: "#fff" })
    expect(habitatAllows(habitat, "deer", { x: -8, z: 0 }, map)).toBe(false)
    expect(habitatAllows(habitat, "goat", { x: -8, z: 0 }, map)).toBe(true)
    expect(habitatAllows(habitat, "goat", { x: -10, z: 0 }, map)).toBe(false)
  })
  it("lets an animal retreat when new construction expands into its quiet buffer", () => {
    const { map, trees } = fixture(), habitat = wildlifeHabitat(map, trees)
    map.buildings.push({ id: "new", label: "House", x: 13, z: 23, w: 2, d: 2, height: 1, color: "#fff", roofColor: "#fff" })
    const from = { x: -8, z: 0 }, away = { x: -5.5, z: 0 }, toward = { x: -10, z: 0 }
    expect(habitatAllows(habitat, "deer", from, map)).toBe(false)
    expect(wildlifeSegmentClear(habitat, "deer", from, away, map)).toBe(true)
    expect(wildlifeSegmentClear(habitat, "deer", from, toward, map)).toBe(false)
  })
  it("checks the whole route against water, paths and cliffs", () => {
    const { map, trees } = fixture(), habitat = wildlifeHabitat(map, trees)
    expect(wildlifeSegmentClear(habitat, "deer", { x: -4, z: 0 }, { x: 4, z: 0 })).toBe(false)
    map.tiles[24 * 48 + 14] = "water"
    expect(wildlifeSegmentClear(habitat, "goat", { x: -12, z: 0.5 }, { x: -7, z: 0.5 })).toBe(false)
    map.elevation = { settings: {} as never, height: Array(2304).fill(0), slope: Array(2304).fill(0), cliffs: Array(2304).fill(0), corners: Array(2304 * 4).fill(0) }
    for (let i = 0; i < 4; i++) map.elevation.corners[(23 * 48 + 14) * 4 + i] = 2
    expect(wildlifeSegmentClear(habitat, "goat", { x: -12, z: -0.5 }, { x: -7, z: -0.5 })).toBe(false)
  })
  it("keeps herds close and all ground animals in valid habitats over sustained wandering", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees)
    for (let tick = 0; tick < 1800; tick++) stepWildlife(world, map, 0.1)
    for (const animal of world.animals.filter(a => !isBird(a.kind))) {
      expect(habitatAllows(world.habitat, animal.kind, animal)).toBe(true)
      const leader = world.animals[animal.leader]
      expect(Math.hypot(animal.x - leader.x, animal.z - leader.z)).toBeLessThan(3.5)
    }
  })
  it("does not spawn isolated sheep or goats when a whole herd cannot fit", () => {
    const map: GameMap = { width: 3, depth: 3, tiles: Array(9).fill("water"), buildings: [], seed: 3 }
    map.tiles[4] = "grass"
    const world = createWildlife(map, [])
    expect(world.animals.some(a => a.kind === "sheep" || a.kind === "goat")).toBe(false)
  })
})

describe("birds", () => {
  it("flushes a perched flock on a chop, flies, and lands on another standing tree", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees)
    const sparrow = world.animals.find(a => a.kind === "sparrow")!, tree = trees[sparrow.perch!]
    const affected = world.animals.filter(a => a.perch === sparrow.perch)
    startleWildlife(world, tree, map, new Set())
    expect(affected.every(a => a.flight !== null)).toBe(true)
    let landed = false
    for (let tick = 0; tick < 1200; tick++) {
      stepWildlife(world, map, 0.1)
      if (sparrow.perch !== null) { expect(trees[sparrow.perch]).not.toBe(tree); landed = true; break }
    }
    expect(landed).toBe(true)
  })
  it.each([0, 1, 2, 3])("reveals at most one hidden flock on an early chop (chosen chop %i)", birdChop => {
    const { map, trees } = fixture(), world = createWildlife(map, trees)
    // Keep ambient birds out of this hidden-flock scenario.
    for (const animal of world.animals) if (isBird(animal.kind)) animal.reserve = true
    const tree = trees[0]
    world.rng = vi.fn(() => 0.1).mockReturnValueOnce(birdChop ? 0.1 : 0.9)
    if (birdChop) vi.mocked(world.rng).mockReturnValueOnce((birdChop - 0.5) / 3)
    const count = world.animals.length
    for (let hit = 1; hit <= 20; hit++) {
      startleWildlife(world, tree, map, new Set())
      const flying = world.animals.filter(a => a.transient && !a.concealed)
      expect(flying.length).toBe(hit === birdChop ? 2 : 0)
      // Make the pool available again, as after landing and returning to cover.
      for (const animal of flying) {
        animal.flight = null; animal.concealed = true; animal.reserve = true
      }
    }
    expect(world.animals.length).toBe(count)
    expect(world.animals.filter(a => a.transient).length).toBe(6)
  })
  it("does not flush returning birds again or startle late arrivals after the third chop", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees)
    const bird = world.animals.find(a => a.kind === "sparrow" && !a.reserve)!, index = bird.perch!, tree = trees[index]
    startleWildlife(world, tree, map, new Set())
    expect(bird.flight).not.toBeNull()
    Object.assign(bird, { flight: null, perch: index, x: tree.x, z: tree.z })
    startleWildlife(world, tree, map, new Set())
    expect(bird.flight).toBeNull()

    const otherIndex = trees.findIndex(t => Math.abs(t.z - tree.z) > 7), otherTree = trees[otherIndex]
    for (const animal of world.animals) if (isBird(animal.kind)) animal.reserve = true
    world.rng = () => 0.9
    for (let hit = 0; hit < 3; hit++) startleWildlife(world, otherTree, map, new Set())
    Object.assign(bird, { reserve: false, flight: null, perch: otherIndex, x: otherTree.x, z: otherTree.z })
    startleWildlife(world, otherTree, map, new Set())
    expect(bird.flight).toBeNull()
  })
  it("abandons felled perches and remains airborne when there are no trees", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees)
    const allFelled = new Set(trees.map((_, i) => i))
    for (let tick = 0; tick < 100; tick++) stepWildlife(world, map, 0.1, 1, allFelled)
    expect(world.animals.filter(a => isBird(a.kind) && !a.concealed).every(a => a.perch === null)).toBe(true)
    const empty = createWildlife(map, [])
    for (let tick = 0; tick < 100; tick++) stepWildlife(empty, map, 0.1)
    expect(empty.animals.find(a => a.kind === "hawk")!.y).toBeGreaterThan(2)
  })
  it("preserves all state while paused", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees), before = structuredClone(world.animals)
    stepWildlife(world, map, 0)
    expect(world.animals).toEqual(before)
  })
})

describe("shared quadruped rig", () => {
  for (const [kind, profile] of Object.entries(WILDLIFE_PROFILES)) {
    if (kind === "hawk" || kind === "sparrow") continue
    it(`${kind} retains fixed limb lengths and distance-cancelled stance contacts`, () => {
      for (let frame = 0; frame < 100; frame++) for (const rear of [false, true]) for (const side of ["left", "right"] as const) {
        const pose = animalLeg("donkey", side, rear, frame / 100, true, "common", profile)
        const bones = animalBoneLengths("donkey", rear, "common", profile)
        const distance = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]))
        expect(distance(pose.hip, pose.upperJoint)).toBeCloseTo(bones.upper, 6)
        expect(distance(pose.upperJoint, pose.knee)).toBeCloseTo(bones.middle, 6)
        expect(distance(pose.knee, pose.ankle)).toBeCloseTo(bones.cannon, 6)
      }
      const a = animalLeg("donkey", "left", false, 0.2, true, "common", profile)
      const b = animalLeg("donkey", "left", false, 0.21, true, "common", profile)
      expect((b.ankle[2] - a.ankle[2]) * RIG_TO_WORLD + wildlifeStride(kind as keyof typeof WILDLIFE_PROFILES, 1) * 0.01).toBeCloseTo(0, 7)
      expect(wildlifeStride(kind as keyof typeof WILDLIFE_PROFILES, 2)).toBeCloseTo(4 * profile.stride / WALK_STANCE_FRACTION * RIG_TO_WORLD)
    })
  }
  it("builds every articulated model with finite geometry in idle, walk, graze and flight", () => {
    for (const kind of Object.keys(WILDLIFE_PROFILES) as (keyof typeof WILDLIFE_PROFILES)[]) {
      const rig = createWildlifeRig(kind), batch = wildlifeGeometry(rig.parts,[0])
      for (const moving of [false, true]) for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
        rig.pose(phase, moving, phase * 10, moving ? 0 : 1, isBird(kind) && moving)
        batch.write(0,new THREE.Matrix4());batch.finish()
        rig.parts.forEach(part => {
          expect(Array.from(part.geometry.attributes.position.array).every(Number.isFinite)).toBe(true)
          expect(part.matrixWorld.elements.every(Number.isFinite)).toBe(true)
        })
      }
      batch.dispose();rig.dispose()
    }
  })
})

describe("species behavior", () => {
  it("uses species-specific gaits, grazing, resting and burrows over a full activity cycle", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees)
    const observed = new Set<string>(), resting = new Map<string, number>(), total = new Map<string, number>()
    for (let tick = 0; tick < 6000; tick++) {
      stepWildlife(world, map, 0.1)
      for (const animal of world.animals.filter(a => !isBird(a.kind))) {
        total.set(animal.kind, (total.get(animal.kind) ?? 0) + 1)
        if (!animal.moving) resting.set(animal.kind, (resting.get(animal.kind) ?? 0) + 1)
        if (animal.moving) observed.add(`${animal.kind}:${animal.gait}`)
        if (animal.lying > 0.8) observed.add(`${animal.kind}:lie`)
        if (animal.burrowState === "inside") observed.add("rabbit:inside")
        if (animal.burrowState === "emerging") observed.add("rabbit:emerging")
      }
    }
    expect(observed.has("rabbit:hop")).toBe(true)
    expect(observed.has("rabbit:inside")).toBe(true)
    expect(observed.has("rabbit:emerging")).toBe(true)
    expect(observed.has("fox:trot")).toBe(true)
    expect(observed.has("fox:lie")).toBe(true)
    expect(observed.has("boar:walk")).toBe(true)
    expect(world.animals.filter(a => a.kind === "boar").every(a => ["idle", "graze"].includes(a.action))).toBe(true)
    expect([...observed].filter(value => value.startsWith("sheep:"))).toEqual(["sheep:walk"])
    expect([...observed].filter(value => value.startsWith("goat:"))).toEqual(["goat:walk"])
    expect(resting.get("goat")! / total.get("goat")!).toBeGreaterThan(0.8)
    expect([...observed].some(value => value === "boar:leap" || value === "boar:hop")).toBe(false)
  })
  it("enters the actual burrow, pauses underground, and emerges at the same opening", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees)
    const rabbit = world.animals.find(a => a.kind === "rabbit")!, hole = world.burrows[rabbit.burrow!]
    Object.assign(rabbit, { x: hole.x, z: hole.z, rest: 0, outsideTime: 100 })
    let entered = false, emerged = false
    for (let tick = 0; tick < 1000; tick++) {
      stepWildlife(world, map, 0.1)
      if (rabbit.burrowState === "inside") {
        entered = true; expect(rabbit.concealed).toBe(true); expect(rabbit.shelter).toBe(1)
        const before = structuredClone(rabbit); stepWildlife(world, map, 0); expect(rabbit).toEqual(before)
      }
      if (entered && rabbit.burrowState === "outside") { emerged = true; expect(rabbit.concealed).toBe(false); const approach=burrowApproach(hole); expect(rabbit.x).toBeCloseTo(approach.x,8); expect(rabbit.z).toBeCloseTo(approach.z,8); break }
    }
    expect(entered && emerged).toBe(true)
  })
  it("concealed birds leave the tree on a chop and return into cover", () => {
    const { map, trees } = fixture(), world = createWildlife(map, trees), bird = world.animals.find(a => a.kind === "sparrow" && !a.reserve)!
    bird.concealed = true
    startleWildlife(world, trees[bird.perch!], map, new Set())
    expect(bird.flight).not.toBeNull(); expect(bird.concealed).toBe(false)
    bird.flight!.sheltered = true
    for (let tick = 0; tick < 800 && bird.flight; tick++) stepWildlife(world, map, 0.1)
    expect(bird.concealed).toBe(true)
    expect(bird.perch).not.toBeNull()
    bird.rest = 0
    stepWildlife(world, map, 0.1)
    expect(bird.concealed).toBe(false); expect(bird.flight).not.toBeNull()
  })
})
