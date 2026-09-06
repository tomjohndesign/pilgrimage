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
export function applySpriteDepth(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], viewport: THREE.Vector4, worldTexel = { value: 0 },
  groundPlane = { value: { x: 0, y: 0, z: 0, w: 0 } }) {
  shader.uniforms.spriteWorldTexel = worldTexel
  shader.uniforms.spriteViewport = { value: viewport }
  shader.uniforms.spriteGroundPlane = groundPlane
  shader.vertexShader = "flat varying vec4 vSpritePlanes;\nflat varying float vSpriteGroundX;\nuniform float spriteWorldTexel;\nuniform vec4 spriteGroundPlane;\n" + shader.vertexShader.replace(
    "#include <fog_vertex>", `#include <fog_vertex>
    vec4 anchor = projectionMatrix * modelViewMatrix[3];
    float anchorY = anchor.y * 0.5 + 0.5;
    float depthScale = abs(projectionMatrix[2][2]) * 0.5;
    float anchorDepth = anchor.z * 0.5 + 0.5 - 0.005 * depthScale;
    float pitch = max(0.01, abs(viewMatrix[1][2] / viewMatrix[1][1]));
    // Project the actual ground normal into camera space. Both screen axes
    // matter on a diagonal hillside; a horizontal toe plane cuts into it.
    vec3 normal = spriteGroundPlane.y > 0.0 ? spriteGroundPlane.xyz : vec3(0.0, 1.0, 0.0);
    vec3 viewNormal = mat3(viewMatrix) * normal;
    float toward = max(0.05, viewNormal.z);
    vec2 grade = viewNormal.xy / toward;
    float planeOffset = spriteGroundPlane.y > 0.0
      ? dot(spriteGroundPlane, modelMatrix[3]) / toward : 0.0;
    vec2 slopes = vec2(pitch, -grade.y) * (2.0 / projectionMatrix[1][1]) * depthScale;
    vSpriteGroundX = -grade.x * (2.0 / projectionMatrix[0][0]) * depthScale;
    float clearance = 0.5 * spriteWorldTexel * (abs(grade.x) + abs(grade.y)) * depthScale;
    vSpritePlanes = vec4(anchorDepth + anchorY * slopes, slopes);
    vSpritePlanes.y += (anchor.x * 0.5 + 0.5) * vSpriteGroundX + planeOffset * depthScale - clearance;`)
  shader.fragmentShader = "flat varying vec4 vSpritePlanes;\nflat varying float vSpriteGroundX;\nuniform vec4 spriteViewport;\n" + shader.fragmentShader.replace(
    "#include <logdepthbuf_fragment>", `#include <logdepthbuf_fragment>
    float screenY = (gl_FragCoord.y - spriteViewport.y) / spriteViewport.w;
    vec2 depths = vSpritePlanes.xy - screenY * vSpritePlanes.zw;
    depths.y -= (gl_FragCoord.x - spriteViewport.x) / spriteViewport.z * vSpriteGroundX;
    gl_FragDepth = clamp(min(depths.x, depths.y), 0.0, 1.0);`)
}
