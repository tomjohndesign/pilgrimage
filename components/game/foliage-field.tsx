"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelWorldTexel } from "@/components/pixel-canvas"
import { FOLIAGE_FRAME, FOLIAGE_SPECIES, isFoliageSpecies, type FoliageAtlas } from "@/lib/game/trees/foliage/design"
import { foliageRaycast } from "@/lib/game/trees/foliage/raycast"
import { foliageCropTexture, foliageRowRadii } from "@/lib/game/trees/foliage/crop"
import { FoliageInstances, type FoliageInstance } from "@/lib/game/trees/foliage/instances"
import { foliageMaterial } from "@/lib/game/trees/foliage/material"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { configureSpriteDepthTexture } from "@/lib/game/render/sprite-depth"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK, treeObjectId } from "@/lib/game/render/outline"
import { makeRng } from "@/lib/game/rng"
import { useBuildStore } from "@/lib/game/build-store"
import { isWorldVisible } from "@/lib/game/render/visibility"
import { frameQuality } from "@/lib/game/render/frame-quality"
import { useCameraStore } from "@/lib/game/camera-store"
import { useSimulationStore } from "@/lib/game/simulation-store"
import { simRegistry } from "@/lib/game/sim"
import { invalidateTreeSpatialIndex } from "@/lib/game/trees/spatial"
import { advanceEntActor, createEntActors } from "@/lib/game/trees/ent-motion"
import { entFramePose, type EntDesign } from "@/lib/game/trees/ent-rig"
import type { EntAtlas } from "@/lib/game/trees/ent-bake"
import type { GameMap } from "@/lib/game/map/types"
import type { FoliageSpecies } from "@/lib/game/trees/foliage/design"
import { EntLimbs } from "./ent-limbs"

export interface FoliagePlacement extends TreePlacement { foliageVariant?: number }

/**
 * Baked pixel foliage: two draws for visible trees, sharing one color/depth
 * atlas. The game and the tree playground both draw through here; `idBase` is
 * how many outline IDs the buildings already took, and `hidden` lists felled
 * trees whose remains are drawn separately.
 */
