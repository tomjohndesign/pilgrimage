"use client"

import { processionRegistry } from "@/lib/game/relic-procession"
import { walkingSurface } from "@/lib/game/map/walking-surface"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { travelerAppearance } from "@/lib/game/base-person/population"
import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { selectElement } from "@/lib/game/selection"
import { CharacterHitTarget, CharacterSelectionShadow } from "./character-selection"
import { useBalanceStore } from "@/lib/game/balance-store"
import { lumberCamps } from "@/lib/game/settlement"
import { useBuildStore } from "@/lib/game/build-store"
import type { Relic } from "@/lib/game/relic"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { tileAt, worldToTileX, worldToTileZ, type GameMap } from "@/lib/game/map/types"
import { createSim, simRegistry, stepSim } from "@/lib/game/sim"
import { relicHeading } from "@/lib/game/shrine-visit"
import type { Traveler } from "@/lib/game/travelers"
import { LINEAR_MOVEMENT, type MovementTuning, type WalkTuning } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"
import { playCharacterSound, stopCharacterSound } from "@/lib/game/character-audio"
import {
  encodeObjectId,
  travelerObjectId,
} from "@/lib/game/render/outline"

import { BASE_CHARACTER_SCALE } from "@/lib/game/base-person/gait"
import { WoodLog } from "./wood-log"
import { PixelCharacters } from "@/components/pixel-canvas"
import { TravelerFigure } from "./traveler-figure"
import { AdmissionEffects } from "./admission-effects"
import { cartLoadout, SHOP_SECONDS } from "@/lib/game/transport/assets"

/**
 * People on the road: directional walking sprites driven by the simulation in
 * lib/game/sim.ts — walking, camping in clearings, chasing vendors. Identity
 * comes from the travelers prop; all per-frame state lives in the sim, and this
 * component copies position, heading and motion out of it. Select a person — the
 * HUD names it and shows its live stats. The figure itself lives in
 * traveler-figure.tsx so the character gallery can draw the same one.
 */


