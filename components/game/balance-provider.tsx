"use client"

import { useEffect } from "react"
import { BALANCE_STORAGE_KEY, useBalanceStore } from "@/lib/game/balance-store"

/** Hydrate after SSR, then listen even while the player is in another tab. */
export function BalanceProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    useBalanceStore.getState().hydrate()
    const receive = (event: StorageEvent) => {
      if (
        (event.key === BALANCE_STORAGE_KEY || event.key === null) &&
        event.storageArea === window.localStorage
      ) {
        useBalanceStore.getState().receive(event.newValue)
      }
    }
    window.addEventListener("storage", receive)
    return () => window.removeEventListener("storage", receive)
  }, [])
  return children
}
