"use client"

import { useLayoutEffect, useMemo, useRef } from "react"
import { createPortal, useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { surfaceHeight } from "@/lib/game/map/bridges"
import { worldToTileX, worldToTileZ, type GameMap } from "@/lib/game/map/types"
import { SELECTION_COLOR } from "@/lib/game/selection"
import { SELECTED_CHARACTER_LAYER } from "@/lib/game/render/outline"
import type { FigureClickHandler } from "./traveler-figure"

/** A generous click volume shared by monks and travelers, without visible geometry. */
export function CharacterHitTarget({ onClick }: { onClick: FigureClickHandler }) {
  return <mesh name="character-hit-target" position={[0, 0.4, 0]} onClick={onClick}>
    <boxGeometry args={[0.8, 1, 0.8]} />
    <meshBasicMaterial visible={false} />
  </mesh>
}

/** A soft ground glow that stays level during work, camping, and flight. */
export function CharacterSelectionShadow({ map, flying = false }: { map: GameMap; flying?: boolean }) {
  const anchor = useRef<THREE.Group>(null)
  const shadow = useRef<THREE.Mesh>(null)
  const scene = useThree((s) => s.scene)
  const position = useMemo(() => new THREE.Vector3(), [])
  const uniforms = useMemo(() => ({ uColor: { value: new THREE.Color(SELECTION_COLOR) } }), [])
  useLayoutEffect(() => {
    const tagged: Array<{ object: THREE.Object3D; mask: number }> = []
    const include = (object: THREE.Object3D) => {
      tagged.push({ object, mask: object.layers.mask })
      object.layers.enable(SELECTED_CHARACTER_LAYER)
    }
    // Use the actual animated figure, including its cart and carried items.
    // The click volume and flat ID copies must never enlarge its silhouette.
    anchor.current?.parent?.traverse((object) => {
      if (object instanceof THREE.Mesh && object.layers.isEnabled(0) && object.name !== "character-hit-target") include(object)
    })
    scene.traverse((object) => {
      if (object instanceof THREE.Light) include(object)
    })
    return () => {
      for (const { object, mask } of tagged) object.layers.mask = mask
    }
  }, [scene, flying])
  useFrame(() => {
    if (!anchor.current || !shadow.current) return
    anchor.current.getWorldPosition(position)
    const y = flying ? surfaceHeight(map, worldToTileX(map, position.x), worldToTileZ(map, position.z)) : position.y
    shadow.current.position.set(position.x, y + 0.035, position.z)
  })
  return <>
    <group ref={anchor} />
    {createPortal(<mesh ref={shadow} name="character-selection-shadow" rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <planeGeometry args={[1, 1]} />
      <shaderMaterial transparent depthWrite={false} toneMapped={false} uniforms={uniforms}
        vertexShader={`varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
        fragmentShader={`uniform vec3 uColor; varying vec2 vUv;
          void main() {
            float radius = length(vUv - 0.5) * 2.0;
            float alpha = 0.3 * (1.0 - smoothstep(0.0, 1.0, radius));
            gl_FragColor = vec4(uColor, alpha);
          }`} />
    </mesh>, scene)}
  </>
}
