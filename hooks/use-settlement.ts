"use client"

import { constructionStage } from "@/lib/game/construction"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GameMap, TilePos } from "@/lib/game/map/types"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import { useBuildStore } from "@/lib/game/build-store"
import { collectIncome, createSettlement, purchaseStructure, creditTimber, creditAdmission, syncTimberSpending, settlementRenown } from "@/lib/game/settlement"

import { useSimulationStore } from "@/lib/game/simulation-store"
import { useBalanceStore } from "@/lib/game/balance-store"
import { BUILDING_PREVIEW, buildingPreviewBalance, buildingPreviewSettlement } from "@/lib/game/building-preview"

/** A generated world owns one economy. Cosmetic settings keep it; regeneration resets it. */
export function useSettlement(baseMap: GameMap | null, monks: Monk[], relic: Relic | null) {
  const paused = useSimulationStore((s) => s.paused)
  const simulationSpeed = useSimulationStore((s) => s.speed)
  const savedBalance = useBalanceStore((s) => s.balance)
  const balance = useMemo(() => BUILDING_PREVIEW ? buildingPreviewBalance(savedBalance) : savedBalance, [savedBalance])
  const ready = useBalanceStore((s) => s.ready)
  const world = ready ? baseMap : null
  const simulation = useBuildStore((s) => s.simulation)
  const wood = useBuildStore((s) => s.wood)
  const shrineGold = useBuildStore((s) => s.shrineGold)
  const visitCount = useBuildStore((s) => s.visits)
  const settlers = useBuildStore((s) => s.settlers)
  const sameWorld = !!world && simulation?.world.road === world.road
  const visits = sameWorld ? visitCount : 0
  const residents = useMemo(() => [...monks, ...(sameWorld ? settlers : [])], [monks, sameWorld, settlers])
  const balanceRef = useRef(balance)
  balanceRef.current = balance
  const [session, setSession] = useState(() => ({
    world,
    settlement: BUILDING_PREVIEW && world ? buildingPreviewSettlement(world, balance) : createSettlement(balance),
    buildType: null as string | null,
    message: "",
  }))
  if (session.world !== world) {
    setSession({ world, settlement: BUILDING_PREVIEW && world ? buildingPreviewSettlement(world, balance) : createSettlement(balance), buildType: null, message: "" })
  }

  // Workers own live progress. Publish only stage/completion changes to React.
  useEffect(() => {
    const structures = session.settlement.structures
    const stages = structures.map(constructionStage)
    const timer = setInterval(() => {
      setSession(current => {
        if (current.world !== world || current.settlement.structures !== structures) return current
        const next = structures.map(constructionStage)
        if (next.every((stage, i) => stage === stages[i])) return current
        const completed = structures.find((_, i) => next[i] === 3 && stages[i] !== 3)
        return { ...current, message: completed ? `${completed.label} completed.` : current.message,
          settlement: { ...current.settlement, structures: [...structures] } }
      })
    }, 250)
    return () => clearInterval(timer)
  }, [world, session.settlement.structures])

  const map = useMemo(
    () =>
      world
        ? { ...world, elevation: session.settlement.elevation ?? world.elevation, buildings: [...world.buildings.map(b => b.id === world.site?.hovelId
          ? { ...b, admissionFee: session.settlement.shrineAdmission } : b), ...session.settlement.structures] }
        : null,
    [world, session.settlement.elevation, session.settlement.structures, session.settlement.shrineAdmission],
  )

  useEffect(() => {
    useBuildStore.getState().setTool(session.buildType)
  }, [session.buildType, world])

  useEffect(() => {
    if (!sameWorld) return
    setSession((current) => {
      if (current.world !== world) return current
      const settlement = creditAdmission(creditTimber(current.settlement, wood), shrineGold)
      return settlement === current.settlement ? current : { ...current, settlement }
    })
  }, [sameWorld, wood, shrineGold, world])

  useEffect(() => {
    if (sameWorld && simulation) syncTimberSpending(simulation, session.settlement.spentWood)
  }, [sameWorld, simulation, session.settlement.spentWood])

  const renown = useMemo(() => map && relic
    ? settlementRenown(map, residents, [relic], balance, visits) : null,
    [map, residents, relic, balance, visits])

  useEffect(() => {
    if (!world || paused) return
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
    }, balance.rules.incomeSeconds * 1000 / simulationSpeed)
    return () => clearInterval(timer)
  }, [world, residents.length, balance.rules.incomeSeconds, paused, simulationSpeed])

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape")
        setSession((current) => ({ ...current, buildType: null, message: "" }))
    }
    window.addEventListener("keydown", cancel)
    return () => window.removeEventListener("keydown", cancel)
  }, [])

  const chooseBuild = useCallback((buildType: string | null) =>
    setSession((current) => ({ ...current, buildType, message: "" })), [])
  const setShrineAdmission = useCallback((fee: number) => {
    if (!Number.isSafeInteger(fee) || fee < 0) return
    setSession(current => ({ ...current, settlement: { ...current.settlement, shrineAdmission: fee } }))
  }, [])
  const place = (at: TilePos) => {
    const rotation = useBuildStore.getState().rotation
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
        rotation,
      )
      if (BUILDING_PREVIEW && !result.error) {
        result.settlement = { ...result.settlement, structures: result.settlement.structures.map(building =>
          building.construction ? { ...building, construction: { ...building.construction, work: building.construction.required } } : building) }
      }
      return {
        ...current,
        settlement: result.settlement,
        buildType: result.error ? current.buildType : null,
        message: result.error ?? (BUILDING_PREVIEW ? "Building placed." : "Construction planned. Idle residents will build it."),
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
    setShrineAdmission,
    place,
  }
}
