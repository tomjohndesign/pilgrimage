"use client"

import { useEffect, useMemo, useRef, type RefObject } from "react"
import { createPortal, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { OUTLINE_ID_LAYER_MASK, SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import { RIG_TO_WORLD, type Cargo, type Puller } from "@/lib/game/transport/assets"
import { acquireStallGeometry } from "@/lib/game/transport/stall-geometry"
import type { FigureClickHandler } from "./traveler-figure"

/** The deployed cart and its ground display belong to the world, while the
 * keeper remains a sprite. Use the existing scenery pass and shared selection ID. */
export function VendorStall({ cart, cargo, puller, characterScale, awning, selected, outlineColor, onClick }: {
  cart: RefObject<THREE.Group | null>; cargo: Cargo; puller: Puller; characterScale: number
  awning: boolean; selected: boolean; outlineColor?: [number, number, number]; onClick?: FigureClickHandler
}) {
  const scene = useThree(state => state.scene)
  const root = useRef<THREE.Group>(null), body = useRef<THREE.Mesh>(null), ids = useRef<THREE.Mesh>(null)
  const frames = useRef<ReturnType<typeof acquireStallGeometry> | null>(null)
  const materials = useMemo(() => [
    new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(...outlineColor ?? [0, 0, 0]), toneMapped: false, side: THREE.DoubleSide }),
  ], [outlineColor?.[0], outlineColor?.[1], outlineColor?.[2]])
  useEffect(() => () => materials.forEach(material => material.dispose()), [materials])
  useEffect(() => () => { frames.current?.dispose(); frames.current = null }, [cargo, puller])
  useFrame(() => {
    const group = root.current, wagon = cart.current
    if (!group || !body.current || !wagon) return
    const data = wagon.userData
    group.visible = isWorldVisible(wagon) && (data.activity === undefined ? awning
      : ["vending", "openingShop", "packingShop"].includes(data.activity))
    if (!group.visible) return
    const geometry = (frames.current ??= acquireStallGeometry(cargo, puller === "hand")).frame(data.shopProgress ?? 1)
    body.current.geometry = geometry
    if (ids.current) ids.current.geometry = geometry
    wagon.getWorldPosition(group.position)
    group.rotation.y = data.heading ?? 0
    const unit = RIG_TO_WORLD * characterScale
    group.scale.set(unit * (data.shopSide ?? 1), unit, unit)
  })
  // A scene portal keeps this out of the enclosing PixelCharacters root, so
  // scenery pixels, ground projection and occlusion follow the map exactly.
  return createPortal(<group ref={root} visible={false}>
    <mesh ref={body} name="vendor-stall" onClick={onClick} dispose={null} material={materials[0]}
      layers-mask={selected ? 1 | (1 << SELECTED_CHARACTER_LAYER) : 1} />
    {outlineColor && <mesh ref={ids} name="vendor-stall-ids" layers-mask={OUTLINE_ID_LAYER_MASK} dispose={null} material={materials[1]} />}
  </group>, scene)
}
