"use client"

import type * as THREE from "three"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"

import type { TravelerTypeDef } from "@/lib/game/travelers"

/**
 * The visible body of one traveler: a coloured block in the calling's colour,
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

function FigureBox({ name, position, args, color, idColor, onClick }: {
  name?: string
  position: [number, number, number]
  args: [number, number, number]
  color: string
  idColor?: THREE.Color
  onClick?: FigureClickHandler
}) {
  return <group position={position} onClick={onClick}>
    <mesh name={name}><boxGeometry args={args} /><meshLambertMaterial color={color} /></mesh>
    {idColor && <mesh layers-mask={OUTLINE_ID_LAYER_MASK}>
      <boxGeometry args={args} /><meshBasicMaterial color={idColor} toneMapped={false} />
    </mesh>}
  </group>
}

function VendorCart({ onClick, awning, idColor }: { onClick?: FigureClickHandler; awning: boolean; idColor?: THREE.Color }) {
  return (
    <group position={[0, 0, CART_OFFSET_Z]}>
      <FigureBox position={[0, 0.18, 0]} args={CART_BED} color="#6f4f2a" idColor={idColor} onClick={onClick} />
      <FigureBox position={[0, 0.33, 0]} args={[0.28, 0.14, 0.34]} color="#8a2f2f" idColor={idColor} onClick={onClick} />
      {[-0.26, 0.26].map((x) => (
        <FigureBox key={x} position={[x, 0.12, 0]} args={[0.06, 0.24, 0.24]} color="#3a2c1a" idColor={idColor} onClick={onClick} />
      ))}
      <group name={AWNING_NAME} visible={awning}>
        <FigureBox position={[0, 0.75, 0.05]} args={[0.62, 0.04, 0.72]} color="#d8d0b8" idColor={idColor} onClick={onClick} />
      </group>
    </group>
  )
}

export function TravelerFigure({
  type,
  onClick,
  idColor,
  /** Initial awning state for vendors; the sim flips it live on the road. */
  awning = false,
}: {
  type: TravelerTypeDef
  idColor?: THREE.Color
  onClick?: FigureClickHandler
  awning?: boolean
}) {
  return (
    <>
      <FigureBox name="traveler" position={[0, BLOCK_HEIGHT / 2, 0]} args={[BLOCK_WIDTH, BLOCK_HEIGHT, BLOCK_WIDTH]} color={type.color} idColor={idColor} onClick={onClick} />
      {type.id === "vendor" && <VendorCart onClick={onClick} awning={awning} idColor={idColor} />}
    </>
  )
}
