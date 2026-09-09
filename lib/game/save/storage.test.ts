import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SAVE_VERSION, worldIdentity, type GameSave } from "./schema"
import { DEFAULT_WORLD_SETTINGS, DEFAULT_DISPLAY_SETTINGS } from "./settings"
import { clearGameSave, DISPLAY_SETTINGS_KEY, GAME_SAVE_KEY, loadDisplaySettings, loadGameSave, resumeCookieSeed, storeDisplaySettings, storeGameSave } from "./storage"

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
      removeItem: (key: string) => saved.delete(key),
    },
  })
})
afterEach(() => vi.unstubAllGlobals())

const save = (): GameSave => ({
  version: SAVE_VERSION, savedAt: "2026-09-09T00:00:00.000Z", world: worldIdentity(3, DEFAULT_WORLD_SETTINGS),
  settlement: { claimedBuildings: [], resources: { gold: 1, wood: 1 }, deliveredWood: 0, spentWood: 0,
    shrineAdmission: 1, collectedAdmission: 0, collectedTrade: 0, structures: [] },
  simulation: { time: 0, treeModel: "sprites" as const, visits: 0, wood: 0, shrineGold: 0, tradeGold: 0, constructionWood: 0,
    shrineQueueSequence: 0, admissionSequence: 0, relic: { sanctity: 1, spectacle: 1, doubt: 1 },
    felled: [], treeResources: [], foodStores: [], piles: [], travelers: [], joinedMonks: [] },
  camera: { targetX: 0, targetZ: 0, viewIndex: 0, viewSize: 24 },
  playback: { paused: false, speed: 2 as const },
})

describe("save storage", () => {
  it("stores and reloads the game save", () => {
    expect(loadGameSave()).toEqual({ save: null, error: null })
    expect(storeGameSave(save())).toBe(true)
    expect(loadGameSave().save?.world.seed).toBe(3)
    clearGameSave()
    expect(loadGameSave().save).toBeNull()
  })

  it("reports an unreadable save without throwing", () => {
    saved.set(GAME_SAVE_KEY, "{not json")
    expect(loadGameSave()).toEqual({ save: null, error: "Saved game could not be read." })
    saved.set(GAME_SAVE_KEY, JSON.stringify({ version: 99 }))
    expect(loadGameSave().error).toMatch(/version/)
  })

  it("reads the saved seed from the resume cookie", () => {
    expect(resumeCookieSeed("15839")).toBe(15839)
    expect(resumeCookieSeed("")).toBeNull()
    expect(resumeCookieSeed(undefined)).toBeNull()
    expect(resumeCookieSeed("abc")).toBeNull()
    expect(resumeCookieSeed("-1")).toBeNull()
  })

  it("keeps display preferences separately and forgivingly", () => {
    expect(storeDisplaySettings({ ...DEFAULT_DISPLAY_SETTINGS, showTrees: false })).toBe(true)
    expect(loadDisplaySettings().showTrees).toBe(false)
    saved.set(DISPLAY_SETTINGS_KEY, JSON.stringify({ road: "far" }))
    expect(loadDisplaySettings()).toEqual({})
  })

  it("degrades when storage is blocked or absent", () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked") } })
    expect(loadGameSave()).toEqual({ save: null, error: null })
    expect(storeGameSave(save())).toBe(false)
    expect(loadDisplaySettings()).toEqual({})
    vi.stubGlobal("window", undefined)
    expect(storeGameSave(save())).toBe(false)
    expect(() => clearGameSave()).not.toThrow()
  })
})
