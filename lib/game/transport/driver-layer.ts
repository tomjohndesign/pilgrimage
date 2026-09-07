import type * as THREE from "three"

/** Merge the registered driver pixels before alpha/depth/selection testing.
 * One cart quad owns both silhouettes at every camera angle. */
export function applyDriverLayer(shader: Parameters<THREE.Material["onBeforeCompile"]>[0],
  texture: THREE.Texture, frame: { value: THREE.Vector4 }, visible: { value: number }) {
  shader.uniforms.cartDriverMap = { value: texture }
  shader.uniforms.cartDriverFrame = frame
  shader.uniforms.cartDriverVisible = visible
  shader.vertexShader = "varying vec2 vCartDriverUv;\nuniform vec4 cartDriverFrame;\n" + shader.vertexShader.replace(
    "#include <uv_vertex>", "#include <uv_vertex>\nvCartDriverUv = uv * cartDriverFrame.zw + cartDriverFrame.xy;")
  shader.fragmentShader = "varying vec2 vCartDriverUv;\nuniform sampler2D cartDriverMap;\nuniform float cartDriverVisible;\n" + shader.fragmentShader.replace(
    "#include <map_fragment>", `#include <map_fragment>
    if (cartDriverVisible > 0.5) {
      vec4 driver = texture2D(cartDriverMap, vCartDriverUv);
      diffuseColor.rgb = mix(diffuseColor.rgb, driver.rgb, driver.a);
      diffuseColor.a = max(diffuseColor.a, driver.a);
    }`)
}
