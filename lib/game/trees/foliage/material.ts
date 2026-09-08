import * as THREE from "three"
import { applySpriteDepth } from "../../render/sprite-depth"
import { FOLIAGE_FRAME } from "./design"

export interface FoliageSpriteFrame {
  directions: number
  rows: number
  extent: number
  anchor: readonly [number, number]
  cellSize: number
}

/** One instanced billboard shader and its matching ID shader share atlas registration. */
export function foliageMaterial(color: THREE.Texture, depth: THREE.Texture, view: { value: number },
  worldTexel: { value: number }, ids = false, frame: FoliageSpriteFrame = FOLIAGE_FRAME, crop?: THREE.DataTexture) {
  const viewport = new THREE.Vector4()
  const material = new THREE.MeshBasicMaterial({ map: color, alphaTest: 0.5, transparent: false, toneMapped: false, side: THREE.DoubleSide })
  material.onBeforeRender = renderer => { renderer.getCurrentViewport(viewport) }
  material.onBeforeCompile = shader => {
    shader.uniforms.foliageView = view
    shader.uniforms.foliageCrop = { value: crop ?? null }
    shader.uniforms.foliageCropped = { value: !!crop }
    shader.uniforms.foliageViewport = { value: viewport }
    shader.vertexShader = `uniform float foliageView;
      uniform sampler2D foliageCrop;
      uniform bool foliageCropped;
      attribute vec2 foliageFrame;
      attribute vec3 foliageId;
      flat varying vec4 vFoliageRect;
      flat varying vec2 vFoliageCell;
      flat varying vec3 vFoliageId;\n` + shader.vertexShader
    shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>", `#include <uv_vertex>
      float column = mod(foliageView + foliageFrame.x, ${frame.directions}.0);
      vec2 foliageUv = uv;
      if (foliageCropped) {
        vec4 bounds = texture2D(foliageCrop, vec2((column + 0.5) / ${frame.directions}.0, (foliageFrame.y + 0.5) / ${frame.rows}.0));
        foliageUv = mix(bounds.xy, bounds.zw, uv);
      }
      vMapUv = (foliageUv + vec2(column, ${frame.rows - 1}.0 - foliageFrame.y)) / vec2(${frame.directions}.0, ${frame.rows}.0);
      vFoliageId = foliageId;`)
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
      vec4 foliageAnchor = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float foliageSize = ${frame.extent} * length(mat3(modelMatrix) * instanceMatrix[0].xyz);
      vec4 mvPosition = viewMatrix * foliageAnchor;
      vec2 foliagePosition = foliageCropped
        ? foliageUv + vec2(-0.5, ${frame.anchor[1] / frame.cellSize - 1}) : position.xy;
      vec2 foliageScreenSize = vec2(projectionMatrix[0][0], projectionMatrix[1][1]) * foliageSize * 0.5;
      vec4 foliageClipAnchor = projectionMatrix * mvPosition;
      vFoliageRect = vec4(foliageClipAnchor.xy * 0.5 + 0.5
        + vec2(-0.5, ${frame.anchor[1] / frame.cellSize - 1}) * foliageScreenSize, foliageScreenSize);
      vFoliageCell = vec2(column, ${frame.rows - 1}.0 - foliageFrame.y);
      mvPosition.xy += foliagePosition * foliageSize;
      gl_Position = projectionMatrix * mvPosition;
      `)
    applySpriteDepth(shader, viewport, worldTexel, { value: new THREE.Vector4(0, 1, 0, 0) },
      { map: { value: depth }, enabled: { value: true } },
      { anchor: "foliageAnchor", size: "foliageSize", ground: "vec4(0.0, 1.0, 0.0, -foliageAnchor.y)" })
    // Rasterizers round each quad's vertices to subpixels. Interpolated atlas
    // coordinates therefore change when transparent padding is trimmed. Sample
    // from the flat, original billboard rectangle so color and depth stay exact
    // through cropping, panning, and changes of render-target size.
    shader.fragmentShader = `flat varying vec4 vFoliageRect;
      flat varying vec2 vFoliageCell;
      uniform vec4 foliageViewport;\n` + shader.fragmentShader
      .replace("#include <map_fragment>", THREE.ShaderChunk.map_fragment)
      .replaceAll("vMapUv", "foliageSampleUv")
      .replace("void main() {", `void main() {
        vec2 foliageSampleUv = (((gl_FragCoord.xy - foliageViewport.xy) / foliageViewport.zw
          - vFoliageRect.xy) / vFoliageRect.zw + vFoliageCell)
          / vec2(${frame.directions}.0, ${frame.rows}.0);`)
    if (!ids) {
      // Use the original atlas height so cropped billboards retain the same shading.
      shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>",
        `#include <color_fragment>
        diffuseColor.rgb *= mix(0.56, 1.0, smoothstep(0.16, 0.72, foliageSampleUv.y * ${frame.rows}.0 - vFoliageCell.y));`)
    }
    if (ids) {
      shader.fragmentShader = "flat varying vec3 vFoliageId;\n" + shader.fragmentShader.replace("#include <opaque_fragment>",
        "outgoingLight = vFoliageId;\n#include <opaque_fragment>")
    }
  }
  material.customProgramCacheKey = () => `foliage-depth-v4-${frame.directions}-${frame.rows}-${frame.extent}-${frame.anchor.join("-")}-${frame.cellSize}-${ids ? "ids" : "color"}`
  return material
}
