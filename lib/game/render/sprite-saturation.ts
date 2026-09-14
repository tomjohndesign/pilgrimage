import type * as THREE from "three"

/** Composite legacy sheets have no separate cloth mask. Quiet their palette as
 * a whole, after any driver layer has been composited into the sprite. */
export function applySpriteSaturation(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], saturation: number) {
  shader.uniforms.spriteSaturation = { value: saturation }
  shader.fragmentShader = "uniform float spriteSaturation;\n" + shader.fragmentShader.replace("#include <alphatest_fragment>",
    `#include <alphatest_fragment>
    diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(.299, .587, .114))), diffuseColor.rgb, spriteSaturation);`)
}
