import { describe, expect, it } from "vitest"

import { MAX_TRAFFIC } from "../travelers"
import { DEFAULT_CAMERA_SAVE, DEFAULT_PLAYBACK_SAVE, parseDisplaySettings, parseGameSave, SAVE_VERSION, withoutNonFinite, worldIdentity, type GameSave } from "./schema"
import { DEFAULT_WORLD_SETTINGS } from "./settings"

const minimal = () => ({
  version: SAVE_VERSION,
  savedAt: "2026-09-09T00:00:00.000Z",
  world: worldIdentity(12, DEFAULT_WORLD_SETTINGS),
  settlement: { claimedBuildings: [], resources: { gold: 10, wood: 5 }, deliveredWood: 0, spentWood: 0,
    shrineAdmission: 1, collectedAdmission: 0, collectedTrade: 0, structures: [] },
  simulation: { time: 1.5, treeModel: "sprites", visits: 0, wood: 0, shrineGold: 0, tradeGold: 0, constructionWood: 0,
    shrineQueueSequence: 0, admissionSequence: 0, relic: { sanctity: 50, spectacle: 50, doubt: 10 },
    felled: [] as number[], treeResources: [], foodStores: [], piles: [], travelers: [], joinedMonks: [] },
  camera: { targetX: 0, targetZ: 0, viewIndex: 0, viewSize: 24 },
  playback: { paused: false, speed: 2 },
})

