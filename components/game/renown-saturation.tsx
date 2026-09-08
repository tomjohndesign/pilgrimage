"use client"

import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { useBalanceStore } from "@/lib/game/balance-store"
import { getBuildInfluence } from "@/lib/game/build-influence"
import type { GameMap } from "@/lib/game/map/types"

/** Enrich the contents of the existing influence boundary in both color passes. */
export function RenownSaturation({ map, children }: { map: GameMap; children: ReactNode }) {
  const root = useRef<THREE.Group>(null)
  const balance = useBalanceStore(s => s.balance)
  const field = useMemo(() => {
    const data = getBuildInfluence(map, balance).radiated.map(value => value * 255)
    const texture = new THREE.DataTexture(data, map.width, map.depth, THREE.RedFormat)
    texture.minFilter = texture.magFilter = THREE.NearestFilter
    texture.needsUpdate = true
    return texture
  }, [map, balance])
  const uniforms = useMemo(() => ({
    renownField: { value: null as THREE.Texture | null },
    renownMapSize: { value: new THREE.Vector2() },
  }), [])
  useLayoutEffect(() => {
    uniforms.renownField.value = field
    uniforms.renownMapSize.value.set(map.width, map.depth)
    return () => field.dispose()
  }, [field, map.width, map.depth, uniforms])

  const patched = useMemo(() => new Map<THREE.Material, () => void>(), [])
  useLayoutEffect(() => () => {
    for (const restore of patched.values()) restore()
    patched.clear()
  }, [patched])

  // New buildings and asynchronously loaded sprites can introduce materials at
  // any time. Only color-layer materials are patched; encoded outline IDs and
  // the cursor/territory overlays keep their original colors.
  useFrame(() => root.current?.traverseVisible(object => {
    if (!object.layers.isEnabled(0)) return
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Sprite)) return
    const materials: THREE.Material[] = Array.isArray(object.material) ? object.material : [object.material]
    for (const material of materials) {
      if (patched.has(material) || material.userData.renownSaturated) continue
      material.userData.renownSaturated = true
      const compile = material.onBeforeCompile
      const cacheKey = material.customProgramCacheKey
      const originalKey = cacheKey.call(material)
      material.onBeforeCompile = function (shader, renderer) {
        compile.call(this, shader, renderer)
        Object.assign(shader.uniforms, uniforms)
        const position = material.userData.characterBatch
          ? "vRenownWorld = (modelMatrix * instanceMatrix[3]).xz;"
          : material instanceof THREE.SpriteMaterial
          // Sample at the feet so an upright figure enters the area as a whole.
          ? "vRenownWorld = modelMatrix[3].xz;"
          : `vec4 renownPosition = vec4(transformed, 1.0);
             #ifdef USE_BATCHING
               renownPosition = batchingMatrix * renownPosition;
             #endif
             #ifdef USE_INSTANCING
               renownPosition = instanceMatrix * renownPosition;
             #endif
             vRenownWorld = (modelMatrix * renownPosition).xz;`
        shader.vertexShader = "varying vec2 vRenownWorld;\n" + shader.vertexShader
        if (material instanceof THREE.SpriteMaterial) {
          shader.vertexShader = shader.vertexShader.replace("void main() {", `void main() {\n${position}`)
        } else if (shader.vertexShader.includes("#include <project_vertex>")) {
          shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `#include <project_vertex>\n${position}`)
        } else {
          // The water shimmer is a custom shader with world-space geometry.
          shader.vertexShader = shader.vertexShader.replace("void main() {", "void main() {\nvRenownWorld = (modelMatrix * vec4(position, 1.0)).xz;")
        }
        shader.fragmentShader = `varying vec2 vRenownWorld;
          uniform sampler2D renownField;
          uniform vec2 renownMapSize;
        ` + shader.fragmentShader.replace("#include <tonemapping_fragment>", `
          vec2 renownUv = vRenownWorld / renownMapSize + 0.5;
          float inMap = step(0.0, renownUv.x) * step(0.0, renownUv.y)
            * (1.0 - step(1.0, renownUv.x)) * (1.0 - step(1.0, renownUv.y));
          float influence = texture2D(renownField, renownUv).r * inMap;
          float luminance = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
          gl_FragColor.rgb = max(vec3(0.0), mix(vec3(luminance), gl_FragColor.rgb, 1.0 + 0.2 * influence));
          #include <tonemapping_fragment>
        `)
      }
      material.customProgramCacheKey = () => `${originalKey}|renown-saturation-v1`
      material.needsUpdate = true
      const restore = () => {
        material.onBeforeCompile = compile
        material.customProgramCacheKey = cacheKey
        material.needsUpdate = true
        delete material.userData.renownSaturated
        material.removeEventListener("dispose", restore)
        patched.delete(material)
      }
      material.addEventListener("dispose", restore)
      patched.set(material, restore)
    }
  }), .75)

  return <group ref={root}>{children}</group>
}
