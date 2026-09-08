"use client"

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { PixelWorld } from "@/components/pixel-canvas"
import { buildingBatchCell, buildingSurfaceMaterial, mergedBuildingBlock, type BuildingBatchSource } from "@/lib/game/render/building-batch"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import { sceneryDetail } from "@/lib/game/render/scenery-detail"

const Context = createContext<{ material: THREE.MeshLambertMaterial; register: (source: BuildingBatchSource) => () => void } | null>(null)
export const useBuildingBatches = () => useContext(Context)
export const buildingBatchControl = { enabled: true }

/** Static cells draw many authored buildings together; selected cutaways retain
 * their individual meshes. Sources remain present for the original raycasts. */
export function BuildingBatches({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null)
  const registry = useMemo(() => ({ sources: new Set<BuildingBatchSource>(), revision: 0 }), [])
  const shading = useMemo(() => ({ value: 1 }), [])
  const materials = useMemo(() => ({ body: buildingSurfaceMaterial(shading),
    ids: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false }) }), [shading])
  const context = useMemo(() => ({ material: materials.body, register: (source: BuildingBatchSource) => {
    source.body.updateWorldMatrix(true, false)
    registry.sources.add(source); registry.revision++
    return () => { registry.sources.delete(source); registry.revision++; source.body.visible = source.ids.visible = true; delete source.body.userData.batchedPickTarget }
  } }), [registry, materials])
  const state = useMemo(() => ({ revision: -1, cells: new Map<string, { sources: BuildingBatchSource[];
    geometry: ReturnType<typeof mergedBuildingBlock>; body: THREE.Mesh; ids: THREE.Mesh }>() }), [])
  useFrame(({ scene }) => {
    if (!root.current) return
    if (state.revision !== registry.revision) {
      const groups = new Map<string, BuildingBatchSource[]>()
      for (const source of registry.sources) {
        const key = buildingBatchCell(source), group = groups.get(key) ?? []
        group.push(source); groups.set(key, group)
      }
      for (const [key, cell] of state.cells) if (!groups.has(key)) {
        root.current.remove(cell.body, cell.ids); cell.geometry.dispose(); state.cells.delete(key)
      }
      for (const [key, sources] of groups) {
        const previous = state.cells.get(key)
        if (previous && previous.sources.length === sources.length && previous.sources.every((source, i) => source === sources[i])) continue
        if (previous) { root.current.remove(previous.body, previous.ids); previous.geometry.dispose() }
        const geometry = mergedBuildingBlock(sources)
        const body = new THREE.Mesh(geometry.body[0], materials.body), ids = new THREE.Mesh(geometry.ids[0], materials.ids)
        body.name = "building-block-surfaces"; ids.name = "building-block-ids"; ids.layers.mask = OUTLINE_ID_LAYER_MASK
        body.raycast = ids.raycast = () => {}
        body.matrixAutoUpdate = ids.matrixAutoUpdate = false
        root.current.add(body, ids); state.cells.set(key, { sources, geometry, body, ids })
      }
      state.revision = registry.revision
    }
    for (const source of registry.sources) {
      source.body.visible = source.ids.visible = !buildingBatchControl.enabled
      source.body.userData.batchedPickTarget = buildingBatchControl.enabled
    }
    root.current.visible = buildingBatchControl.enabled
    const detail = sceneryDetail(scene)
    shading.value = detail === 0 ? 1 : 0
    for (const cell of state.cells.values()) {
      cell.body.geometry = cell.geometry.body[detail]; cell.ids.geometry = cell.geometry.ids[detail]
    }
  }, .65)
  useEffect(() => () => {
    for (const source of registry.sources) { source.body.visible = source.ids.visible = true; delete source.body.userData.batchedPickTarget }
    for (const cell of state.cells.values()) cell.geometry.dispose()
    state.cells.clear(); materials.body.dispose(); materials.ids.dispose()
  }, [registry, state, materials])
  return <Context.Provider value={context}>{children}<PixelWorld><group name="building-blocks" ref={root} /></PixelWorld></Context.Provider>
}
