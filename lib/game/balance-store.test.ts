import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEFAULT_BALANCE, exportBalance } from "./balance"
import { BALANCE_STORAGE_KEY, useBalanceStore } from "./balance-store"

let saved: Map<string, string>
beforeEach(() => {
  saved = new Map()
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => saved.set(key, value),
    },
  })
  useBalanceStore.setState({ balance: DEFAULT_BALANCE, ready: false, storageMessage: null })
})
afterEach(() => vi.unstubAllGlobals())

describe("saved balance", () => {
  it("hydrates saved tuning before a new settlement is created", () => {
    const balance = structuredClone(DEFAULT_BALANCE)
    balance.rules.startingGold = 987
    saved.set(BALANCE_STORAGE_KEY, exportBalance(balance))
    useBalanceStore.getState().hydrate()
    expect(useBalanceStore.getState().ready).toBe(true)
    expect(useBalanceStore.getState().balance.rules.startingGold).toBe(987)
  })
  it("saves one validated preset and rejects invalid edits without changing storage", () => {
    const balance = structuredClone(DEFAULT_BALANCE)
    balance.rules.residentWood = 7
    expect(useBalanceStore.getState().apply(balance)).toBeNull()
    const json = saved.get(BALANCE_STORAGE_KEY)
    balance.rules.incomeSeconds = 0
    expect(useBalanceStore.getState().apply(balance)).toBeTruthy()
    expect(saved.get(BALANCE_STORAGE_KEY)).toBe(json)
    expect(useBalanceStore.getState().balance.rules.incomeSeconds).toBe(10)
  })
  it("accepts valid external edits and retains current settings after corrupt updates", () => {
    const balance = structuredClone(DEFAULT_BALANCE)
    balance.buildings.garden.renown = 30
    useBalanceStore.getState().receive(exportBalance(balance))
    useBalanceStore.getState().receive("broken")
    expect(useBalanceStore.getState().balance.buildings.garden.renown).toBe(30)
    expect(useBalanceStore.getState().storageMessage).toMatch(/could not be loaded/)
    useBalanceStore.getState().receive(null)
    expect(useBalanceStore.getState().balance).toEqual(DEFAULT_BALANCE)
  })
  it("recovers from a corrupt saved preset and unavailable storage", () => {
    saved.set(BALANCE_STORAGE_KEY, "{bad")
    useBalanceStore.getState().hydrate()
    expect(useBalanceStore.getState().balance).toEqual(DEFAULT_BALANCE)
    expect(useBalanceStore.getState().ready).toBe(true)
    vi.stubGlobal("window", {
      get localStorage() {
        throw new Error("blocked")
      },
    })
    useBalanceStore.setState({ ready: false })
    useBalanceStore.getState().hydrate()
    expect(useBalanceStore.getState().ready).toBe(true)
    const before = useBalanceStore.getState().balance
    expect(useBalanceStore.getState().apply(DEFAULT_BALANCE)).toMatch(/Could not save/)
    expect(useBalanceStore.getState().balance).toBe(before)
  })
})
