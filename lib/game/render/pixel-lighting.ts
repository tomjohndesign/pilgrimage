import { CHARACTER_PIXEL_SIZE } from "./pixel-scale"
import * as THREE from "three"
import { skipInactiveLights } from "./active-lighting"
import { PIXEL_SURFACE_GLSL, surfaceAppearanceUniforms } from "./pixel-surface"

/** Face projection covers walls, roofs and floors without vertical streaking.
 * World coordinates are identical before and after static building batching. */
export function pixelLightingShader(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], grain = false) {
  if (shader.fragmentShader.includes("SurfaceSample materialSurface") || shader.fragmentShader.includes("SurfaceSample terrainDetail")) return
  const surfaceFunctions = shader.fragmentShader.includes("struct SurfaceSample") ? "" : PIXEL_SURFACE_GLSL
  Object.assign(shader.uniforms, surfaceAppearanceUniforms)
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "varying vec3 vSurfaceWorld; varying vec3 vSurfaceNormal;\n#include <common>")
    .replace("#include <project_vertex>", `#include <project_vertex>
      vec4 surfacePosition = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        surfacePosition = instanceMatrix * surfacePosition;
      #endif
      vSurfaceWorld = (modelMatrix * surfacePosition).xyz;
      vSurfaceNormal = inverseTransformDirection(transformedNormal, viewMatrix);`)
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", `#include <common>
      varying vec3 vSurfaceWorld;
      varying vec3 vSurfaceNormal;
      ${surfaceFunctions}
      vec2 pixelSurfacePoint() {
        vec3 face = abs(normalize(vSurfaceNormal));
        if (face.y >= face.x && face.y >= face.z) return vSurfaceWorld.xz;
        return face.x > face.z ? vSurfaceWorld.zy : vSurfaceWorld.xy;
      }
      vec2 pixelSurfaceKey() {
        // A 3D key agrees on both sides of an architectural corner. Choosing
        // a face's UV at the silhouette can change when a building is batched.
        vec3 pixel = floor(floor(vSurfaceWorld / ${CHARACTER_PIXEL_SIZE} * 256.0 + 0.5) / 256.0);
        // Bound the folded key before lookup to retain precise texel coordinates
        // on distant buildings and agree with unbatched geometry.
        return mod(pixel.xy + pixel.z * vec2(17.0, 31.0), vec2(251.0, 241.0));
      }
      `)
    .replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
      SurfaceSample materialSurface = sampleSurface(pixelSurfacePoint(), pixelSurfaceKey());
      ${grain ? "diffuseColor.rgb *= surfaceGrain(materialSurface, 0.0);" : ""}`)
    .replace("#include <opaque_fragment>", `outgoingLight = surfaceDitherColor(outgoingLight, materialSurface);
      #include <opaque_fragment>`)
  skipInactiveLights(shader)
}

const litMaterials = new WeakSet<THREE.Material>()
/** Register each live color material once; ID and depth materials stay untouched. */
export function patchPixelLighting(material: THREE.Material) {
  const lit = material instanceof THREE.MeshLambertMaterial || material instanceof THREE.MeshStandardMaterial
  const sprite = (material instanceof THREE.SpriteMaterial || material instanceof THREE.MeshBasicMaterial)
    && material.map && material.alphaTest > 0 && !material.transparent
  if ((!lit && !sprite) || litMaterials.has(material)) return
  litMaterials.add(material)
  const compile = material.onBeforeCompile, key = material.customProgramCacheKey()
  material.onBeforeCompile = function(shader, renderer) {
    compile.call(this, shader, renderer)
    if (lit) pixelLightingShader(shader)
    else {
      // Foliage supplies its own atlas-aligned variation and canopy shade.
      if (shader.fragmentShader.includes("struct SurfaceSample")) return
      Object.assign(shader.uniforms, surfaceAppearanceUniforms)
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\n${PIXEL_SURFACE_GLSL}`)
        .replace("#include <opaque_fragment>", `
          vec2 artSurface = vMapUv * vec2(textureSize(map, 0)) * ${CHARACTER_PIXEL_SIZE};
          SurfaceSample artSample = sampleSurface(artSurface, surfacePixel(artSurface));
          outgoingLight = surfaceDitherColor(outgoingLight, artSample);
          #include <opaque_fragment>`)
    }
  }
  material.customProgramCacheKey = () => `${key}|global-pixel-light-v3`
  material.needsUpdate = true
}
