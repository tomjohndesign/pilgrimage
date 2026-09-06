import type * as THREE from "three"

/**
 * Upright bodies and grounded toes, with a small clearance above terrain.
 * Compute both depth planes from the anchor, then sample them at screen Y.
 * Interpolating UV height separately on each quad causes coplanar sprites of
 * different sizes to disagree by a depth-buffer step, producing striped overlaps.
 * Flat coefficients make coincident sprites agree across both triangles and
 * across the color/ID passes. The viewport must match the current render target.
 * The ground plane also clears half an enlarged terrain texel: its nearest
 * depth sample can be closer than the real ground under a display pixel.
 * Keep that extra clearance off the upright plane to preserve body occlusion.
 * Like the game's cameras, this depth model is orthographic.
 */
export function applySpriteDepth(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], viewport: THREE.Vector4, worldTexel = { value: 0 }) {
  shader.uniforms.spriteWorldTexel = worldTexel
  shader.uniforms.spriteViewport = { value: viewport }
  shader.vertexShader = "flat varying vec4 vSpritePlanes;\nuniform float spriteWorldTexel;\n" + shader.vertexShader.replace(
    "#include <fog_vertex>", `#include <fog_vertex>
    vec4 anchor = projectionMatrix * modelViewMatrix[3];
    float anchorY = anchor.y * 0.5 + 0.5;
    float depthScale = abs(projectionMatrix[2][2]) * 0.5;
    float anchorDepth = anchor.z * 0.5 + 0.5 - 0.005 * depthScale;
    float pitch = max(0.01, abs(viewMatrix[1][2] / viewMatrix[1][1]));
    vec2 slopes = vec2(pitch, -1.08 / pitch) * (2.0 / projectionMatrix[1][1]) * depthScale;
    vec2 clearance = vec2(0.0, 0.5 * spriteWorldTexel / pitch * depthScale);
    vSpritePlanes = vec4(anchorDepth + anchorY * slopes - clearance, slopes);`)
  shader.fragmentShader = "flat varying vec4 vSpritePlanes;\nuniform vec4 spriteViewport;\n" + shader.fragmentShader.replace(
    "#include <logdepthbuf_fragment>", `#include <logdepthbuf_fragment>
    float screenY = (gl_FragCoord.y - spriteViewport.y) / spriteViewport.w;
    vec2 depths = vSpritePlanes.xy - screenY * vSpritePlanes.zw;
    gl_FragDepth = clamp(min(depths.x, depths.y), 0.0, 1.0);`)
}
