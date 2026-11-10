import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SAVE_VERSION, worldIdentity, type GameSave } from "./schema"
import { DEFAULT_WORLD_SETTINGS, DEFAULT_DISPLAY_SETTINGS } from "./settings"
import { clearGameSave, DISPLAY_SETTINGS_KEY, GAME_SAVE_KEY, loadDisplaySettings, loadGameSave, parseResumeCookie, storeDisplaySettings, storeGameSave, UNREADABLE_SAVE_KEY } from "./storage"

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
  settlement: { claimedBuildings: [], demolishedBuildings: [], resources: { gold: 1, wood: 1 }, deliveredWood: 0, spentWood: 0,
    shrineAdmission: 1, collectedAdmission: 0, collectedTrade: 0, paidWages: 0, grantedRenown: 0, structures: [] },
  simulation: { time: 0, treeModel: "sprites" as const, visits: 0, wood: 0, shrineGold: 0, tradeGold: 0, wagesPaid: 0, constructionWood: 0,
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

  it("keeps an unreadable save under its own key before anything can replace it", () => {
    expect(UNREADABLE_SAVE_KEY).toBe("pilgrimage.game.v1.unreadable")
    expect(storeGameSave(save())).toBe(true)
    expect(loadGameSave().save?.world.seed).toBe(3)
    expect(saved.has(UNREADABLE_SAVE_KEY)).toBe(false)

    saved.set(GAME_SAVE_KEY, "{not json")
    expect(loadGameSave().save).toBeNull()
    expect(saved.get(UNREADABLE_SAVE_KEY)).toBe("{not json")
    // A newer build's save is refused but kept too; the newest copy wins.
    const newer = JSON.stringify({ ...save(), version: SAVE_VERSION + 1 })
    saved.set(GAME_SAVE_KEY, newer)
    expect(loadGameSave().error).toMatch(/version/)
    expect(saved.get(UNREADABLE_SAVE_KEY)).toBe(newer)
    // The autosave then replaces the slot, never the copy.
    expect(storeGameSave(save())).toBe(true)
    expect(saved.get(UNREADABLE_SAVE_KEY)).toBe(newer)

    // A save read only in part is kept whole as well.
    const partial = JSON.stringify({ ...save(), simulation: { ...save().simulation, felled: [-1, 2] } })
    saved.set(GAME_SAVE_KEY, partial)
    expect(loadGameSave()).toMatchObject({ error: null, dropped: 1 })
    expect(saved.get(UNREADABLE_SAVE_KEY)).toBe(partial)
  })

  it("survives running out of space while keeping the unreadable copy", () => {
    saved.set(UNREADABLE_SAVE_KEY, "older")
    saved.set(GAME_SAVE_KEY, "{broken")
    let full = true
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { if (full) { full = false; throw new Error("QuotaExceededError") } saved.set(key, value) },
      removeItem: (key: string) => saved.delete(key),
    } })
    expect(loadGameSave().save).toBeNull()
    expect(saved.get(UNREADABLE_SAVE_KEY)).toBe("{broken")
    // When even the freed space is too little, the older copy is put back.
    vi.stubGlobal("window", { localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { if (value.length > 7) throw new Error("QuotaExceededError"); saved.set(key, value) },
      removeItem: (key: string) => saved.delete(key),
    } })
    saved.set(GAME_SAVE_KEY, "{much larger")
    expect(() => loadGameSave()).not.toThrow()
    expect(saved.get(UNREADABLE_SAVE_KEY)).toBe("{broken")
    expect(saved.get(GAME_SAVE_KEY)).toBe("{much larger")
  })

  it("reads the saved seed and zoom from the resume cookie", () => {
    expect(parseResumeCookie("15839")).toEqual({ seed: 15839, viewSize: null })
    expect(parseResumeCookie("15839:14")).toEqual({ seed: 15839, viewSize: 14 })
    expect(parseResumeCookie("15839:21.333333333333332")).toEqual({ seed: 15839, viewSize: 21.333333333333332 })
    expect(parseResumeCookie("15839:0")).toEqual({ seed: 15839, viewSize: null })
    expect(parseResumeCookie("")).toBeNull()
    expect(parseResumeCookie(undefined)).toBeNull()
    expect(parseResumeCookie("abc")).toBeNull()
    expect(parseResumeCookie("-1")).toBeNull()
    expect(parseResumeCookie("15839:x")).toBeNull()
  })

  it("marks the browser resumable with the saved seed and zoom", () => {
    const document = { cookie: "" }
    vi.stubGlobal("document", document)
    expect(storeGameSave(save())).toBe(true)
    expect(document.cookie).toMatch(/^pilgrimage\.resume=3:24; /)
    expect(parseResumeCookie(document.cookie.split(";")[0].split("=")[1])).toEqual({ seed: 3, viewSize: 24 })
    clearGameSave()
    expect(document.cookie).toMatch(/^pilgrimage\.resume=; .*max-age=0/)
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
