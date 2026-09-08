"use client"

import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelWorldTexel } from "@/components/pixel-canvas"
import { BOULDER_SIZES, ENVIRONMENT_KINDS, type EnvironmentPlacement } from "@/lib/game/environment/elements"
import { BOULDER_ATLAS, BOULDER_FRAME, ENVIRONMENT_ATLAS, ENVIRONMENT_FRAME, type EnvironmentSpriteFrame } from "@/lib/game/environment/sprites"
import { foliageMaterial } from "@/lib/game/trees/foliage/material"
import { configureSpriteDepthTexture } from "@/lib/game/render/sprite-depth"
import { OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import { blockKey } from "@/lib/game/render/blocks"

export function EnvironmentField({ placements }: { placements: EnvironmentPlacement[] }) {
  const [small, large] = useMemo(() => [placements.filter(p => !p.boulderSize), placements.filter(p => p.boulderSize)], [placements])
  return <>
    <Suspense fallback={null}><SpriteField placements={small} /></Suspense>
    {large.length > 0 && <Suspense fallback={null}><SpriteField placements={large} large /></Suspense>}
  </>
}

/** Same color/depth billboard material as trees; native pixels and ground-aware overlap. */
function SpriteField({ placements, large = false }: { placements: EnvironmentPlacement[]; large?: boolean }) {
  const atlas = large ? BOULDER_ATLAS : ENVIRONMENT_ATLAS
  const frame = large ? BOULDER_FRAME : ENVIRONMENT_FRAME
  const sources = useLoader(THREE.TextureLoader, [atlas.color, atlas.depth])
  const color = useMemo(() => {
    const texture = sources[0].clone()
    texture.colorSpace = THREE.SRGBColorSpace
    texture.minFilter = texture.magFilter = THREE.NearestFilter
    texture.generateMipmaps = false; texture.needsUpdate = true
    return texture
  }, [sources])
  const depth = useMemo(() => configureSpriteDepthTexture(sources[1].clone()), [sources])
  const view = useMemo(() => ({ value: 0 }), []), worldTexel = usePixelWorldTexel()
  const materials = useMemo(() => [false, true].map(ids => foliageMaterial(color, depth, view, worldTexel, ids, frame)), [color, depth, view, worldTexel, frame])
  const blocks = useMemo(() => {
    const out = new Map<number, EnvironmentPlacement[]>()
    for (const p of placements) { const key = blockKey(p.x, p.z); const block = out.get(key) ?? []; block.push(p); out.set(key, block) }
    return [...out]
  }, [placements])
  useFrame(({ camera }) => {
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
    view.value = (Math.round(yaw / (Math.PI * 2 / ENVIRONMENT_FRAME.directions)) + ENVIRONMENT_FRAME.directions) % ENVIRONMENT_FRAME.directions
  })
  useEffect(() => () => { color.dispose(); depth.dispose(); materials.forEach(m => m.dispose()) }, [color, depth, materials])
  return <group name="environment-sprites">
    {blocks.map(([key, block]) => <SpriteBlock key={key} placements={block} materials={materials} frame={frame} />)}
  </group>
}

function SpriteBlock({ placements, materials, frame }: { placements: EnvironmentPlacement[]; materials: THREE.Material[]; frame: EnvironmentSpriteFrame }) {
  const body = useRef<THREE.InstancedMesh>(null), ids = useRef<THREE.InstancedMesh>(null)
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(1, 1)
    g.translate(0, frame.anchor[1] / frame.cellSize - .5, 0)
    g.setAttribute("foliageFrame", new THREE.InstancedBufferAttribute(new Float32Array(placements.flatMap(p => [
      Math.round(p.yaw / (Math.PI * 2 / frame.directions)) % frame.directions,
      (p.boulderSize ? BOULDER_SIZES.indexOf(p.boulderSize) : ENVIRONMENT_KINDS.indexOf(p.kind)) * frame.variants + (p.seed >>> 0) % frame.variants,
    ])), 2))
    // Small scenery occludes hidden outlines without adding a contour of its own.
    g.setAttribute("foliageId", new THREE.InstancedBufferAttribute(new Float32Array(placements.length * 3), 3))
    // Shader-facing quads need conservative bounds independent of camera yaw.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), frame.extent)
    return g
  }, [placements, frame])
  useLayoutEffect(() => {
    const matrix = new THREE.Matrix4(), tint = new THREE.Color()
    for (const mesh of [body.current, ids.current]) if (mesh) {
      placements.forEach((p, i) => {
        mesh.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z))
        mesh.setColorAt(i, tint.setScalar(p.brightness))
      })
      mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor!.needsUpdate = true
      mesh.computeBoundingSphere()
    }
  }, [placements])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <group>
    <instancedMesh ref={body} args={[geometry, materials[0], placements.length]} raycast={() => {}} />
    <instancedMesh ref={ids} args={[geometry, materials[1], placements.length]} layers-mask={OUTLINE_ID_LAYER_MASK} raycast={() => {}} />
  </group>
}
