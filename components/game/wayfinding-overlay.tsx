"use client"

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import * as THREE from "three"
import { useCameraStore } from "@/lib/game/camera-store"
import { surfaceHeight } from "@/lib/game/map/bridges"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { wayfindingFields, wayfindingJourneys } from "@/lib/game/wayfinding-debug"
import { wayfindingNetwork, type WayfindingNode } from "@/lib/game/wayfinding-nodes"
import { useWayfindingStore } from "@/lib/game/wayfinding-settings"
import { workerDestinationField, workerNavigationVersion } from "@/lib/game/worker-route-memory"

function DirectionNodes({ map, nodes }: { map: GameMap; nodes: WayfindingNode[] }) {
  const ref = useRef<THREE.InstancedMesh>(null)
  const selected = useWayfindingStore(s => s.selectedNodeId)
  useLayoutEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const matrix = new THREE.Matrix4(), color = new THREE.Color()
    for (const [i, node] of nodes.entries()) {
      const size = node.id === selected ? .36 : .2
      matrix.makeScale(size, .06, size)
      matrix.setPosition(tileToWorldX(map, node.tile.x), surfaceHeight(map, node.tile.x, node.tile.z) + .23, tileToWorldZ(map, node.tile.z))
      mesh.setMatrixAt(i, matrix)
      mesh.setColorAt(i, color.set(node.id === selected ? "#ffffff" : node.kind === "enclave" ? "#d99bff" : node.kind === "entrance" ? "#ffb058" : "#ffe077"))
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.computeBoundingSphere()
  }, [map, nodes, selected])
  if (!nodes.length) return null
  return <instancedMesh ref={ref} args={[undefined, undefined, nodes.length]} name="wayfinding-nodes" renderOrder={25}
    onClick={event => { event.stopPropagation(); const node = nodes[event.instanceId ?? -1]; if (node) useWayfindingStore.getState().selectNode(node.id) }}>
    <boxGeometry args={[1, 1, 1]} /><meshBasicMaterial depthTest={false} depthWrite={false} />
  </instancedMesh>
}

