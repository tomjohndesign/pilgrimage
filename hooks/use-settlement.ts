"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { GameMap, TilePos } from "@/lib/game/map/types"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import { collectIncome, createSettlement, purchaseStructure } from "@/lib/game/settlement"

import { useBalanceStore } from "@/lib/game/balance-store"

/** A generated world owns one economy. Cosmetic settings keep it; regeneration resets it. */
export function useSettlement(baseMap: GameMap | null, monks: Monk[], relic: Relic | null) {
  const balance = useBalanceStore((s) => s.balance)
  const ready = useBalanceStore((s) => s.ready)
  const world = ready ? baseMap : null
  const balanceRef = useRef(balance)
  balanceRef.current = balance
  const [session, setSession] = useState(() => ({
    world,
    settlement: createSettlement(balance),
    buildType: null as string | null,
    message: "",
  }))
  if (session.world !== world) {
    setSession({ world, settlement: createSettlement(balance), buildType: null, message: "" })
  }

  const map = useMemo(
    () =>
      world
        ? { ...world, buildings: [...world.buildings, ...session.settlement.structures] }
        : null,
    [world, session.settlement.structures],
  )

  useEffect(() => {
    if (!world) return
    const timer = setInterval(() => {
      if (document.hidden) return
      setSession((current) =>
        current.world === world
          ? {
              ...current,
              settlement: collectIncome(current.settlement, monks.length, balanceRef.current),
            }
          : current,
      )
    }, balance.rules.incomeSeconds * 1000)
    return () => clearInterval(timer)
  }, [world, monks.length, balance.rules.incomeSeconds])

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        setSession((current) => ({ ...current, buildType: null, message: "" }))
    }
    window.addEventListener("keydown", cancel)
    return () => window.removeEventListener("keydown", cancel)
  }, [])

  const chooseBuild = (buildType: string | null) =>
    setSession((current) => ({ ...current, buildType, message: "" }))
  const place = (at: TilePos) => {
    setSession((current) => {
      if (!baseMap || !relic || current.world !== baseMap || !current.buildType) return current
      const result = purchaseStructure(
        current.settlement,
        baseMap,
        monks,
        [relic],
        current.buildType,
        at,
        balanceRef.current,
      )
      return {
        ...current,
        settlement: result.settlement,
        buildType: result.error ? current.buildType : null,
        message: result.error ?? "Built.",
      }
    })
  }

  return {
    map,
    balance,
    settlement: session.settlement,
    buildType: session.buildType,
    message: session.message,
    chooseBuild,
    place,
  }
}
