"use client"

import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelWorldTexel } from "@/components/pixel-canvas"
import { FOLIAGE_FRAME, FOLIAGE_SPECIES, isFoliageSpecies, type FoliageAtlas } from "@/lib/game/trees/foliage/design"
import { foliageRaycast } from "@/lib/game/trees/foliage/raycast"
import { foliageMaterial } from "@/lib/game/trees/foliage/material"
import type { TreePlacement } from "@/lib/game/trees/placement"
import { configureSpriteDepthTexture } from "@/lib/game/render/sprite-depth"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK, treeObjectId } from "@/lib/game/render/outline"
import { makeRng } from "@/lib/game/rng"

export interface FoliagePlacement extends TreePlacement { foliageVariant?: number }

/** Prototype forest: two draws for any tree count, sharing one color/depth atlas. */
export function FoliageField({ atlas, placements, seed = 1, onSelect }: {
  atlas: FoliageAtlas; placements: FoliagePlacement[]; seed?: number
  onSelect?: (index: number) => void
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
  const materials = useMemo(() => [false, true].map(ids => foliageMaterial(color, depth, view, worldTexel, ids)), [color, depth, view, worldTexel])
  const entries = useMemo(() => placements.flatMap((tree, index) => isFoliageSpecies(tree.species) ? [{ tree, index }] : []), [placements])
  const data = useMemo(() => {
    const rng = makeRng(seed), frames: number[] = [], ids: number[] = [], matrices: THREE.Matrix4[] = []
    entries.forEach(({ tree, index }) => {
      frames.push(Math.floor(rng() * FOLIAGE_FRAME.directions), FOLIAGE_SPECIES.indexOf(tree.species as typeof FOLIAGE_SPECIES[number]) * FOLIAGE_FRAME.variants + (tree.foliageVariant ?? Math.floor(rng() * FOLIAGE_FRAME.variants)))
      ids.push(...encodeObjectId(treeObjectId(0, index)))
      // Variation is baked at native density; don't stretch individual texels.
      matrices.push(new THREE.Matrix4().makeTranslation(tree.x, tree.y, tree.z))
    })
    const geometry = new THREE.PlaneGeometry(1, 1)
    geometry.translate(0, FOLIAGE_FRAME.anchor[1] / FOLIAGE_FRAME.cellSize - 0.5, 0)
    geometry.setAttribute("foliageFrame", new THREE.InstancedBufferAttribute(new Float32Array(frames), 2))
    geometry.setAttribute("foliageId", new THREE.InstancedBufferAttribute(new Float32Array(ids), 3))
    return { geometry, matrices }
  }, [entries, seed])
  const body = useRef<THREE.InstancedMesh>(null), idMesh = useRef<THREE.InstancedMesh>(null)
  const camera = useRef<THREE.Camera>(undefined)
  const raycast = useMemo(() => foliageRaycast(data.geometry, color, depth, view, () => camera.current), [data, color, depth, view])
  useLayoutEffect(() => {
    for (const mesh of [body.current, idMesh.current]) if (mesh) {
      data.matrices.forEach((matrix, i) => {
        mesh.setMatrixAt(i, matrix)
        // Honor the existing feathered darkwood field, including brighter forest rims.
        mesh.setColorAt(i, new THREE.Color().setScalar(entries[i].tree.brightness ?? 1))
      })
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true
    }
  }, [data, entries])
  useFrame(({ camera: currentCamera }) => {
    const yaw = Math.atan2(currentCamera.matrixWorld.elements[8], currentCamera.matrixWorld.elements[10])
    view.value = ((Math.round(yaw / (Math.PI * 2 / FOLIAGE_FRAME.directions)) % FOLIAGE_FRAME.directions) + FOLIAGE_FRAME.directions) % FOLIAGE_FRAME.directions
    // Picking uses the same camera-facing bounds as the instanced color quads.
    camera.current = currentCamera
  })
  useEffect(() => () => data.geometry.dispose(), [data])
  useEffect(() => () => { color.dispose(); depth.dispose(); materials.forEach(m => m.dispose()) }, [color, depth, materials])
  useEffect(() => () => {
    // Edited atlases are temporary; don't retain every slider position in the loader cache.
    if (atlas.color.startsWith("data:")) useLoader.clear(THREE.TextureLoader, [atlas.color, atlas.depth])
  }, [atlas.color, atlas.depth])
  if (!entries.length) return null
  return <group name="foliage-prototype">
    <instancedMesh key={`body-${entries.length}`} ref={body} args={[data.geometry, materials[0], entries.length]} frustumCulled={false} raycast={raycast}
      onClick={event => { if (event.delta <= 6 && event.instanceId !== undefined) { event.stopPropagation(); onSelect?.(entries[event.instanceId].index) } }} />
    <instancedMesh key={`ids-${entries.length}`} ref={idMesh} args={[data.geometry, materials[1], entries.length]} frustumCulled={false} layers-mask={OUTLINE_ID_LAYER_MASK} />
  </group>
}
