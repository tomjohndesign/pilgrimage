import * as THREE from "three"
import { pixelLightingShader } from "./pixel-lighting"

/** Wide buildings use their authored colors without camera-linked dark faces.
 * One resident shader serves both levels; the distant branch skips lighting. */
export function buildingSurfaceMaterial(shading = { value: 1 }, parameters: THREE.MeshLambertMaterialParameters = {}) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...parameters })
  material.onBeforeCompile = shader => {
    pixelLightingShader(shader, true)
    shader.uniforms.buildingShading = shading
    shader.fragmentShader = "uniform float buildingShading;\n" + shader.fragmentShader
      .replace("#include <lights_lambert_fragment>", "if (buildingShading > 0.0) {\n#include <lights_lambert_fragment>")
      .replace("#include <aomap_fragment>", "#include <aomap_fragment>\n}")
      .replace("#include <opaque_fragment>", "outgoingLight = mix(diffuseColor.rgb, outgoingLight, buildingShading);\n#include <opaque_fragment>")
  }
  material.customProgramCacheKey = () => "building-pixel-surface-v4"
  return material
}
