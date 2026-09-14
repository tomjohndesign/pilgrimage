"use client"

import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { useCameraStore } from "@/lib/game/camera-store"
import { surfaceHeight } from "@/lib/game/map/bridges"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { wayfindingFields, wayfindingJourneys } from "@/lib/game/wayfinding-debug"
import { useWayfindingStore } from "@/lib/game/wayfinding-settings"
import { workerNavigationVersion } from "@/lib/game/worker-route-memory"

export function WayfindingOverlay({ map }: { map: GameMap }) {
  const selection = useCameraStore(s => s.selection), settings = useWayfindingStore(s => s.settings)
  const [tick, setTick] = useState(0)
  useEffect(() => { const timer = setInterval(() => setTick(t => t + 1), 200); return () => clearInterval(timer) }, [])
  const version = workerNavigationVersion(map)
  const fields = useMemo(() => settings.showField && selection?.kind === "building" ? wayfindingFields(map, selection.id) : [], [map, selection, settings, version])
  const geometry = useMemo(() => {
    const positions: number[] = [], colors: number[] = []
    const line = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, color: THREE.Color) => {
      positions.push(a.x, a.y + .08, a.z, b.x, b.y + .08, b.z)
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
    for (const field of fields) for (const [cell, distance] of field.distance) {
      const next = field.next.get(cell)!
      const x = cell % map.width, z = Math.floor(cell / map.width)
      const from = { x: tileToWorldX(map, x), z: tileToWorldZ(map, z), y: surfaceHeight(map, x, z) }
      const color = new THREE.Color().setHSL(.33 * (1 - distance / Math.max(1, field.budget)), .85, .55)
      if (next === -1) continue
      const dx = next % map.width - x, dz = Math.floor(next / map.width) - z
      const to = { ...from, x: from.x + dx * .35, z: from.z + dz * .35 }
      line({ ...from, x: from.x - dx * .2, z: from.z - dz * .2 }, to, color)
      for (const sign of [-1, 1]) line(to, { ...from, x: to.x - dx * .15 + dz * .12 * sign, z: to.z - dz * .15 - dx * .12 * sign }, color)
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    result.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    return result
  }, [fields, map])
  const routes = useMemo(() => {
    void tick
    const positions: number[] = [], endpoints: number[] = []
    if (settings.showRoutes) for (const journey of wayfindingJourneys(map, selection)) {
      for (let i = 1; i < journey.route.length; i++) {
        const a = journey.route[i - 1], b = journey.route[i]
        positions.push(a.x, a.y + .14, a.z, b.x, b.y + .14, b.z)
      }
      if (journey.route.length > 1) {
        const p = journey.route.at(-1)!
        for (const sign of [-1, 1]) endpoints.push(p.x - .2, p.y + .16, p.z - .2 * sign, p.x + .2, p.y + .16, p.z + .2 * sign)
      }
    }
    const route = new THREE.BufferGeometry(), ends = new THREE.BufferGeometry()
    route.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    ends.setAttribute("position", new THREE.Float32BufferAttribute(endpoints, 3))
    return { route, ends }
  }, [map, selection, settings, tick])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => { routes.route.dispose(); routes.ends.dispose() }, [routes])
  return <group>
    <lineSegments geometry={geometry} renderOrder={20} raycast={() => {}}><lineBasicMaterial vertexColors transparent opacity={.7} depthTest={false} depthWrite={false} /></lineSegments>
    <lineSegments geometry={routes.route} renderOrder={21} raycast={() => {}}><lineBasicMaterial color="#4ce5ed" depthTest={false} depthWrite={false} /></lineSegments>
    <lineSegments geometry={routes.ends} renderOrder={22} raycast={() => {}}><lineBasicMaterial color="#ffcf56" depthTest={false} depthWrite={false} /></lineSegments>
  </group>
}