/** Separate from all character/building visibility groups, including picking. */
export function WayfindingOverlay({ map }: { map: GameMap }) {
  const selection = useCameraStore(s => s.selection), settings = useWayfindingStore(s => s.settings)
  const selectedNodeId = useWayfindingStore(s => s.selectedNodeId)
  const [tick, setTick] = useState(0)
  useEffect(() => { const timer = setInterval(() => setTick(t => t + 1), 250); return () => clearInterval(timer) }, [])
  const version = workerNavigationVersion(map)
  const network = useMemo(() => wayfindingNetwork(map), [map, version])
  const selectedNode = network.nodes.find(n => n.id === selectedNodeId)
  const fields = useMemo(() => !settings.showField ? [] : selectedNode ? [workerDestinationField(map, selectedNode.tile, settings.travelBudget)]
    : selection?.kind === "building" ? wayfindingFields(map, selection.id) : [], [map, selection, selectedNode, settings, version])
  const geometry = useMemo(() => {
    const positions: number[] = [], colors: number[] = []
    const line = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, color: THREE.Color) => {
      positions.push(a.x, a.y + .08, a.z, b.x, b.y + .08, b.z)
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b)
    }
    const cells = new Map<number, { distance: number; next: number; budget: number }>()
    for (const field of fields) for (const [cell, distance] of field.distance) {
      if (distance < (cells.get(cell)?.distance ?? Infinity)) cells.set(cell, { distance, next: field.next.get(cell)!, budget: field.budget })
    }
    for (const [cell, { distance, next, budget }] of cells) {
      const x = cell % map.width, z = Math.floor(cell / map.width)
      const from = { x: tileToWorldX(map, x), z: tileToWorldZ(map, z), y: surfaceHeight(map, x, z) }
      const color = new THREE.Color().setHSL(.33 * (1 - distance / Math.max(1, budget)), .85, .55)
      if (next === -1) continue
      const dx = next % map.width - x, dz = Math.floor(next / map.width) - z
      const to = { ...from, x: from.x + dx * .35, z: from.z + dz * .35 }
      line({ ...from, x: from.x - dx * .2, z: from.z - dz * .2 }, to, color)
      for (const sign of [-1, 1]) line(to, { ...from, x: to.x - dx * .15 + dz * .12 * sign, z: to.z - dz * .15 - dx * .12 * sign }, color)
    }
    if (settings.showNetwork) for (const path of network.paths) {
      const color = new THREE.Color(path.kind === "enclave" ? "#d99bff" : "#c7a44a")
      const points = path.tiles.map(p => ({ x: tileToWorldX(map, p.x), z: tileToWorldZ(map, p.z), y: surfaceHeight(map, p.x, p.z) }))
      for (let i = 1; i < points.length; i++) line(points[i - 1], points[i], color)
    }
    const result = new THREE.BufferGeometry()
    result.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    result.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
    return result
  }, [fields, network, map, settings.showNetwork])
  const routes = useMemo(() => {
    void tick
    const positions: number[] = [], endpoints: number[] = [], bends: number[] = [], seen = new Set<string>()
    if (settings.showRoutes) for (const journey of wayfindingJourneys(map, selection, settings.routeScope)) {
      for (let i = 1; i < journey.route.length; i++) {
        const a = journey.route[i - 1], b = journey.route[i]
        // Shared corridors are drawn once even when many residents use them.
        const key = `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.z.toFixed(2)}:${b.x.toFixed(2)},${b.y.toFixed(2)},${b.z.toFixed(2)}`
        if (!seen.has(key)) { positions.push(a.x, a.y + .14, a.z, b.x, b.y + .14, b.z); seen.add(key) }
        const c = journey.route[i + 1]
        if (settings.showNodes && c && Math.abs((b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x)) > .02) {
          for (const [ax, az, bx, bz] of [[-.06, -.06, .06, -.06], [.06, -.06, .06, .06], [.06, .06, -.06, .06], [-.06, .06, -.06, -.06]])
            bends.push(b.x + ax, b.y + .16, b.z + az, b.x + bx, b.y + .16, b.z + bz)
        }
      }
      if (journey.route.length > 1) {
        const p = journey.route.at(-1)!
        for (const sign of [-1, 1]) endpoints.push(p.x - .2, p.y + .16, p.z - .2 * sign, p.x + .2, p.y + .16, p.z + .2 * sign)
      }
    }
    const route = new THREE.BufferGeometry(), ends = new THREE.BufferGeometry(), turns = new THREE.BufferGeometry()
    route.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    ends.setAttribute("position", new THREE.Float32BufferAttribute(endpoints, 3))
    turns.setAttribute("position", new THREE.Float32BufferAttribute(bends, 3))
    return { route, ends, turns }
  }, [map, selection, settings, tick])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => { routes.route.dispose(); routes.ends.dispose(); routes.turns.dispose() }, [routes])
  return <group name="wayfinding-overlay">
    <lineSegments name="wayfinding-network" geometry={geometry} renderOrder={20} raycast={() => {}}><lineBasicMaterial vertexColors transparent opacity={.7} depthTest={false} depthWrite={false} /></lineSegments>
    <lineSegments name="wayfinding-paths" geometry={routes.route} renderOrder={21} raycast={() => {}}><lineBasicMaterial color="#4ce5ed" depthTest={false} depthWrite={false} /></lineSegments>
    <lineSegments geometry={routes.ends} renderOrder={22} raycast={() => {}}><lineBasicMaterial color="#ffcf56" depthTest={false} depthWrite={false} /></lineSegments>
    <lineSegments geometry={routes.turns} renderOrder={23} raycast={() => {}}><lineBasicMaterial color="#4ce5ed" depthTest={false} depthWrite={false} /></lineSegments>
    {settings.showNodes && <DirectionNodes map={map} nodes={network.nodes} />}
  </group>
}
