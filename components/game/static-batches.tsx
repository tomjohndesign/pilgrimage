"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { cullStaticBlocks, staticInstanceRevision, staticInstanceSources } from "@/lib/game/render/static-blocks"
import { StaticInstanceBatch, staticInstanceKey } from "@/lib/game/render/static-instances"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { GuardedFrustum } from "@/lib/game/render/guarded-frustum"
import { scenerySourceVisible, sceneryDetail, sceneryZooming, updateSceneryDetail } from "@/lib/game/render/scenery-detail"
import { frameQuality, updateFrameQuality } from "@/lib/game/render/frame-quality"
import { crowdRenderStatus } from "@/lib/game/render/crowd-budget"
import { useCameraStore } from "@/lib/game/camera-store"

export const staticBatchControl = { enabled: true }

export function StaticBatches() {
  const scene = useThree(state => state.scene)
  const root = useRef<THREE.Group>(null)
  const batches = useMemo(() => new Map<string, StaticInstanceBatch>(), [])
  const view = useMemo(() => new GuardedFrustum(2), [])
  const registered = useMemo(() => ({ revision: -1, groups: new Map<string, THREE.InstancedMesh[]>() }), [])
  const coarsePointer = useRef(false)
  useEffect(() => {
    const query = window.matchMedia("(pointer: coarse)")
    const update = () => { coarsePointer.current = query.matches }
    update(); query.addEventListener("change", update)
    return () => query.removeEventListener("change", update)
  }, [])
  useFrame(({ camera, size, clock }, delta) => {
    const profile = coarsePointer.current && Math.min(size.width, size.height) <= 1024 ? "mobile" : "desktop"
    const requested = useCameraStore.getState().viewSize, before = frameQuality(scene)
    updateSceneryDetail(scene, camera, size.height, clock.elapsedTime, requested, profile, before)
    const quality = updateFrameQuality(scene, delta, document.hidden || sceneryZooming(scene), !crowdRenderStatus.active || crowdRenderStatus.budget >= crowdRenderStatus.population)
    if (quality !== before) updateSceneryDetail(scene, camera, size.height, clock.elapsedTime, requested, profile, quality)
  }, -3.9)
  useFrame(({ camera }) => {
    if (!root.current) return
    const detail = sceneryDetail(scene)
    root.current.userData.sceneryDetail = detail
    cullStaticBlocks(scene, camera)
    view.update(camera)
    const revision = staticInstanceRevision(scene)
    if (revision !== registered.revision) {
      const groups = new Map<string, THREE.InstancedMesh[]>()
      for (const sources of staticInstanceSources(scene)) for (const source of sources) {
        const key = staticInstanceKey(source), group = groups.get(key) ?? []
        group.push(source); groups.set(key, group)
      }
      for (const [key, batch] of batches) if (!groups.has(key)) {
        root.current.remove(batch.root); batch.dispose(); batches.delete(key)
      }
      for (const [key, sources] of groups) {
        let batch = batches.get(key)
        if (!batch) { batch = new StaticInstanceBatch(); batches.set(key, batch); root.current.add(batch.root) }
        batch.prepare(sources)
      }
      registered.groups = groups; registered.revision = revision
    }
    for (const [key, sources] of registered.groups) {
      const visible = sources.filter(source => {
        source.visible = !staticBatchControl.enabled && scenerySourceVisible(source, 0)
        return staticBatchControl.enabled && scenerySourceVisible(source, detail) && isWorldVisible(source.parent) && view.frustum.intersectsObject(source)
      })
      const batch = batches.get(key)!
      // At the widest view, tiny pebbles and leaves cover less than a few
      // pixels. Keep larger ground features; the terrain supplies the fine grain.
      batch.write(visible, view.frustum, view.version,
        detail === 2 && sources[0]?.userData.sceneryDetail === "ground" ? .25 : 0)
      batch.setSimplified(detail > 0)
    }
  }, .6)
  useEffect(() => () => {
    for (const sources of staticInstanceSources(scene)) for (const source of sources) source.visible = scenerySourceVisible(source, 0)
    for (const batch of batches.values()) batch.dispose()
    batches.clear()
  }, [scene, batches])
  return <group name="scenery-batches" ref={root} />
}
