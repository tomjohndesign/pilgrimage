import * as THREE from "three"

let nextSpriteOrder = 1
/** Color and ID passes must resolve coincident people/transport in the same order. */
export function spriteRenderOrder() { return nextSpriteOrder++ }

export interface SpritePoseDepth {
  map: { value: THREE.Texture | null }
  enabled: { value: boolean }
}

/** Depth is data. Share the immutable atlas; its UVs come from the color map. */
export function configureSpriteDepthTexture(texture: THREE.Texture) {
  if (texture.colorSpace === THREE.NoColorSpace && texture.minFilter === THREE.NearestFilter &&
    texture.magFilter === THREE.NearestFilter && !texture.generateMipmaps) return texture
  texture.colorSpace = THREE.NoColorSpace
  texture.minFilter = texture.magFilter = THREE.NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}

/**
 * Per-pixel rig depth and grounded toes, with a small clearance above terrain.
 * Every baked frame carries a camera-relative depth atlas in the color map's
 * exact pixel grid. Cell-normalized offsets follow the sprite's world scale.
 * The upright fallback is only for archived artwork without a source rig.
 * Compute the fallback and ground planes from the anchor, then sample them at screen Y.
 * Interpolating UV height separately on each quad causes coplanar sprites of
 * different sizes to disagree by a depth-buffer step, producing striped overlaps.
 * Flat coefficients make coincident sprites agree across both triangles and
 * across the color/ID passes. The viewport must match the current render target.
 * The ground plane also clears half an enlarged terrain texel: its nearest
 * depth sample can be closer than the real ground under a display pixel.
 * Keep that extra clearance off the upright plane to preserve body occlusion.
 * Like the game's cameras, this depth model is orthographic.
 * `bias` (world units toward the camera) is the painter's order from
 * render/overlap-order for figures sharing a spot; it moves the whole figure,
 * ground contact included, and stays zero for everyone standing alone.
 */
export function applySpriteDepth(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], viewport: THREE.Vector4, worldTexel = { value: 0 },
  groundPlane = { value: { x: 0, y: 0, z: 0, w: 0 } }, pose?: SpritePoseDepth,
  instance?: { anchor: string; size: string; ground: string; viewAnchor?: string; bias?: string }, bias = { value: 0 }) {
  shader.uniforms.spriteWorldTexel = worldTexel
  shader.uniforms.spriteViewport = { value: viewport }
  shader.uniforms.spriteGroundPlane = groundPlane
  shader.uniforms.spritePoseDepth = pose?.map ?? { value: null }
  shader.uniforms.spriteHasPoseDepth = pose?.enabled ?? { value: false }
  shader.uniforms.spriteDepthBias = bias
  shader.vertexShader = "flat varying vec2 vSpritePoseDepth;\nflat varying float vSpriteDepthBias;\nuniform float spriteDepthBias;\n" + shader.vertexShader
  shader.vertexShader = "flat varying vec4 vSpritePlanes;\nflat varying float vSpriteGroundX;\nuniform float spriteWorldTexel;\nuniform vec4 spriteGroundPlane;\n" + shader.vertexShader.replace(
    "#include <fog_vertex>", `#include <fog_vertex>
    vec4 anchor = projectionMatrix * ${instance?.viewAnchor ?? (instance ? `viewMatrix * ${instance.anchor}` : "modelViewMatrix[3]")};
    float anchorY = anchor.y * 0.5 + 0.5;
    float depthScale = abs(projectionMatrix[2][2]) * 0.5;
    float anchorDepth = anchor.z * 0.5 + 0.5 - 0.005 * depthScale;
    vSpritePoseDepth = vec2(anchorDepth, ${instance?.size ?? "length(modelMatrix[0].xyz)"} * depthScale);
    vSpriteDepthBias = ${instance?.bias ?? "spriteDepthBias"} * depthScale;
    float pitch = max(0.01, abs(viewMatrix[1][2] / viewMatrix[1][1]));
    // Project the actual ground normal into camera space. Both screen axes
    // matter on a diagonal hillside; a horizontal toe plane cuts into it.
    vec4 ground = ${instance?.ground ?? "spriteGroundPlane"};
    vec3 normal = ground.y > 0.0 ? ground.xyz : vec3(0.0, 1.0, 0.0);
    vec3 viewNormal = mat3(viewMatrix) * normal;
    float toward = max(0.05, viewNormal.z);
    vec2 grade = viewNormal.xy / toward;
    float planeOffset = ground.y > 0.0
      ? dot(ground, ${instance?.anchor ?? "modelMatrix[3]"}) / toward : 0.0;
    vec2 slopes = vec2(pitch, -grade.y) * (2.0 / projectionMatrix[1][1]) * depthScale;
    vSpriteGroundX = -grade.x * (2.0 / projectionMatrix[0][0]) * depthScale;
    float clearance = 0.5 * spriteWorldTexel * (abs(grade.x) + abs(grade.y)) * depthScale;
    vSpritePlanes = vec4(anchorDepth + anchorY * slopes, slopes);
    vSpritePlanes.y += (anchor.x * 0.5 + 0.5) * vSpriteGroundX + planeOffset * depthScale - clearance;`)
  shader.fragmentShader = "flat varying vec2 vSpritePoseDepth;\nflat varying float vSpriteDepthBias;\nuniform sampler2D spritePoseDepth;\nuniform bool spriteHasPoseDepth;\nuniform vec4 spriteGroundPlane;\nflat varying vec4 vSpritePlanes;\nflat varying float vSpriteGroundX;\nuniform vec4 spriteViewport;\n" + shader.fragmentShader.replace(
    "#include <logdepthbuf_fragment>", `#include <logdepthbuf_fragment>
    float screenY = (gl_FragCoord.y - spriteViewport.y) / spriteViewport.w;
    vec2 depths = vSpritePlanes.xy - screenY * vSpritePlanes.zw;
    depths.y -= (gl_FragCoord.x - spriteViewport.x) / spriteViewport.z * vSpriteGroundX;
    #ifdef USE_MAP
      if (spriteHasPoseDepth) {
        vec2 packed = texture2D(spritePoseDepth, vMapUv).rg;
        float offset = (dot(packed, vec2(65280.0, 255.0)) / 65535.0 - 0.5) * 2.0;
        depths.x = vSpritePoseDepth.x - offset * vSpritePoseDepth.y;
        if (spriteGroundPlane.y <= 0.0) depths.y = 1.0;
      }
    #endif
    gl_FragDepth = clamp(min(depths.x, depths.y) - vSpriteDepthBias, 0.0, 1.0);`)
}
