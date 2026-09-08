"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import * as THREE from "three"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { RELIC_TABLE_TOP } from "@/lib/game/building-art/early-geometry"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"

const SIZE = 0.16
export const RELIC_DISPLAY_HEIGHT = .125 + SIZE / 2 + .01
export const RELIC_TABLE_DISPLAY_HEIGHT = RELIC_TABLE_TOP + SIZE / 2 + .02
const PULSE_SECONDS = 3.2

/** Hidden copies must not catch clicks at the table or on another monk. */
function relicRaycast(this: THREE.Mesh, raycaster: THREE.Raycaster, intersections: THREE.Intersection[]) {
  for (let object: THREE.Object3D | null = this; object; object = object.parent) if (!object.visible) return
  THREE.Mesh.prototype.raycast.call(this, raycaster, intersections)
}

/** The same relic, warm light and slow pulse in the game and building previews. */
export function RelicDisplay({ color = "#ece2c8", idColor, onClick, height = RELIC_DISPLAY_HEIGHT, groundGlow = true, trayWidth = 0 }: {
  height?: number; groundGlow?: boolean; trayWidth?: number
  color?: string; idColor?: THREE.Color; onClick?: (event: ThreeEvent<MouseEvent>) => void
}) {
  const effects = useRef<THREE.Group>(null)
  const core = useRef<THREE.MeshStandardMaterial>(null)
  const halo = useRef<THREE.SpriteMaterial>(null)
  const aura = useRef<THREE.Sprite>(null)
  const pool = useRef<THREE.MeshBasicMaterial>(null)
  const light = useRef<THREE.PointLight>(null)
  const { invalidate } = useThree()
  const glow = useMemo(() => {
    const size = 64, data = new Uint8Array(size * size * 4)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const radius = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1)
      const at = (y * size + x) * 4
      data[at] = data[at + 1] = data[at + 2] = 255
      data[at + 3] = Math.round(Math.pow(Math.max(0, 1 - radius), 2) * 255)
    }
    const texture = new THREE.DataTexture(data, size, size)
    texture.magFilter = texture.minFilter = THREE.LinearFilter
    texture.needsUpdate = true
    return texture
  }, [])
  useEffect(() => () => glow.dispose(), [glow])
  useFrame(({ clock, scene }) => {
    if (!effects.current) return
    effects.current.visible = sceneryDetail(scene) === 0
    if (!effects.current.visible || !isWorldVisible(effects.current.parent)) {
      if (core.current) core.current.emissiveIntensity = 1
      return
    }
    const pulse = (1 + Math.sin(clock.elapsedTime * Math.PI * 2 / PULSE_SECONDS)) / 2
    if (core.current) core.current.emissiveIntensity = .65 + pulse * 1.35
    if (halo.current) halo.current.opacity = .42 + pulse * .38
    if (aura.current) aura.current.scale.setScalar(.68 + pulse * .2)
    if (pool.current) pool.current.opacity = .12 + pulse * .17
    if (light.current) light.current.intensity = 1.1 + pulse * 2.1
    // Previews render on demand; only the mounted relic keeps requesting frames.
    invalidate()
  })
  return <group name="relic-display">
    {trayWidth > 0 && <group position={[0, .02, 0]}>
      <mesh raycast={relicRaycast} onClick={onClick}><boxGeometry args={[trayWidth, .04, .18]} /><meshStandardMaterial color="#a9823b" roughness={.7} /></mesh>
      {idColor && <mesh layers-mask={OUTLINE_ID_LAYER_MASK}><boxGeometry args={[trayWidth, .04, .18]} /><meshBasicMaterial color={idColor} toneMapped={false} /></mesh>}
    </group>}
    <group position={[0, height, 0]} rotation={[0, Math.PI / 4, 0]}>
      <mesh name="relic" raycast={relicRaycast} onClick={onClick}>
        <boxGeometry args={[SIZE, SIZE, SIZE]} />
        <meshStandardMaterial ref={core} color={color} emissive="#ffd98a" emissiveIntensity={1} roughness={.55} />
      </mesh>
      {/* A small cross on the reliquary lid remains legible from every angle. */}
      <group position={[0, SIZE / 2 + .003, 0]}>
        {([[.022, .008, .11], [.078, .008, .02]] as const).map((size, i) => <mesh key={i} position={[0, 0, i ? -.015 : 0]} raycast={relicRaycast} onClick={onClick}>
          <boxGeometry args={[...size]} /><meshBasicMaterial color="#a9823b" />
        </mesh>)}
      </group>
      {idColor && <mesh layers-mask={OUTLINE_ID_LAYER_MASK}>
        <boxGeometry args={[SIZE, SIZE, SIZE]} /><meshBasicMaterial color={idColor} toneMapped={false} />
      </mesh>}
    </group>
    <group ref={effects} name="relic-effects"><sprite name="relic-aura" ref={aura} position={[0, height, 0]} scale={.78} raycast={() => {}}>
      <spriteMaterial ref={halo} map={glow} color="#ffe3a0" transparent opacity={.6} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </sprite>
    {groundGlow && <mesh position={[0, .084, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}>
      <planeGeometry args={[1.6, 1.6]} />
      <meshBasicMaterial ref={pool} map={glow} color="#e8c16c" transparent opacity={.2} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
    </mesh>}
    <pointLight name="relic-light" ref={light} position={[0, height + .18, 0]} color="#ffd98a" intensity={2} distance={3} decay={2} /></group>
  </group>
}
