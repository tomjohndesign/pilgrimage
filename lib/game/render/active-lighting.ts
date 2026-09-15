import { ShaderChunk } from "three"

/** Keep the resident light layout, but omit even attenuation math for empty slots.
 * This uniform branch contains no screen derivatives; dithering happens later. */
export function skipInactiveLights(shader: { fragmentShader: string }) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>",
    ShaderChunk.lights_fragment_begin.replace("pointLight = pointLights[ i ];",
      "pointLight = pointLights[ i ];\n if (any(greaterThan(pointLight.color, vec3(0.0)))) {")
      .replace("RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );",
        "RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n }"))
}
