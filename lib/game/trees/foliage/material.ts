import * as THREE from "three"
import { applySpriteDepth } from "../../render/sprite-depth"
import { FOLIAGE_FRAME } from "./design"

/** One instanced billboard shader and its matching ID shader share atlas registration. */
export function foliageMaterial(color: THREE.Texture, depth: THREE.Texture, view: { value: number },
  worldTexel: { value: number }, ids = false) {
  const viewport = new THREE.Vector4()
  const material = new THREE.MeshBasicMaterial({ map: color, alphaTest: 0.5, transparent: false, toneMapped: false, side: THREE.DoubleSide })
  material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
  material.onBeforeCompile = shader => {
    shader.uniforms.foliageView = view
    shader.vertexShader = `uniform float foliageView;
      attribute vec2 foliageFrame;
      attribute vec3 foliageId;
      flat varying vec3 vFoliageId;\n` + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
      float column = mod(foliageView + foliageFrame.x, ${FOLIAGE_FRAME.directions}.0);
      vMapUv = (uv + vec2(column, ${FOLIAGE_FRAME.rows - 1}.0 - foliageFrame.y)) / vec2(${FOLIAGE_FRAME.directions}.0, ${FOLIAGE_FRAME.rows}.0);
      vFoliageId = foliageId;`)
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
      vec4 foliageAnchor = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float foliageSize = ${FOLIAGE_FRAME.extent} * length(mat3(modelMatrix) * instanceMatrix[0].xyz);
      vec4 mvPosition = viewMatrix * foliageAnchor;
      mvPosition.xy += position.xy * foliageSize;
      gl_Position = projectionMatrix * mvPosition;`)
    applySpriteDepth(shader, viewport, worldTexel, { value: new THREE.Vector4(0, 1, 0, 0) },
      { map: { value: depth }, enabled: { value: true } },
      { anchor: "foliageAnchor", size: "foliageSize", ground: "vec4(0.0, 1.0, 0.0, -foliageAnchor.y)" })
    if (ids) {
      shader.fragmentShader = "flat varying vec3 vFoliageId;\n" + shader.fragmentShader.replace("#include <opaque_fragment>",
        "outgoingLight = vFoliageId;\n#include <opaque_fragment>")
    }
  }
  material.customProgramCacheKey = () => `foliage-depth-v1-${ids ? "ids" : "color"}`
  return material
}
