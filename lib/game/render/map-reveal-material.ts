import * as THREE from "three"

export interface TileRevealUniforms {
  mapRevealExtent: { value: THREE.Vector2 }
  mapRevealCentre: { value: THREE.Vector2 }
  mapRevealProgress: { value: number }
  mapRevealReach: { value: number }
  mapRevealBackground: { value: THREE.Color }
  mapRevealDirect: { value: boolean }
}

/** Apply the same tile cut to colour, road edges and outline IDs. Instanced
 * tiles retain their complete sloping tops and vertical faces. Billboards use
 * their foot anchor, so a tree or person arrives with its ground tile.
 */
export function applyTileReveal(shader: Parameters<THREE.Material["onBeforeCompile"]>[0],
  uniforms: TileRevealUniforms, sprite: boolean, anchored: boolean, color: boolean) {
  Object.assign(shader.uniforms, uniforms)
  // Static batches can clone a source whose compile hook is already wrapped.
  if (shader.vertexShader.includes("varying vec2 vMapRevealPosition;")) return
  const position = sprite ? "vec4(0.0, 0.0, 0.0, 1.0)"
    : shader.vertexShader.includes("#include <begin_vertex>") ? "vec4(transformed, 1.0)" : "vec4(position, 1.0)"
  shader.vertexShader = `varying vec2 vMapRevealPosition;\n` + shader.vertexShader.replace(/}\s*$/, `
    vec4 revealPosition = ${position};
    #ifdef USE_INSTANCING
      revealPosition = instanceMatrix * ${anchored ? "vec4(0.0, 0.0, 0.0, 1.0)" : "revealPosition"};
    #endif
    vMapRevealPosition = (modelMatrix * revealPosition).xz;
  }`)
  shader.fragmentShader = `varying vec2 vMapRevealPosition;
    uniform vec2 mapRevealExtent;
    uniform vec2 mapRevealCentre;
    uniform float mapRevealProgress;
    uniform float mapRevealReach;
    uniform vec3 mapRevealBackground;
    uniform bool mapRevealDirect;\n` + shader.fragmentShader.replace(/void main\(\)\s*{/, `void main() {
      vec2 revealTile = floor(clamp(vMapRevealPosition + mapRevealExtent * 0.5,
        vec2(0.001), mapRevealExtent - 0.001));
      float revealStart = length(revealTile - mapRevealCentre) / mapRevealReach * 0.82;
      float revealOpacity = mapRevealProgress >= 1.0 ? 1.0
        : smoothstep(0.0, 0.18, mapRevealProgress - revealStart);
      if (revealOpacity <= 0.0) discard;
    `)
  if (color) shader.fragmentShader = shader.fragmentShader.replace(/}\s*$/, `
    if (mapRevealDirect) gl_FragColor.rgb = mix(mapRevealBackground, gl_FragColor.rgb, revealOpacity);
    else gl_FragColor.a *= revealOpacity;
  }`)
  else shader.fragmentShader = shader.fragmentShader.replace(/}\s*$/, `
    gl_FragColor.a *= revealOpacity;
  }`)
}

/** Keep the renderer's existing materials, custom shader hooks and render passes.
 * The uniform becomes unrestricted after loading, avoiding a second shader
 * compilation when the last ring opens. No scene traversal is needed afterwards.
 */
export class TileRevealMaterials {
  private originals = new Map<THREE.Material, { compile: THREE.Material["onBeforeCompile"]; key: THREE.Material["customProgramCacheKey"]; release: () => void }>()

  constructor(readonly uniforms: TileRevealUniforms) {}

  prepare(scene: THREE.Scene) {
    let added = false
    scene.traverse(object => {
      // The founding church stays in the scene while every surrounding tile waits.
      for (let root: THREE.Object3D | null = object; root; root = root.parent) {
        if (root.userData.mapRevealLandmark) return
      }
      const geometry = (object as THREE.Mesh).geometry
      const anchored = !!(geometry?.getAttribute("aCorners") || geometry?.getAttribute("foliageFrame") || geometry?.getAttribute("characterUv"))
      const color = object.layers.isEnabled(0)
      const material = (object as THREE.Mesh).material
      if (!material) return
      for (const part of Array.isArray(material) ? material : [material]) {
        if (this.originals.has(part)) continue
        const compile = part.onBeforeCompile, key = part.customProgramCacheKey
        // Capture before replacing onBeforeCompile: Three's default key uses it.
        const originalKey = key.call(part)
        const release = () => {
          part.removeEventListener("dispose", release)
          this.originals.delete(part)
        }
        part.addEventListener("dispose", release)
        this.originals.set(part, { compile, key, release })
        part.onBeforeCompile = (shader, renderer) => {
          compile.call(part, shader, renderer)
          applyTileReveal(shader, this.uniforms, part instanceof THREE.SpriteMaterial, anchored, color)
        }
        part.customProgramCacheKey = () => `${originalKey}-map-tile-reveal-v3-${anchored}-${color}`
        part.needsUpdate = true
        added = true
      }
    })
    return added
  }

  dispose() {
    for (const [material, original] of this.originals) {
      material.onBeforeCompile = original.compile
      material.customProgramCacheKey = original.key
      material.needsUpdate = true
      material.removeEventListener("dispose", original.release)
    }
    this.originals.clear()
  }
}
