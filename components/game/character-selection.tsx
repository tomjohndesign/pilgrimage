"use client"

import { useEffect, useLayoutEffect, useRef } from "react"
import { useThree } from "@react-three/fiber"
import * as THREE from "three"
import { prioritizePeople } from "@/lib/game/selection"
import { SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

/**
 * Clicks pick the person under the pointer before the scenery in front of them,
 * so a walker stays reachable through the crowns and walls that hide them.
 * Mounted once per scene; every monk and traveler group marks itself with
 * `markPerson`.
 */
export function PersonPicking() {
  const setEvents = useThree((s) => s.setEvents)
  useEffect(() => {
    setEvents({ filter: prioritizePeople })
    return () => setEvents({ filter: undefined })
  }, [setEvents])
  return null
}

/** A generous click volume shared by monks and travelers, without visible geometry. */
export function CharacterHitTarget({ onClick }: { onClick: FigureClickHandler }) {
  return <mesh name="character-hit-target" position={[0, 0.4, 0]} onClick={onClick}>
    <boxGeometry args={[0.8, 1, 0.8]} />
    <meshBasicMaterial visible={false} />
  </mesh>
}

/** Include the animated figure and carried items in the selection outline. */
export function CharacterSelectionOutline({ flying = false }: { flying?: boolean }) {
  const anchor = useRef<THREE.Group>(null)
  const scene = useThree((s) => s.scene)
  useLayoutEffect(() => {
    const tagged: Array<{ object: THREE.Object3D; mask: number }> = []
    const include = (object: THREE.Object3D) => {
      tagged.push({ object, mask: object.layers.mask })
      object.layers.enable(SELECTED_CHARACTER_LAYER)
    }
    // Use the actual animated figure, including its cart and carried items.
    // Sprites manage their own layer so selection also works after async loading.
    // The click volume and flat ID copies must never enlarge its silhouette.
    anchor.current?.parent?.traverse((object) => {
      if ((object instanceof THREE.Mesh || object instanceof THREE.Sprite) && object.layers.isEnabled(0) && object.name !== "character-hit-target") include(object)
    })
    scene.traverse((object) => {
      if (object instanceof THREE.Light) include(object)
    })
    return () => {
      for (const { object, mask } of tagged) object.layers.mask = mask
    }
  }, [scene, flying])
  return <group ref={anchor} />
}
