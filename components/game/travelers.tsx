"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { selectElement } from "@/lib/game/selection"
import { CharacterHitTarget, CharacterSelectionShadow } from "./character-selection"
import { useBalanceStore } from "@/lib/game/balance-store"
import { lumberCamps } from "@/lib/game/settlement"
import { useBuildStore } from "@/lib/game/build-store"
import type { Relic } from "@/lib/game/relic"
import type { TreePlacement } from "@/lib/game/trees/placement"
import type { GameMap } from "@/lib/game/map/types"
import { createSim, simRegistry, stepSim } from "@/lib/game/sim"
import type { Traveler } from "@/lib/game/travelers"
import { LINEAR_MOVEMENT, type MovementTuning, type WalkTuning } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"
import { playCharacterSound, stopCharacterSound } from "@/lib/game/character-audio"
import {
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
  travelerObjectId,
} from "@/lib/game/render/outline"

import {
  AWNING_NAME,
  TravelerFigure,
} from "./traveler-figure"

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
  /** Base walking speed in tiles per second; each traveler's pace scales it. */
  speed: number
  /** Swaps only the figure; identities, simulation and selection sounds stay shared. */
  characterModel?: CharacterModel
  /** Uniform size multiplier; leaves the sprite's foot anchor fixed. */
  characterScale?: number
  /** Animation frames per second, independent of movement pace. */
  characterFps?: number
  walkTuning?: WalkTuning
  movement?: MovementTuning
}) {
  const selection = useCameraStore((s) => s.selection)
  const resourceElapsed = useRef(0)
  const groupRefs = useRef<Array<THREE.Group | null>>([])

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
    sim.buildings = camps
    sim.shrineRenown = shrineRenown
    sim.balance = useBalanceStore.getState().balance
    sim.trees = trees
    const playback = useSimulationStore.getState()
    // Keep each tick bounded at faster speeds, including work and routing.
    if (!playback.paused) {
      for (let tick = 0; tick < playback.speed; tick++) {
        stepSim(sim, travelers, map, speed, Math.min(delta, 0.1), movement)
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
      const moving = moved > 1e-6
      if (moving) {
        const target = Math.atan2(dx, dz)
        const turn = Math.atan2(Math.sin(target - group.rotation.y), Math.cos(target - group.rotation.y))
        const blend = movement.pathEase === 0 ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) / (movement.pathEase * 0.18))
        group.rotation.y += turn * blend
      }
      group.userData.playbackRate = playback.paused ? 0 : playback.speed
      group.userData.distance = moved
      group.userData.moving = moving
      group.userData.initialized = true
      group.userData.phase = travelers[i].id * 0.137
      group.userData.heading = group.rotation.y

      if (travelers[i].type.id === "vendor") {
        // Face the direction of travel so the cart trails behind; hold the
        // last heading while parked or camped.
        const awning = group.getObjectByName(AWNING_NAME)
        if (awning) awning.visible = s.activity === "vending"
      }

      const logs = group.getObjectByName("carried-logs")
      if (logs) logs.visible = s.carrying > 0
      group.position.set(s.x, s.y, s.z)
      // Keep baked bodies and ground shadows at their authored proportions.
      // Camping/visiting already select the idle clip.
      group.scale.y = 1
      if (s.activity === "working") group.rotation.z = Math.sin(sim.time * 1800) * 0.12
      else group.rotation.z = 0
    }
  })

  if (!map.road || map.road.length < 2 || travelers.length === 0) return null

  return (
    <group>
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
            <TravelerFigure selected={selected} type={traveler.type} onClick={select} idColor={idColor}
              characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} />
            <group name="carried-logs" visible={false} position={[0, 0.35, 0.2]} rotation={[0, 0, Math.PI / 2]} onClick={select}>
              <mesh><cylinderGeometry args={[0.12, 0.12, 0.6, 6]} /><meshLambertMaterial color="#89613c" /></mesh>
              <mesh layers-mask={OUTLINE_ID_LAYER_MASK}>
                <cylinderGeometry args={[0.12, 0.12, 0.6, 6]} /><meshBasicMaterial color={idColor} toneMapped={false} />
              </mesh>
            </group>

            <CharacterHitTarget onClick={select} />
            {selected && <CharacterSelectionShadow map={map} />}
          </group>
        )
      })}
    </group>
  )
}
