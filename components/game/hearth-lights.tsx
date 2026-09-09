"use client"

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"

import { sceneryDetail } from "@/lib/game/render/scenery-detail"

import { isWorldVisible } from "@/lib/game/render/visibility"

const MAX_HEARTH_LIGHTS = 16
const HearthContext = createContext<{ register: (light: THREE.PointLight) => () => void } | null>(null)

/** Local lights otherwise enter every terrain vertex shader, even when their
 * building is miles outside the view. Reuse a bounded set near the view centre;
 * its size stays constant during camera movement to avoid shader recompiles. */
export function HearthLights({ children, enabled = true }: { children: ReactNode; enabled?: boolean }) {
  const root = useRef<THREE.Group>(null)
  const sources = useMemo(() => new Set<THREE.PointLight>(), [])
  const [count, setCount] = useState(0)
  const context = useMemo(() => ({ register: (light: THREE.PointLight) => {
    sources.add(light); setCount(Math.min(MAX_HEARTH_LIGHTS, sources.size))
    return () => { sources.delete(light); setCount(Math.min(MAX_HEARTH_LIGHTS, sources.size)) }
  } }), [sources])
  const slots = useRef<Array<THREE.PointLight | null>>([])
  const scratch = useMemo(() => ({ point: new THREE.Vector3(), projected: new THREE.Vector3(),
    matrix: new THREE.Matrix4(), frustum: new THREE.Frustum(), sphere: new THREE.Sphere(),
    candidates: [] as Array<{ source: THREE.PointLight; distance: number }> }), [])
  useFrame(({ camera, scene }) => {
    if (!root.current) return
    root.current.visible = enabled && sceneryDetail(scene) === 0
    if (!root.current.visible) return
    const { point, projected, matrix, frustum, sphere, candidates } = scratch
    frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
    candidates.length = 0
    for (const source of sources) {
      if (source.parent && !isWorldVisible(source.parent)) continue
      source.getWorldPosition(point)
      sphere.center.copy(point); sphere.radius = source.distance
      if (!frustum.intersectsSphere(sphere)) continue
      projected.copy(point).project(camera)
      candidates.push({ source, distance: projected.x * projected.x + projected.y * projected.y })
    }
    candidates.sort((a, b) => a.distance - b.distance)
    for (let i = 0; i < slots.current.length; i++) {
      const light = slots.current[i]
      if (!light) continue
      const source = candidates[i]?.source
      light.intensity = source?.intensity ?? 0
      if (source) {
        source.getWorldPosition(light.position)
        light.color.copy(source.color); light.distance = source.distance; light.decay = source.decay
      }
    }
  }, .5)
  return <HearthContext.Provider value={context}>
    {children}
    <group ref={root} name="hearth-light-pool">{Array.from({ length: count }, (_, i) =>
      <pointLight key={i} ref={light => { slots.current[i] = light }} intensity={0} />)}</group>
  </HearthContext.Provider>
}

/** Standalone building previews retain their original individual light. */
export function HearthLight({ lightRef, position }: { lightRef: RefObject<THREE.PointLight | null>; position: [number, number, number] }) {
  const pool = useContext(HearthContext)
  useEffect(() => { if (pool && lightRef.current) return pool.register(lightRef.current) }, [pool, lightRef])
  return <pointLight ref={lightRef} visible={!pool} position={position} color="#ffae58" intensity={.65} distance={1.8} decay={2} />
}
