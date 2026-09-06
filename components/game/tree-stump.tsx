"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame, useLoader } from "@react-three/fiber"
import * as THREE from "three"
import { usePixelWorldTexel } from "@/components/pixel-canvas"
import { PERSON_SPRITE_SCALE } from "@/lib/game/base-person/gait"
import { spriteRow } from "@/lib/game/character-assets"
import { encodeObjectId, OUTLINE_ID_LAYER_MASK } from "@/lib/game/render/outline"
import { applySpriteDepth } from "@/lib/game/render/sprite-depth"
import { simRegistry } from "@/lib/game/sim"
import manifest from "@/public/textures/trees/chopping-block/v1/manifest.json"

/** The same inked block as the splitting clip; the worker supplies it while in use. */
export function TreeStump({ id, objectId, characterScale, animatedStumps }: {
  id: number; objectId: number; characterScale: number; animatedStumps: boolean
}) {
  const root = useRef<THREE.Group>(null)
  const source = useLoader(THREE.TextureLoader, manifest.url)
  const map = useMemo(() => {
    const texture = source.clone()
    texture.magFilter = texture.minFilter = THREE.NearestFilter
    texture.colorSpace = THREE.SRGBColorSpace
    texture.generateMipmaps = false
    texture.repeat.set(1, 1 / manifest.rows)
    texture.needsUpdate = true
    return texture
  }, [source])
  const worldTexel = usePixelWorldTexel()
  const viewport = useMemo(() => new THREE.Vector4(), [])
  const materials = useMemo(() => [false, true].map(idPass => {
    const material = new THREE.SpriteMaterial({ map, alphaTest: 0.5, transparent: false, toneMapped: false })
    material.onBeforeCompile = shader => {
      applySpriteDepth(shader, viewport, worldTexel)
      if (idPass) {
        shader.uniforms.stumpId = { value: new THREE.Vector3(...encodeObjectId(objectId)) }
        shader.fragmentShader = "uniform vec3 stumpId;\n" + shader.fragmentShader.replace(
          "#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = stumpId;")
      }
    }
    material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
    material.customProgramCacheKey = () => idPass ? "stump-id-v1" : "person-depth-v4"
    return material
  }), [map, objectId, viewport, worldTexel])
  useEffect(() => () => { map.dispose() }, [map])
  useEffect(() => () => { materials.forEach(material => material.dispose()) }, [materials])
  useFrame(({ camera }) => {
    if (!root.current) return
    root.current.visible = true
    for (const worker of simRegistry.current?.travelers.values() ?? []) {
      if (animatedStumps && worker.tree === id && worker.activity === "gathering" && !worker.praying) { root.current.visible = false; break }
    }
    const yaw = Math.atan2(camera.matrixWorld.elements[8], camera.matrixWorld.elements[10])
    map.offset.y = 1 - (spriteRow(0, yaw) + 1) / manifest.rows
  })
  const size = PERSON_SPRITE_SCALE * characterScale
  const center = useMemo(() => new THREE.Vector2(manifest.anchor[0] / manifest.cellSize,
    1 - manifest.anchor[1] / manifest.cellSize), [])
  return <group ref={root} name={`tree-stump-${id}`}>
    <sprite material={materials[0]} center={center} scale={[size, size, 1]} />
    <sprite material={materials[1]} center={center} scale={[size, size, 1]} layers-mask={OUTLINE_ID_LAYER_MASK} />
  </group>
}
