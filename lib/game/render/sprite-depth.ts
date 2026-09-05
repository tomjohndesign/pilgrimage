import type * as THREE from "three"

/**
 * A flat billboard has one depth, so the nearer ground cuts through its toes.
 * Treat pixels above the anchor as upright and those below it as lying along
 * the ground. A small clearance avoids depth ties along the sole. This preserves ground contact and depth tests against scenery.
 */
export function applySpriteDepth(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], depth: THREE.Vector3, groundOnly = false) {
  shader.uniforms.spriteDepth = { value: depth }
  shader.vertexShader = "varying float vSpriteHeight;\n" + shader.vertexShader.replace(
    "#include <fog_vertex>", "#include <fog_vertex>\nvSpriteHeight = (uv.y - center.y) * length(modelMatrix[1].xyz);")
  shader.fragmentShader = "varying float vSpriteHeight;\nuniform vec3 spriteDepth;\n" + shader.fragmentShader.replace(
    "#include <logdepthbuf_fragment>", `#include <logdepthbuf_fragment>
    float depthOffset = ${groundOnly ? "-vSpriteHeight * spriteDepth.y" : "max(vSpriteHeight * spriteDepth.x, -vSpriteHeight * spriteDepth.y * 1.08)"};
    gl_FragDepth = clamp(gl_FragCoord.z - (depthOffset + 0.005) * spriteDepth.z, 0.0, 1.0);`)
}