export function FoliageField({ atlas, placements, seed = 1, idBase = 0, hidden, oldGrowthOnly = false, onSelect, entMap, entAtlas, entDesigns }: {
  atlas: FoliageAtlas; placements: FoliagePlacement[]; seed?: number; idBase?: number
  hidden?: ReadonlySet<number>
  oldGrowthOnly?: boolean
  entMap?: GameMap; entAtlas?: EntAtlas; entDesigns?: Partial<Record<FoliageSpecies, EntDesign>>
  onSelect?: (index: number, event: { delta: number; stopPropagation: () => void }) => void
}) {
  const sources = useLoader(THREE.TextureLoader, [atlas.color, atlas.depth])
  const color = useMemo(() => {
    const texture = sources[0].clone()
    texture.colorSpace = THREE.SRGBColorSpace; texture.minFilter = texture.magFilter = THREE.NearestFilter
    texture.generateMipmaps = false; texture.needsUpdate = true
    return texture
  }, [sources])
  const depth = useMemo(() => configureSpriteDepthTexture(sources[1].clone()), [sources])
  const worldTexel = usePixelWorldTexel(), view = useMemo(() => ({ value: 0 }), [])
  const crop = useMemo(() => foliageCropTexture(color), [color])
  const materials = useMemo(() => [false, true].map(ids =>
    foliageMaterial(color, depth, view, worldTexel, ids, FOLIAGE_FRAME, crop)), [color, depth, view, worldTexel, crop])
  const entries = useMemo(() => placements.flatMap((tree, index) =>
    isFoliageSpecies(tree.species) && (!oldGrowthOnly || tree.oldGrowth) && !hidden?.has(index) ? [{ tree, index }] : []), [placements, hidden, oldGrowthOnly])
  const actors = useMemo(() => entMap ? createEntActors(placements, entMap.seed ?? 0).filter(a => !oldGrowthOnly || a.tree.oldGrowth) : [], [placements, entMap, oldGrowthOnly])
  const moving = useMemo(() => new Set(actors.map(a => a.index)), [actors])
  useEffect(() => () => { for (const actor of actors) actor.tree.walking = false }, [actors])
  const data = useMemo(() => {
    // Frames draw from the placement order, so felling a tree never reshuffles its neighbours.
    const rng = makeRng(seed), sources: FoliageInstance[] = []
    const rolls = placements.map(() => [Math.floor(rng() * FOLIAGE_FRAME.directions), Math.floor(rng() * FOLIAGE_FRAME.variants)])
    entries.forEach(({ tree, index }) => sources.push({
      x: tree.x, y: tree.y, z: tree.z, column: rolls[index][0],
      row: tree.dead ? FOLIAGE_SPECIES.length * FOLIAGE_FRAME.variants * 2 + (tree.foliageVariant ?? rolls[index][1]) : (tree.oldGrowth ? FOLIAGE_SPECIES.length * FOLIAGE_FRAME.variants : 0) + FOLIAGE_SPECIES.indexOf(tree.species as typeof FOLIAGE_SPECIES[number]) * FOLIAGE_FRAME.variants + (tree.foliageVariant ?? rolls[index][1]),
      id: [0, 0, 0], brightness: tree.brightness ?? 1, tree: index,
    }))
    const geometry = new THREE.PlaneGeometry(1, 1)
    geometry.translate(0, FOLIAGE_FRAME.anchor[1] / FOLIAGE_FRAME.cellSize - 0.5, 0)
    geometry.setAttribute("foliageFrame", new THREE.InstancedBufferAttribute(new Float32Array(sources.length * 2), 2).setUsage(THREE.DynamicDrawUsage))
    geometry.setAttribute("foliageId", new THREE.InstancedBufferAttribute(new Float32Array(sources.length * 3), 3).setUsage(THREE.DynamicDrawUsage))
    return { geometry, instances: new FoliageInstances(sources, foliageRowRadii(crop.image.data as Float32Array), moving), byTree: new Map(sources.map(s => [s.tree, s])) }
  }, [placements, entries, seed, crop, moving])
  useLayoutEffect(() => {
    data.instances.setIds(index => encodeObjectId(treeObjectId(idBase, index)))
  }, [data, idBase])
  const body = useRef<THREE.InstancedMesh>(null), idMesh = useRef<THREE.InstancedMesh>(null)
  const camera = useRef<THREE.Camera>(undefined)
  const raycast = useMemo(() => foliageRaycast(data.geometry, color, depth, view, () => camera.current), [data, color, depth, view])
  useLayoutEffect(() => {
    const mesh = body.current, ids = idMesh.current
    if (!mesh || !ids) return
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(entries.length * 3), 3).setUsage(THREE.DynamicDrawUsage)
    ids.instanceMatrix = mesh.instanceMatrix; ids.instanceColor = mesh.instanceColor
    mesh.count = ids.count = 0
    data.instances.invalidate()
  }, [data, entries])
  useFrame(({ camera: currentCamera, scene }, delta) => {
    const yaw = Math.atan2(currentCamera.matrixWorld.elements[8], currentCamera.matrixWorld.elements[10])
    view.value = ((Math.round(yaw / (Math.PI * 2 / FOLIAGE_FRAME.directions)) % FOLIAGE_FRAME.directions) + FOLIAGE_FRAME.directions) % FOLIAGE_FRAME.directions
    if (entMap && actors.length) {
      const playback = useSimulationStore.getState()
      const reserved = new Set(Array.from(simRegistry.current?.travelers.values() ?? [], worker => worker.tree))
      let changed = false
      for (const actor of actors) {
        if (hidden?.has(actor.index)) { actor.tree.walking = false; actor.visible = false; continue }
        const design = entDesigns?.[actor.tree.species]
        if (!advanceEntActor(actor, entMap, playback.paused ? 0 : Math.min(delta, .25) * playback.speed, yaw, design, reserved.has(actor.index))) continue
        const source = data.byTree.get(actor.index)
        if (source) {
          const height = actor.visible ? entFramePose(actor.tree.species, actor.frame, design).height : 0
          source.x = actor.x; source.y = actor.y + height; source.z = actor.z
        }
        changed = true
      }
      if (changed) { data.instances.invalidate(); invalidateTreeSpatialIndex(placements) }
    }
    if (!isWorldVisible(body.current?.parent)) return
    // Picking uses the same camera-facing bounds as the instanced color quads.
    camera.current = currentCamera
    const mesh = body.current, ids = idMesh.current
    if (mesh && ids) {
      mesh.updateWorldMatrix(true, false)
      // Halving the forest is a last resort for sustained FPS pressure; zoom
      // detail alone must preserve every tree.
      const thin = frameQuality(scene) === 2, selection = useCameraStore.getState().selection
      data.instances.update(mesh, currentCamera, thin, selection?.kind === "tree" ? selection.id : -1)
      ids.count = mesh.count
      mesh.userData.totalTrees = entries.length
      mesh.userData.treeDensity = thin ? .5 : 1
    }
  }, -1)
  useEffect(() => () => data.geometry.dispose(), [data])
  useEffect(() => () => { color.dispose(); depth.dispose(); crop.dispose(); materials.forEach(m => m.dispose()) }, [color, depth, crop, materials])
  useEffect(() => () => {
    // Edited atlases are temporary; don't retain every slider position in the loader cache.
    if (atlas.color.startsWith("data:")) useLoader.clear(THREE.TextureLoader, [atlas.color, atlas.depth])
  }, [atlas.color, atlas.depth])
  if (!entries.length) return null
  return <group name="foliage-prototype">
    {entMap && entAtlas && actors.length > 0 && <EntLimbs actors={actors} atlas={entAtlas} idBase={idBase} hidden={hidden} view={view} onSelect={onSelect} />}
    <instancedMesh key={`body-${entries.length}`} ref={body} args={[data.geometry, materials[0], entries.length]} frustumCulled={false} raycast={raycast}
      onClick={event => {
        if (!onSelect || event.delta > 6 || event.instanceId === undefined || useBuildStore.getState().tool) return
        event.stopPropagation(); onSelect(data.instances.sources[data.instances.visible[event.instanceId]].tree, event)
      }} />
    <instancedMesh key={`ids-${entries.length}`} ref={idMesh} args={[data.geometry, materials[1], 0]} frustumCulled={false} layers-mask={OUTLINE_ID_LAYER_MASK} />
  </group>
}
