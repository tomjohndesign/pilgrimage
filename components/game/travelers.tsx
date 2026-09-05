"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import { useBalanceStore } from "@/lib/game/balance-store"
import { lumberCamps } from "@/lib/game/settlement"
import { useBuildStore } from "@/lib/game/build-store"
import type { Relic } from "@/lib/game/relic"
import type { TreePlacement } from "@/lib/game/trees/placement"
import type { GameMap } from "@/lib/game/map/types"
import { createSim, simRegistry, stepSim } from "@/lib/game/sim"
import type { Traveler } from "@/lib/game/travelers"
import {
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
  travelerObjectId,
} from "@/lib/game/render/outline"

import {
  AWNING_NAME,
  BLOCK_HEIGHT,
  BLOCK_WIDTH,
  CART_BED,
  CART_OFFSET_Z,
  TravelerFigure,
} from "./traveler-figure"

/**
 * People on the road: placeholder blocks driven by the simulation in
 * lib/game/sim.ts — walking, camping in clearings, chasing vendors. Identity
 * comes from the travelers prop; all per-frame state lives in the sim, and this
 * component just copies positions out of it. Click a block to select it — the
 * HUD names it and shows its live stats. The figure itself lives in
 * traveler-figure.tsx so the character gallery can draw the same one.
 */

/** Campers fold down to this fraction of standing height. */
const CAMP_SCALE = 0.35

/** A click that dragged further than this many pixels is a pan, not a select. */
const CLICK_SLOP_PX = 6

export function Travelers({
  map,
  travelers,
  speed,
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

  useFrame((_, delta) => {
    // A background tab hands us a huge delta; clamp so nobody teleports.
    const build = useBuildStore.getState()
    sim.buildings = camps
    sim.shrineRenown = shrineRenown
    sim.balance = useBalanceStore.getState().balance
    sim.trees = trees
    stepSim(sim, travelers, map, speed, Math.min(delta, 0.1))
    resourceElapsed.current += delta
    if (build.resourceRevision !== sim.resourceRevision || resourceElapsed.current >= 0.25) {
      build.syncResources(sim, travelers)
      resourceElapsed.current = 0
    }

    for (let i = 0; i < travelers.length; i++) {
      const group = groupRefs.current[i]
      const s = sim.travelers.get(travelers[i].id)
      if (!group || !s) continue

      if (travelers[i].type.id === "vendor") {
        // Face the direction of travel so the cart trails behind; hold the
        // last heading while parked or camped.
        const dx = s.x - group.position.x
        const dz = s.z - group.position.z
        if (dx * dx + dz * dz > 1e-8) group.rotation.y = Math.atan2(dx, dz)
        const awning = group.getObjectByName(AWNING_NAME)
        if (awning) awning.visible = s.activity === "vending"
      }

      const logs = group.getObjectByName("carried-logs")
      if (logs) logs.visible = s.carrying > 0
      group.position.set(s.x, s.y, s.z)
      group.scale.y = s.activity === "camping" || s.activity === "visiting" ? CAMP_SCALE : 1
      if (s.activity === "working") group.rotation.z = Math.sin(sim.time * 1800) * 0.12
      else group.rotation.z = 0
    }
  })

  if (!map.road || map.road.length < 2 || travelers.length === 0) return null

  return (
    <group>
      {travelers.map((traveler, index) => {
        const selected = isSelected(selection, { kind: "traveler", id: traveler.id })
        const [r, g, b] = encodeObjectId(travelerObjectId(index))
        const select = (event: { delta: number; stopPropagation: () => void }) => {
          if (event.delta > CLICK_SLOP_PX || useBuildStore.getState().tool) return
          event.stopPropagation()
          useCameraStore.getState().select(selected ? null : { kind: "traveler", id: traveler.id })
        }
        return (
          <group
            key={traveler.id}
            ref={(node) => {
              groupRefs.current[index] = node
            }}
          >
            <TravelerFigure type={traveler.type} onClick={select} />
            <mesh name="carried-logs" visible={false} position={[0, 0.35, 0.2]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.12, 0.12, 0.6, 6]} />
              <meshLambertMaterial color="#89613c" />
            </mesh>

            {/* ID silhouettes for the outline pass; inherit the group's motion. */}
            <mesh position={[0, BLOCK_HEIGHT / 2, 0]} layers-mask={OUTLINE_ID_LAYER_MASK}>
              <boxGeometry args={[BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_WIDTH]} />
              <meshBasicMaterial color={new THREE.Color(r, g, b)} toneMapped={false} />
            </mesh>
            {traveler.type.id === "vendor" && (
              <mesh
                position={[0, 0.18, CART_OFFSET_Z]}
                layers-mask={OUTLINE_ID_LAYER_MASK}
              >
                <boxGeometry args={CART_BED} />
                <meshBasicMaterial color={new THREE.Color(r, g, b)} toneMapped={false} />
              </mesh>
            )}

            {selected && (
              <mesh position={[0, BLOCK_HEIGHT + 0.35, 0]}>
                <boxGeometry args={[0.2, 0.05, 0.2]} />
                <meshBasicMaterial color="#d8a93f" />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}
