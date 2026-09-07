import type * as THREE from "three"

/** Soften faceted tree shading while retaining the shared southeast light.
 * Blend with each tree's own color, including forest brightness and variation.
 * This stays in the existing color shader; depth and selection IDs are untouched.
 */
export function softenTreeLighting(shader: Parameters<THREE.Material["onBeforeCompile"]>[0]) {
  shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
    outgoingLight = mix(diffuseColor.rgb, outgoingLight, 0.45);
    #include <opaque_fragment>`)
}
