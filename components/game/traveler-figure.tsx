"use client"

import type { TravelerTypeDef } from "@/lib/game/travelers"
import { Suspense } from "react"
import { CharacterSprite } from "./character-sprite"
import type { WalkTuning } from "@/lib/game/motion"
import type { CharacterModel } from "@/lib/game/character-assets"

/**
 * The visible body of one traveler: a tiny eight-direction sprite,
 * plus the cart for vendors. Shared between the road (components/game/
 * travelers.tsx) and the /assets/characters gallery, so the gallery shows the
 * exact figure the player meets in game.
 */

export const BLOCK_WIDTH = 0.3
export const BLOCK_HEIGHT = 0.55

/**
 * The vendor's cart trails behind on the group's local -z; the group is rotated
 * to face the direction of travel so the cart follows properly around bends.
 */
export const CART_BED: [number, number, number] = [0.42, 0.16, 0.5]
export const CART_OFFSET_Z = -0.5

/**
 * Cart pieces plus the shop awning. The awning is always mounted and toggled
 * via `visible` from useFrame (by its name), because the vending state changes
 * in the sim at frame rate, outside React.
 */
export const AWNING_NAME = "vendor-awning"

export type FigureClickHandler = (event: { delta: number; stopPropagation: () => void }) => void

function VendorCart({ onClick, awning }: { onClick?: FigureClickHandler; awning: boolean }) {
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
      <mesh name={AWNING_NAME} position={[0, 0.75, 0.05]} visible={awning}>
        <boxGeometry args={[0.62, 0.04, 0.72]} />
        <meshLambertMaterial color="#d8d0b8" />
      </mesh>
    </group>
  )
}

export function TravelerFigure({
  type,
  onClick,
  /** Initial awning state for vendors; the sim flips it live on the road. */
  awning = false,
  outlineColor,
  characterModel = "callings",
  characterScale = 1,
  characterFps,
  walkTuning,
}: {
  type: TravelerTypeDef
  onClick?: FigureClickHandler
  awning?: boolean
  outlineColor?: [number, number, number]
  characterModel?: CharacterModel
  /** Uniform size multiplier; leaves the sprite's foot anchor fixed. */
  characterScale?: number
  /** Animation frames per second, independent of movement pace. */
  characterFps?: number
  walkTuning?: WalkTuning
}) {
  return (
    <>
      <Suspense fallback={null}>
        <CharacterSprite type={type.id} onClick={onClick} outlineColor={outlineColor} characterModel={characterModel} characterScale={characterScale} characterFps={characterFps} walkTuning={walkTuning} />
      </Suspense>
      {type.id === "vendor" && <VendorCart onClick={onClick} awning={awning} />}
    </>
  )
}
