"use client"

import { enclaveHousing } from "@/lib/game/housing"
import { constructionStage } from "@/lib/game/construction"
import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { GameMap, TilePos } from "@/lib/game/map/types"
import type { Monk } from "@/lib/game/monks"
import type { Relic } from "@/lib/game/relic"
import { useBuildStore } from "@/lib/game/build-store"
import { claimTownBuildings, settlementMap, createSettlement, purchaseStructure, creditTimber, creditAdmission, creditTrade, payWages, syncWages, syncTimberSpending, settlementRenown, grantResources, grantRenown, completeConstruction, type Resources } from "@/lib/game/settlement"

import { useBalanceStore } from "@/lib/game/balance-store"
import { BUILDING_PREVIEW, buildingPreviewBalance, buildingPreviewSettlement } from "@/lib/game/building-preview"
import type { SettlementSave } from "@/lib/game/save/schema"
import { restoreSettlement } from "@/lib/game/save/settlement"

/**
 * A generated world owns one economy. Cosmetic settings keep it; regeneration
 * resets it. A save for the same world seeds the economy instead of a fresh one.
 * The master builder cheat finishes every site the moment it is planned.
 */
export function useSettlement(baseMap: GameMap | null, monks: Monk[], relic: Relic | null, restore: SettlementSave | null = null, masterBuilder = false) {
  const savedBalance = useBalanceStore((s) => s.balance)
  const balance = useMemo(() => BUILDING_PREVIEW ? buildingPreviewBalance(savedBalance) : savedBalance, [savedBalance])
  const ready = useBalanceStore((s) => s.ready)
  const world = ready ? baseMap : null
  const simulation = useBuildStore((s) => s.simulation)
  const wood = useBuildStore((s) => s.wood)
  const shrineGold = useBuildStore((s) => s.shrineGold)
  const tradeGold = useBuildStore((s) => s.tradeGold)
  const wagesPaid = useBuildStore((s) => s.wagesPaid)
  const visitCount = useBuildStore((s) => s.visits)
  const settlers = useBuildStore((s) => s.settlers)
  const workforce = useBuildStore((s) => s.workers)
  const sameWorld = !!world && simulation?.world.road === world.road
  const visits = sameWorld ? visitCount : 0
  const residents = useMemo(() => [...monks, ...(sameWorld ? settlers : [])], [monks, sameWorld, settlers])
  const balanceRef = useRef(balance)
  balanceRef.current = balance
  const openSettlement = (world: GameMap | null) => BUILDING_PREVIEW && world ? buildingPreviewSettlement(world, balance)
    : world && restore ? restoreSettlement(world, restore) : createSettlement(balance)
  const [session, setSession] = useState(() => ({
    world,
    settlement: openSettlement(world),
    buildType: null as string | null,
    message: "",
  }))
  if (session.world !== world) {
    setSession({ world, settlement: openSettlement(world), buildType: null, message: "" })
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
        ? settlementMap(world, session.settlement)
        : null,
    [world, session.settlement.elevation, session.settlement.structures, session.settlement.claimedBuildings],
  )

  useEffect(() => {
    if (!world) return
    setSession(current => {
      if (current.world !== world) return current
      const settlement = claimTownBuildings(current.settlement, world, balance)
      return settlement === current.settlement ? current : { ...current, settlement,
        message: "Roadside buildings have joined your settlement." }
    })
  }, [world, map, balance])

  useEffect(() => {
    useBuildStore.getState().setTool(session.buildType)
  }, [session.buildType, world])

  useEffect(() => {
    if (!sameWorld) return
    setSession((current) => {
      if (current.world !== world) return current
      const settlement = payWages(creditTrade(creditAdmission(creditTimber(current.settlement, wood), shrineGold), tradeGold), wagesPaid)
      return settlement === current.settlement ? current : { ...current, settlement }
    })
  }, [sameWorld, wood, shrineGold, tradeGold, wagesPaid, world])

  useEffect(() => {
    if (sameWorld && simulation) syncTimberSpending(simulation, session.settlement.spentWood)
  }, [sameWorld, simulation, session.settlement.spentWood])

  // The payroll may only draw on gold the treasury actually holds.
  useEffect(() => {
    if (sameWorld && simulation) syncWages(simulation, session.settlement)
  }, [sameWorld, simulation, session.settlement])

  // Sites already under way finish when the cheat is switched on; later sites finish at purchase.
  const instantBuild = BUILDING_PREVIEW || masterBuilder
  useEffect(() => {
    if (!instantBuild) return
    setSession(current => {
      const settlement = completeConstruction(current.settlement)
      return settlement === current.settlement ? current : { ...current, settlement }
    })
  }, [instantBuild, session.settlement.structures])

  const granted = session.settlement.grantedRenown
  const renown = useMemo(() => map && relic
    ? settlementRenown(map, residents, [relic], balance, visits, granted) : null,
    [map, residents, relic, balance, visits, granted])

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
  const place = (at: TilePos) => {
    const rotation = useBuildStore.getState().rotation
    // Placement renders several nearby scenery blocks. Let React yield between
    // them so camera/input updates remain responsive while the site appears.
    startTransition(() => setSession((current) => {
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
      return {
        ...current,
        settlement: instantBuild ? completeConstruction(result.settlement) : result.settlement,
        buildType: result.error ? current.buildType : null,
        message: result.error ?? (instantBuild ? "Building placed." : "Construction planned. The enclave will raise it."),
      }
    }))
  }
  /** Cheat codes: the treasury and renown gifts apply to the current world only. */
  const grant = useCallback((gift: Partial<Resources>) =>
    setSession(current => ({ ...current, settlement: grantResources(current.settlement, gift) })), [])
  const bless = useCallback((renown: number) =>
    setSession(current => ({ ...current, settlement: grantRenown(current.settlement, renown) })), [])

  return {
    map,
    renown,
    residents,
    housing: map ? enclaveHousing(map, residents.length - monks.length, monks.length) : null,
    visits,
    /** Settlers on the payroll; every one of them draws the daily wage. */
    workers: sameWorld ? workforce : 0,
    balance,
    settlement: session.settlement,
    buildType: session.buildType,
    message: session.message,
    chooseBuild,
    place,
    grant,
    bless,
  }
}
