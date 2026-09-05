"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { isSelected, useCameraStore } from "@/lib/game/camera-store"
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
  BLOCK_HEIGHT,
  CART_BED,
  CART_OFFSET_Z,
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

/** A click that dragged further than this many pixels is a pan, not a select. */
const CLICK_SLOP_PX = 6

export function Travelers({
  map,
  travelers,
  speed,
  characterModel = "callings",
  characterScale = 1,
  characterFps,
  walkTuning,
  movement = LINEAR_MOVEMENT,
}: {
  map: GameMap
  travelers: Traveler[]
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
  const groupRefs = useRef<Array<THREE.Group | null>>([])

  const sim = useMemo(() => createSim(travelers, map), [travelers, map])

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
    stepSim(sim, travelers, map, speed, Math.min(delta, 0.1), movement)

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

      group.position.set(s.x, s.y, s.z)
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
            <TravelerFigure type={traveler.type} onClick={select} outlineColor={[r, g, b]} characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} />

            {/* ID silhouettes for the outline pass; inherit the group's motion. */}
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
              <mesh position={[0, BLOCK_HEIGHT * characterScale + 0.35, 0]}>
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
