"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
import type { GameMap } from "@/lib/game/map/types"
import { createSim, simRegistry, stepSim } from "@/lib/game/sim"
import type { Traveler } from "@/lib/game/travelers"
import {
  encodeObjectId,
  OUTLINE_ID_LAYER_MASK,
  travelerObjectId,
} from "@/lib/game/render/outline"

/**
 * People on the road: placeholder blocks driven by the simulation in
 * lib/game/sim.ts — walking, camping in clearings, chasing vendors. Identity
 * comes from the travelers prop; all per-frame state lives in the sim, and this
 * component just copies positions out of it. Click a block to select it — the
 * HUD names it and shows its live stats.
 */

const BLOCK_WIDTH = 0.3
const BLOCK_HEIGHT = 0.55

/** Campers fold down to this fraction of standing height. */
const CAMP_SCALE = 0.35

/** A click that dragged further than this many pixels is a pan, not a select. */
const CLICK_SLOP_PX = 6

/**
 * The vendor's cart trails behind on the group's local -z; the group is rotated
 * to face the direction of travel so the cart follows properly around bends.
 */
const CART_BED: [number, number, number] = [0.42, 0.16, 0.5]
const CART_OFFSET_Z = -0.5

/**
 * Cart pieces plus the shop awning. The awning is always mounted and toggled
 * via `visible` from useFrame (by its name), because the vending state changes
 * in the sim at frame rate, outside React.
 */
export const AWNING_NAME = "vendor-awning"

function VendorCart({ onClick }: { onClick: (event: { delta: number; stopPropagation: () => void }) => void }) {
  return (
    <group position={[0, 0, CART_OFFSET_Z]}>
      {/* Unnamed on purpose: travelerScreenPoints counts "traveler" meshes 1:1. */}
      <mesh position={[0, 0.18, 0]} onClick={onClick}>
        <boxGeometry args={CART_BED} />
        <meshLambertMaterial color="#6f4f2a" />
      </mesh>
      {/* Wine and victuals riding on the bed. */}
      <mesh position={[0, 0.33, 0]}>
        <boxGeometry args={[0.28, 0.14, 0.34]} />
        <meshLambertMaterial color="#8a2f2f" />
      </mesh>
      {[-0.26, 0.26].map((x) => (
        <mesh key={x} position={[x, 0.12, 0]}>
          <boxGeometry args={[0.06, 0.24, 0.24]} />
          <meshLambertMaterial color="#3a2c1a" />
        </mesh>
      ))}
      <mesh name={AWNING_NAME} position={[0, 0.75, 0.05]} visible={false}>
        <boxGeometry args={[0.62, 0.04, 0.72]} />
        <meshLambertMaterial color="#d8d0b8" />
      </mesh>
    </group>
  )
}

export function Travelers({
  map,
  travelers,
  speed,
}: {
  map: GameMap
  travelers: Traveler[]
  /** Base walking speed in tiles per second; each traveler's pace scales it. */
  speed: number
}) {
  const selection = useCameraStore((s) => s.selection)
  const groupRefs = useRef<Array<THREE.Group | null>>([])

  const sim = useMemo(() => createSim(travelers, map), [travelers, map])

  // Publish the running sim so the HUD's traveler panel can poll live stats.
  useEffect(() => {
    simRegistry.current = sim
    return () => {
      if (simRegistry.current === sim) simRegistry.current = null
    }
  }, [sim])

  useFrame((_, delta) => {
    // A background tab hands us a huge delta; clamp so nobody teleports.
    stepSim(sim, travelers, map, speed, Math.min(delta, 0.1))

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

      group.position.set(s.x, s.y, s.z)
      group.scale.y = s.activity === "camping" ? CAMP_SCALE : 1
    }
  })

  if (!map.road || map.road.length < 2 || travelers.length === 0) return null

  return (
    <group>
      {travelers.map((traveler, index) => {
        const selected = isSelected(selection, { kind: "traveler", id: traveler.id })
        const [r, g, b] = encodeObjectId(travelerObjectId(index))
        const select = (event: { delta: number; stopPropagation: () => void }) => {
          if (event.delta > CLICK_SLOP_PX) return
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
            <mesh name="traveler" position={[0, BLOCK_HEIGHT / 2, 0]} onClick={select}>
              <boxGeometry args={[BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_WIDTH]} />
              <meshLambertMaterial color={traveler.type.color} />
            </mesh>

            {traveler.type.id === "vendor" && <VendorCart onClick={select} />}

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
