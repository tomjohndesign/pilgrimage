import { describe, expect, it } from "vitest"

import { parseDisplaySettings, parseGameSave, SAVE_VERSION, worldIdentity } from "./schema"
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
    expect(parseGameSave(input).save?.world.generation).toBe(2)
  })

  it("accepts a well-formed document and fills elevation defaults", () => {
    const input = minimal()
    input.world.elevation = { maxHeight: 3 } as typeof input.world.elevation
    const { save, error } = parseGameSave(input)
    expect(error).toBeNull()
    expect(save?.world.elevation.maxHeight).toBe(3)
    expect(save?.world.elevation.scale).toBe(DEFAULT_WORLD_SETTINGS.elevation.scale)
  })

  it("names the first problem in a broken document", () => {
    expect(parseGameSave(null).error).toMatch(/not an object/)
    expect(parseGameSave({ version: SAVE_VERSION + 1 }).error).toMatch(/version/)
    const input = minimal()
    input.playback.speed = -1
    expect(parseGameSave(input).error).toMatch(/playback\.speed/)
    const negative = minimal()
    negative.simulation.felled = [-1]
    expect(parseGameSave(negative).error).toMatch(/felled/)
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

  it("salvages valid display fields and drops the rest", () => {
    expect(parseDisplaySettings({ showTrees: false, characterModel: "wizard", road: 99, walkSpeed: 1.2, extra: 1 }))
      .toEqual({ showTrees: false, walkSpeed: 1.2 })
    expect(parseDisplaySettings("nope")).toEqual({})
  })
})
