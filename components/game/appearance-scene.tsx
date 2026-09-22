"use client"

import { registerSurfaceLighting } from "@/lib/game/render/surface-registration"
import { useEffect, useMemo } from "react"
import { useFrame, useThree } from "@react-three/fiber"
import * as THREE from "three"
import { APPEARANCE_ENABLED, useAppearanceStore } from "@/lib/game/appearance-store"
import { appearanceWorldKey, defaultAppearance, type AppearanceGroup } from "@/lib/game/appearance"
import { applyAppearance, updateAppearanceUniforms } from "@/lib/game/render/appearance-uniforms"
import { characterBatchEntry } from "@/lib/game/render/character-batch"
import { selectionObjectId } from "@/lib/game/selection"
import { useBuildStore } from "@/lib/game/build-store"
import { OUTLINE_ID_LAYER } from "@/lib/game/render/outline"
import type { GameMap } from "@/lib/game/map/types"

function groupOf(object: THREE.Object3D): AppearanceGroup | null {
  if (object.name === "building-block-surfaces" || object.name === "building-surfaces") return "buildings"
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (node.name === "map-reveal-church") return "buildings"
    if (node.name === "scenery-batches") return "scenery"
    if (node.name.startsWith("visibility-")) return node.name.slice(11) as AppearanceGroup
  }
  return null
}

/** Bind appearance to existing color materials. IDs, depth, outlines and batching keep their original passes. */
export function AppearanceScene({ map, travelers, monks }: { map: GameMap; travelers: readonly {id:number}[]; monks: readonly {id:number}[] }) {
  const scene = useThree(s => s.scene)
  useEffect(() => registerSurfaceLighting(scene), [scene])
  const defaults = useMemo(defaultAppearance, [])
  const value = useAppearanceStore(s => APPEARANCE_ENABLED ? s.value : defaults)
  const piles = useBuildStore(s => s.piles)
  const patched = useMemo(() => new Map<THREE.Material, () => void>(), [])
  useEffect(() => { if (APPEARANCE_ENABLED) useAppearanceStore.getState().hydrate() }, [])
  useEffect(() => {
    updateAppearanceUniforms(value, !APPEARANCE_ENABLED ? [] : value.objects.filter(edit => edit.world === appearanceWorldKey(map)).map(edit => ({
      ...edit, id: selectionObjectId(edit.selection, { buildings: map.buildings, travelers, monks, piles }),
    })))
  }, [value, map, travelers, monks, piles])
  useEffect(() => () => {
    for (const restore of [...patched.values()]) restore()
    updateAppearanceUniforms(defaultAppearance(), [])
  }, [patched])

  useFrame(({ scene }) => scene.traverse(object => {
    if (!object.layers.isEnabled(0) || !(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    if (materials.every(material => patched.has(material) || material.userData.appearancePatched || material.colorWrite === false)) return
    const group = groupOf(object)
    if (!group) return
    // Color and ID geometry already have matching vertices, including wildlife batches.
    const sibling = !APPEARANCE_ENABLED ? undefined : object.parent?.children.find(child => child.layers.isEnabled(OUTLINE_ID_LAYER)
      && (child instanceof THREE.Mesh || child instanceof THREE.Sprite)) as THREE.Mesh | THREE.Sprite | undefined
    let encoded: THREE.Color | THREE.Vector3 | undefined
    if (APPEARANCE_ENABLED && object instanceof THREE.Sprite) encoded = characterBatchEntry(object)?.id
    const siblingMaterial = sibling && !Array.isArray(sibling.material) ? sibling.material : null
    if (!encoded && siblingMaterial?.userData.objectId instanceof THREE.Vector3) encoded = siblingMaterial.userData.objectId
    if (!encoded && siblingMaterial && "color" in siblingMaterial) encoded = siblingMaterial.color as THREE.Color
    if (APPEARANCE_ENABLED && object instanceof THREE.Mesh && !object.geometry.hasAttribute("appearanceObjectId") && !object.geometry.hasAttribute("foliageId") && !object.geometry.hasAttribute("characterId")) {
      let attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined
      if (sibling instanceof THREE.InstancedMesh && object instanceof THREE.InstancedMesh && sibling.instanceMatrix === object.instanceMatrix) attribute = sibling.instanceColor ?? undefined
      else if (sibling instanceof THREE.Mesh && !(object instanceof THREE.InstancedMesh)) {
        const ids = sibling.geometry.getAttribute("color")
        if (siblingMaterial && "vertexColors" in siblingMaterial && siblingMaterial.vertexColors && ids?.count === object.geometry.getAttribute("position")?.count) attribute = ids
      }
      if (attribute) {
        object.geometry.setAttribute("appearanceObjectId",attribute)
      }
    }
    for (const material of materials) {
      if (patched.has(material) || material.userData.appearancePatched || material.colorWrite === false) continue
      const compile = material.onBeforeCompile, key = material.customProgramCacheKey
      const cache = key.call(material)
      const id = encoded ? encoded.toArray() : [0,0,0]
      const attributes = object instanceof THREE.Mesh ? object.geometry.attributes : {}
      const source = attributes.foliageId ? "foliageId" : attributes.characterId ? "characterId" : attributes.appearanceObjectId ? "appearanceObjectId" : null
      material.userData.appearancePatched = true
      material.onBeforeCompile = function(shader, renderer) {
        compile.call(this,shader,renderer)
        shader.uniforms.appearanceObject = { value: new THREE.Vector3(...id) }
        applyAppearance(shader,group,`appearanceId(${source ?? "appearanceObject"})`,
          source === "appearanceObjectId" ? "attribute vec3 appearanceObjectId;" : source ? "" : "uniform vec3 appearanceObject;", APPEARANCE_ENABLED)
      }
      material.customProgramCacheKey = () => `${cache}|appearance-v1-${APPEARANCE_ENABLED ? "editor" : "default"}-${group}-${source ?? "uniform"}`
      material.needsUpdate = true
      const restore = () => {
        material.onBeforeCompile = compile; material.customProgramCacheKey = key
        delete material.userData.appearancePatched; material.needsUpdate = true
        material.removeEventListener("dispose",restore); patched.delete(material)
      }
      material.addEventListener("dispose",restore); patched.set(material,restore)
    }
  }), .8)
  return null
}
