"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import type { GameMap, TilePos } from "@/lib/game/map/types"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import { useBuildStore } from "@/lib/game/build-store"
import { collectIncome, createSettlement, purchaseStructure, creditTimber, syncTimberSpending, settlementRenown } from "@/lib/game/settlement"

import { useBalanceStore } from "@/lib/game/balance-store"

/** A generated world owns one economy. Cosmetic settings keep it; regeneration resets it. */
export function useSettlement(baseMap: GameMap | null, monks: Monk[], relic: Relic | null) {
  const balance = useBalanceStore((s) => s.balance)
  const ready = useBalanceStore((s) => s.ready)
  const world = ready ? baseMap : null
  const simulation = useBuildStore((s) => s.simulation)
  const wood = useBuildStore((s) => s.wood)
  const visitCount = useBuildStore((s) => s.visits)
  const settlers = useBuildStore((s) => s.settlers)
  const sameWorld = !!world && simulation?.world.road === world.road
  const visits = sameWorld ? visitCount : 0
  const residents = useMemo(() => [...monks, ...(sameWorld ? settlers : [])], [monks, sameWorld, settlers])
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
    useBuildStore.getState().setTool(session.buildType)
  }, [session.buildType, world])

  useEffect(() => {
    if (!sameWorld) return
    setSession((current) => {
      if (current.world !== world) return current
      const settlement = creditTimber(current.settlement, wood)
      return settlement === current.settlement ? current : { ...current, settlement }
    })
  }, [sameWorld, wood, world])

  useEffect(() => {
    if (sameWorld && simulation) syncTimberSpending(simulation, session.settlement.spentWood)
  }, [sameWorld, simulation, session.settlement.spentWood])

  const renown = useMemo(() => map && relic
    ? settlementRenown(map, residents, [relic], balance, visits) : null,
    [map, residents, relic, balance, visits])

  useEffect(() => {
    if (!world) return
    const timer = setInterval(() => {
      if (document.hidden) return
      setSession((current) =>
        current.world === world
          ? {
              ...current,
              settlement: collectIncome(current.settlement, residents.length, balanceRef.current),
            }
          : current,
      )
    }, balance.rules.incomeSeconds * 1000)
    return () => clearInterval(timer)
  }, [world, residents.length, balance.rules.incomeSeconds])

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
        residents,
        [relic],
        current.buildType,
        at,
        balanceRef.current,
        visits,
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
    renown,
    residents,
    visits,
    balance,
    settlement: session.settlement,
    buildType: session.buildType,
    message: session.message,
    chooseBuild,
    place,
  }
}
