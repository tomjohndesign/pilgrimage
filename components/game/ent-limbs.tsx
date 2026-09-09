"use client"
import { useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelWorldTexel } from "@/components/pixel-canvas"
import { ENT_FRAME, ENT_FRAMES } from "@/lib/game/trees/ent-rig"
import type { EntAtlas } from "@/lib/game/trees/ent-bake"
import type { EntActor } from "@/lib/game/trees/ent-motion"
import { FOLIAGE_SPECIES } from "@/lib/game/trees/foliage/design"
import { foliageMaterial } from "@/lib/game/trees/foliage/material"
import { foliageRaycast } from "@/lib/game/trees/foliage/raycast"
import { configureSpriteDepthTexture } from "@/lib/game/render/sprite-depth"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK, treeObjectId } from "@/lib/game/render/outline"
import { useBuildStore } from "@/lib/game/build-store"

/** One pair of depth-aware sprite draws for all awakened root legs and branch arms. */
export function EntLimbs({ actors, atlas, idBase, hidden, view, onSelect }: {
  actors: EntActor[]; atlas: EntAtlas; idBase: number; hidden?: ReadonlySet<number>; view: { value: number }
  onSelect?: (index: number, event: { delta: number; stopPropagation: () => void }) => void
}) {
  const sources = useLoader(THREE.TextureLoader, [atlas.color, atlas.depth]), worldTexel = usePixelWorldTexel()
  const data = useMemo(() => {
    const color = sources[0].clone(), depth = configureSpriteDepthTexture(sources[1].clone())
    color.colorSpace = THREE.SRGBColorSpace; color.minFilter = color.magFilter = THREE.NearestFilter; color.generateMipmaps = false; color.needsUpdate = true
    const geometry = new THREE.PlaneGeometry(1, 1)
    geometry.translate(0, ENT_FRAME.anchor[1] / ENT_FRAME.cellSize - .5, 0)
    geometry.setAttribute("foliageFrame", new THREE.InstancedBufferAttribute(new Float32Array(actors.length * 2), 2))
    geometry.setAttribute("foliageId", new THREE.InstancedBufferAttribute(new Float32Array(actors.length * 3), 3))
    const materials = [false, true].map(ids => foliageMaterial(color, depth, view, worldTexel, ids, ENT_FRAME))
    return { color, depth, geometry, materials, visible: [] as EntActor[] }
  }, [sources, actors, view, worldTexel])
  const body = useRef<THREE.InstancedMesh>(null), ids = useRef<THREE.InstancedMesh>(null), camera = useRef<THREE.Camera>(undefined)
  const raycast = useMemo(() => foliageRaycast(data.geometry, data.color, data.depth, view, () => camera.current, ENT_FRAME), [data, view])
  useLayoutEffect(() => {
    if (!body.current || !ids.current) return
    body.current.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    body.current.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(actors.length * 3), 3)
    ids.current.instanceMatrix = body.current.instanceMatrix; ids.current.instanceColor = body.current.instanceColor
    body.current.count = ids.current.count = 0
  }, [data, actors])
  useFrame(({ camera: current }) => {
    camera.current = current
    const mesh = body.current, outline = ids.current
    if (!mesh || !outline) return
    data.visible.length = 0
    const frames = data.geometry.getAttribute("foliageFrame"), colors = data.geometry.getAttribute("foliageId")
    for (const actor of actors) {
      if (!actor.visible || hidden?.has(actor.index)) continue
      const index = data.visible.length; data.visible.push(actor)
      const offset = index * 16
      mesh.instanceMatrix.array[offset + 12] = actor.x; mesh.instanceMatrix.array[offset + 13] = actor.y; mesh.instanceMatrix.array[offset + 14] = actor.z
      frames.setXY(index, actor.column, FOLIAGE_SPECIES.indexOf(actor.tree.species) * (ENT_FRAMES + 1) + actor.frame)
      colors.setXYZ(index, ...encodeObjectId(treeObjectId(idBase, actor.index)))
      const light = actor.tree.brightness ?? 1
      mesh.instanceColor!.setXYZ(index, light, light, light)
    }
    mesh.count = outline.count = data.visible.length
    for (const attribute of [mesh.instanceMatrix, mesh.instanceColor!, frames, colors]) attribute.needsUpdate = true
  })
  useEffect(() => () => { data.color.dispose(); data.depth.dispose(); data.geometry.dispose(); data.materials.forEach(m => m.dispose()) }, [data])
  useEffect(() => () => { if (atlas.color.startsWith("data:")) useLoader.clear(THREE.TextureLoader, [atlas.color, atlas.depth]) }, [atlas])
  return <group name="ent-limbs" userData={{ actors, ents: actors.map(actor => actor.state) }}>
    <instancedMesh ref={body} args={[data.geometry, data.materials[0], actors.length]} frustumCulled={false} raycast={raycast} onClick={event => {
      if (!onSelect || event.instanceId === undefined || event.delta > 6 || useBuildStore.getState().tool) return
      const actor = data.visible[event.instanceId]; if (actor) { event.stopPropagation(); onSelect(actor.index, event) }
    }} />
    <instancedMesh ref={ids} args={[data.geometry, data.materials[1], 0]} layers-mask={OUTLINE_ID_LAYER_MASK} frustumCulled={false} />
  </group>
}