describe("game save schema", () => {
  it("migrates existing saves without changing their terrain generator", () => {
    const input = minimal()
    const { generation: _generation, ...world } = input.world
    const result = parseGameSave({ ...input, version: 1, world })
    expect(result.error).toBeNull()
    expect(result.save?.version).toBe(SAVE_VERSION)
    expect(result.save?.world.generation).toBe(1)
    expect(result.save?.settlement).toEqual(parseGameSave(input).save?.settlement)
    expect(parseGameSave(input).save?.world.generation).toBe(4)
    expect(parseGameSave({ ...input, world: { ...input.world, generation: 2 } }).save?.world.generation).toBe(2)
  })

  it("migrates version two saves and keeps new job assignments", () => {
    const input = minimal()
    expect(parseGameSave({ ...input, version: 2 }).save?.version).toBe(SAVE_VERSION)
    const result = parseGameSave({ ...input, simulation: { ...input.simulation, monkJobs: { 0: "builder", 1: "keeper", 2: "almoner" } } })
    expect(result.save?.simulation.monkJobs).toEqual({ 0: "builder", 1: "keeper", 2: "almoner" })
  })

  it("accepts a well-formed document and fills elevation defaults", () => {
    const input = minimal()
    input.world.elevation = { maxHeight: 3 } as typeof input.world.elevation
    const { save, error } = parseGameSave(input)
    expect(error).toBeNull()
    expect(save?.world.elevation.maxHeight).toBe(3)
    expect(save?.world.elevation.scale).toBe(DEFAULT_WORLD_SETTINGS.elevation.scale)
  })

  it("names the first problem in a document whose world cannot be identified", () => {
    expect(parseGameSave(null).error).toMatch(/not an object/)
    expect(parseGameSave({ version: SAVE_VERSION + 1 }).error).toMatch(/version/)
    const seedless = minimal()
    seedless.world.seed = -1
    expect(parseGameSave(seedless).error).toMatch(/world\.seed/)
    const broken = minimal() as Record<string, unknown>
    broken.world = { ...minimal().world, coverage: null }
    expect(parseGameSave(broken).error).toMatch(/world\.coverage/)
    const empty = minimal() as Record<string, unknown>
    empty.settlement = { ...minimal().settlement, resources: { gold: null, wood: 5 } }
    expect(parseGameSave(empty).error).toMatch(/settlement\.resources\.gold/)
  })

  it("drops a record that fails instead of the whole save", () => {
    const traveler = (id: number, hunger: number | null) => ({ id, gold: 1, piety: 1, happiness: 1, hunger, thirst: 1, stamina: 1,
      jobless: true, employer: null, jobSlot: 0, home: null, carrying: 0, visits: 0, visitCooldown: 0, admissionPaid: 0, fled: 0,
      rolls: 0, cycle: 0, direction: 1, progress: 3, laneOffset: 0, lane: 0, position: { x: 0, y: 0, z: 0 } })
    const structure = (id: string, height: number | null) => ({ id, buildType: "house", label: "House", x: 1, z: 1, w: 2, d: 2,
      height, color: "#fff", roofColor: "#000" })
    const input = minimal()
    const doc = {
      ...input,
      settlement: { ...input.settlement, structures: [structure("a", 1), structure("b", null)], church: structure("church", null) },
      simulation: { ...input.simulation, felled: [3, -1, 4], travelers: [traveler(0, 1), traveler(1, null), traveler(2, 5)],
        foodStores: [["a", { bread: 2 }], ["b", { bread: null }]], piles: [{ id: "p", campId: "c", slot: 0, wood: null }],
        partyGold: [[1, -0.0000001], [2, 3]], monkJobs: { 0: "builder", 1: "juggler" } },
    }
    const { save, error, dropped } = parseGameSave(JSON.parse(JSON.stringify(doc))) as { save: GameSave; error: null; dropped: number }
    expect(error).toBeNull()
    expect(save.settlement.structures.map(s => s.id)).toEqual(["a"])
    expect(save.settlement.church).toBeUndefined()
    expect(save.simulation.felled).toEqual([3, 4])
    expect(save.simulation.travelers.map(t => t.id)).toEqual([0, 2])
    expect(save.simulation.foodStores).toEqual([["a", { bread: 2 }]])
    expect(save.simulation.piles).toEqual([])
    expect(save.simulation.partyGold).toEqual([[2, 3]])
    expect(save.simulation.monkJobs).toEqual({ 0: "builder" })
    expect(dropped).toBe(8)
    expect(doc.simulation.felled).toEqual([3, -1, 4])
  })

  it("falls back to the default camera and playback when those sections are broken", () => {
    const input = JSON.parse(JSON.stringify({ ...minimal(), camera: { ...minimal().camera, targetX: NaN }, playback: { paused: "no", speed: 2 } }))
    const result = parseGameSave(input)
    expect(result.error).toBeNull()
    expect(result.save?.camera).toEqual(DEFAULT_CAMERA_SAVE)
    expect(result.save?.playback).toEqual(DEFAULT_PLAYBACK_SAVE)
    expect(result.save && result.dropped).toBe(2)
    expect(parseGameSave(minimal())).toMatchObject({ error: null, dropped: 0 })
  })

  it("clamps world values saved out of range rather than rejecting the save", () => {
    const input = minimal()
    const world = { ...input.world, rivers: -2, coverage: 150, glades: -3, water: 101, traffic: 1_000_000 }
    const { save, error } = parseGameSave({ ...input, world })
    expect(error).toBeNull()
    expect(save?.world).toMatchObject({ rivers: -1, coverage: 100, glades: 0, water: 100, traffic: MAX_TRAFFIC, seed: 12 })
  })

  it("never writes a number a load would refuse", () => {
    const input = parseGameSave(minimal()).save!
    const traveler = { id: 4, gold: 1, piety: 1, happiness: 1, hunger: NaN, thirst: 1, stamina: 1, jobless: true, employer: null,
      jobSlot: 0, home: null, carrying: 0, visits: 0, visitCooldown: 0, admissionPaid: 0, fled: 0, rolls: 0, cycle: 0,
      direction: 1 as const, progress: 3, laneOffset: 0, lane: 0, position: { x: 0, y: 0, z: 0 } }
    const broken: GameSave = {
      ...input,
      settlement: { ...input.settlement, resources: { gold: NaN, wood: 5 }, collectedTrade: Infinity },
      simulation: { ...input.simulation, travelers: [traveler, { ...traveler, id: 5, hunger: 2 }], relic: { sanctity: NaN, spectacle: 1, doubt: 1 } },
      camera: { ...input.camera, viewSize: Infinity },
    }
    const clean = withoutNonFinite(broken)
    expect(clean.settlement.resources).toEqual({ gold: 0, wood: 5 })
    expect(clean.settlement.collectedTrade).toBe(0)
    expect(clean.simulation.relic.sanctity).toBe(0)
    expect(clean.simulation.travelers.map(t => t.id)).toEqual([5])
    expect(clean.camera).toEqual(DEFAULT_CAMERA_SAVE)
    expect(broken.simulation.travelers).toHaveLength(2)
    expect(parseGameSave(JSON.parse(JSON.stringify(clean)))).toMatchObject({ error: null, dropped: 0 })
    expect(withoutNonFinite(input)).toBe(input)
  })

  it("snaps a retired playback speed to the nearest one offered", () => {
    const input = minimal()
    input.playback.speed = 4
    expect(parseGameSave(input).save?.playback.speed).toBe(2)
    input.playback.speed = 12
    expect(parseGameSave(input).save?.playback.speed).toBe(12)
  })

  it("keeps world identity to the generation inputs", () => {
    const identity = worldIdentity(-1, { ...DEFAULT_WORLD_SETTINGS, size: 256 })
    expect(identity.seed).toBe(0xffffffff)
    expect(identity.size).toBe(256)
    expect("walkSpeed" in identity).toBe(false)
  })

  it("retains the grid preference and accepts older display settings without it", () => {
    expect(parseDisplaySettings({ showGrid: false })).toEqual({ showGrid: false })
    expect(parseDisplaySettings({ showTrees: false })).toEqual({ showTrees: false })
    expect(parseDisplaySettings({ showGrid: "off" })).toEqual({})
  })

  it("salvages valid display fields and drops the rest", () => {
    expect(parseDisplaySettings({ showTrees: false, characterModel: "wizard", road: 99, walkSpeed: 1.2, extra: 1 }))
      .toEqual({ showTrees: false, walkSpeed: 1.2 })
    expect(parseDisplaySettings("nope")).toEqual({})
  })
})
