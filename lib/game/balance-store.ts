"use client"

import { create } from "zustand"
import {
  DEFAULT_BALANCE,
  exportBalance,
  importBalance,
  validateBalance,
  type GameBalance,
} from "./balance"

export const BALANCE_STORAGE_KEY = "pilgrimage.game-balance.v1"

interface BalanceState {
  balance: GameBalance
  ready: boolean
  storageMessage: string | null
  hydrate: () => void
  apply: (input: unknown) => string | null
  receive: (json: string | null) => void
}

/** Saved per browser origin, with storage events keeping open game tabs in sync. */
export const useBalanceStore = create<BalanceState>((set, get) => ({
  balance: DEFAULT_BALANCE,
  ready: false,
  storageMessage: null,
  hydrate: () => {
    if (get().ready) return
    try {
      const saved = window.localStorage.getItem(BALANCE_STORAGE_KEY)
      get().receive(saved)
    } catch {
      set({ ready: true, storageMessage: "Browser storage is unavailable. Using default tuning." })
    }
  },
  apply: (input) => {
    const result = validateBalance(input)
    if (result.error !== null) return result.error
    try {
      window.localStorage.setItem(BALANCE_STORAGE_KEY, exportBalance(result.balance))
    } catch {
      return "Could not save to browser storage. Tuning has not changed; export a preset to keep your edits."
    }
    set({ balance: result.balance, ready: true, storageMessage: null })
    return null
  },
  receive: (json) => {
    if (json === null) {
      set({ balance: DEFAULT_BALANCE, ready: true, storageMessage: null })
      return
    }
    const result = importBalance(json)
    if (result.error !== null) {
      set({ ready: true, storageMessage: `Saved tuning could not be loaded. ${result.error}` })
      return
    }
    set({ balance: result.balance, ready: true, storageMessage: null })
  },
}))