export function Travelers({
  map,
  travelers,
  speed,
  speedScales,
  characterModel = "callings",
  characterScale = 1,
  characterFps,
  walkTuning,
  movement = LINEAR_MOVEMENT,
  relic,
  trees,
  shrineRenown,
}: {
  map: GameMap
  travelers: Traveler[]
  relic: Relic
  trees: TreePlacement[]
  shrineRenown: number
  /** Reference walking speed in tiles per second, scaled by size and personal pace. */
  speed: number
  speedScales?: ReadonlyMap<number, number>
  /** Swaps only the figure; identities, simulation and selection sounds stay shared. */
  characterModel?: CharacterModel
  /** Uniform size multiplier; leaves the sprite's foot anchor fixed. */
  characterScale?: number
  /** Animation frames per second, independent of movement pace. */
  characterFps?: number
  walkTuning?: WalkTuning
  movement?: MovementTuning
}) {
  const appearances = useMemo(() => travelers.map(t => travelerAppearance(map.seed ?? 0, t.id)), [travelers, map.seed])
  const selection = useCameraStore((s) => s.selection)
  const resourceElapsed = useRef(0)
  const groupRefs = useRef<Array<THREE.Group | null>>([])
  const logRefs = useRef<Array<THREE.Group | null>>([])

  const sim = useMemo(() => createSim([], map, [], relic.stats), [map.road, relic])
  useEffect(() => {
    const fresh = createSim(travelers, map, [], relic.stats)
    for (const [id, traveler] of fresh.travelers) {
      if (!sim.travelers.has(id)) sim.travelers.set(id, traveler)
    }
    for (const id of sim.travelers.keys()) {
      if (!fresh.travelers.has(id)) sim.travelers.delete(id)
    }
  }, [sim, travelers, map, relic])

  const camps = useMemo(() => lumberCamps(map), [map])

  // Publish the running sim so the HUD's traveler panel can poll live stats.
  useEffect(() => {
    simRegistry.current = sim
    return () => {
      if (simRegistry.current === sim) simRegistry.current = null
    }
  }, [sim])

  useEffect(() => {
    // Synchronous subscription keeps playback in the user gesture and also
    // covers selections originating in other controls, not only the canvas.
    const unsubscribe = useCameraStore.subscribe((state, previous) => {
      const next = state.selection
      if (!next || next.kind !== "traveler" || isSelected(previous.selection, next)) return
      const traveler = travelers.find((t) => t.id === next.id)
      if (traveler) void playCharacterSound(traveler.type.id, traveler.id)
    })
    return () => { unsubscribe(); stopCharacterSound() }
  }, [travelers])

  useFrame((_, delta) => {
    // A background tab hands us a huge delta; clamp so nobody teleports.
    const build = useBuildStore.getState()
    sim.procession = processionRegistry.current
    sim.buildings = camps
    sim.shrineRenown = shrineRenown
    sim.balance = useBalanceStore.getState().balance
    sim.trees = trees
    const playback = useSimulationStore.getState()
    // Keep each tick bounded at faster speeds, including work and routing.
    if (!playback.paused) {
      for (let tick = 0; tick < playback.speed; tick++) {
        stepSim(sim, travelers, map, speed, Math.min(delta, 0.1), movement, speedScales, characterScale)
      }
    }
    resourceElapsed.current += delta
    if (build.resourceRevision !== sim.resourceRevision || resourceElapsed.current >= 0.25) {
      build.syncResources(sim, travelers)
      resourceElapsed.current = 0
    }

    for (let i = 0; i < travelers.length; i++) {
      const group = groupRefs.current[i]
      const s = sim.travelers.get(travelers[i].id)
      if (!group || !s) continue

      const dx = s.x - group.position.x
      const dz = s.z - group.position.z
      const distance = Math.hypot(dx, dz)
      const moved = group.userData.initialized === true && distance < 2 ? distance : 0
      const moving = playback.paused ? group.userData.moving === true : moved > 1e-6
      if (moving && !playback.paused) {
        const target = Math.atan2(dx, dz)
        const turn = Math.atan2(Math.sin(target - group.rotation.y), Math.cos(target - group.rotation.y))
        const blend = movement.pathEase === 0 ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) / (movement.pathEase * 0.18))
        group.rotation.y += turn * blend
      }
      const workTree = s.tree === null ? undefined : trees[s.tree]
      if (s.activity === "visiting" && !s.praying) {
        group.rotation.y = relicHeading(map, s) ?? group.rotation.y
      }
      group.userData.workTree = workTree
      if (!playback.paused && !moving && workTree && (s.activity === "working" || s.activity === "gathering")) {
        group.rotation.y = Math.atan2(workTree.x - s.x, workTree.z - s.z)
      }
      group.userData.playbackRate = playback.paused ? 0 : playback.speed
      group.userData.motionReset = group.userData.initialized !== true || distance >= 2
      group.userData.distance = playback.paused ? 0 : moved
      group.userData.moving = moving
      if (!playback.paused && s.praying && sim.procession?.position) {
        group.rotation.y = Math.atan2(sim.procession.position.x - s.x, sim.procession.position.z - s.z)
      }
      group.userData.activity = s.praying ? "praying" : s.activity
      group.userData.routineActivity = s.activity
      group.userData.shrineParking = s.shrineParking
      group.userData.cartProgress = s.convoy && s.activity === "walking" && !s.track && !s.shrineParking ? s.progress : undefined
      group.userData.cartDirection = s.direction
      group.userData.cartManeuver = false
      group.userData.cartPose = s.shrineParking?.pose
      group.userData.animalHeading = undefined
      group.userData.reversing = false
      group.userData.keeperTime = s.keeperTime ?? 0
      group.userData.keeperAudience = s.activity === "vending" && travelers.some(other => {
        const person = sim.travelers.get(other.id)
        return other.id !== s.id && person && Math.hypot(person.x - s.x, person.z - s.z) < 3
      })
      group.userData.shopHeading = s.stallRoute?.heading
      group.userData.shopSide = s.stallRoute?.side ?? 1
      group.userData.shopProgress = s.activity === "openingShop" ? 1 - s.timer / SHOP_SECONDS : s.activity === "packingShop" ? s.timer / SHOP_SECONDS : s.activity === "vending" ? 1 : 0
      group.userData.pasture = s.pasture
      const pastureTerrain = s.pasture ? tileAt(map, worldToTileX(map, s.pasture.x), worldToTileZ(map, s.pasture.z)) : null
      group.userData.pastureY = s.pasture ? walkingSurface(map, s.pasture.x, s.pasture.z).height : s.y
      group.userData.pastureGrass = pastureTerrain === "grass" || pastureTerrain === "clearing"
      group.userData.carrying = s.carrying
      group.userData.initialized = true
      group.userData.phase = travelers[i].id * 0.137
      group.userData.heading = group.rotation.y

      const y = walkingSurface(map, s.x, s.z).height
      group.position.set(s.x, y, s.z)
      // Keep baked bodies at their authored proportions.
      group.scale.y = 1
      group.rotation.z = 0
      const logs = logRefs.current[i]
      if (logs) {
        logs.visible = s.carrying > 0 && !s.praying
        logs.position.copy(group.position)
        logs.quaternion.copy(group.quaternion)
      }
    }
  }, -3)

  if (!map.road || map.road.length < 2 || travelers.length === 0) return null

  return (
    <group>
      <PixelCharacters>
        <AdmissionEffects sim={sim} characterScale={characterScale} />
        {travelers.map((traveler, index) => {
          const selected = isSelected(selection, { kind: "traveler", id: traveler.id })
          const idColor = new THREE.Color(...encodeObjectId(travelerObjectId(index)))
          const select = (event: { delta: number; stopPropagation: () => void }) => selectElement({ kind: "traveler", id: traveler.id }, event)
          return (
            <group
              key={traveler.id}
              ref={(node) => {
                groupRefs.current[index] = node
              }}
            >
              <TravelerFigure map={map} age={traveler.attributes.age} {...cartLoadout(traveler.id)} appearance={appearances[index]} selected={selected} type={traveler.type} onClick={select} idColor={idColor}
                characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} />
              <CharacterHitTarget onClick={select} />
              {selected && <CharacterSelectionShadow map={map} />}
            </group>
          )
        })}
      </PixelCharacters>
      {/* Geometry shares the camp's world pixel grid; only baked people use the character pass. */}
      {travelers.map((traveler, index) => {
        const scale = characterScale * (characterModel === "base" ? appearances[index]?.scale ?? 1 : 1)
        const idColor = new THREE.Color(...encodeObjectId(travelerObjectId(index)))
        return <group key={traveler.id} name="carried-logs" visible={false}
          ref={(node) => { logRefs.current[index] = node }}
          onClick={(event) => selectElement({ kind: "traveler", id: traveler.id }, event)}>
          <group position={[0, 0.35 * scale / BASE_CHARACTER_SCALE, 0.2 * scale / BASE_CHARACTER_SCALE]} rotation={[0, 0, Math.PI / 2]}>
            <WoodLog idColor={idColor} characterScale={scale} />
          </group>
        </group>
      })}
    </group>
  )
}
