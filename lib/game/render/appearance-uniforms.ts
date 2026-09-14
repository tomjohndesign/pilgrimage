import * as THREE from "three"
import { defaultAppearance, APPEARANCE_GROUPS, type Appearance, type AppearanceGroup } from "../appearance"

const defaults = defaultAppearance()
export const grassAppearanceUniforms = {
  grassBaseColor: { value: new THREE.Color(defaults.grass.color) },
  grassBrightness: { value: defaults.grass.brightness }, grassSaturation: { value: defaults.grass.saturation },
  grassShading: { value: defaults.grass.shading }, grassCanopyShade: { value: defaults.grass.canopyShade },
}
const data = new Float32Array(256 * 4)
const edits = new THREE.DataTexture(data, 256, 1, THREE.RGBAFormat, THREE.FloatType)
edits.minFilter = edits.magFilter = THREE.NearestFilter
edits.needsUpdate = true
const count = { value: 0 }
export const assetAppearanceUniforms = Object.fromEntries(APPEARANCE_GROUPS.map(group => [group, {
  appearanceFactors: { value: new THREE.Vector2(defaults.assets.saturation * defaults.groups[group].saturation, defaults.assets.brightness * defaults.groups[group].brightness) }, appearanceEdits: { value: edits }, appearanceEditCount: count,
}])) as Record<AppearanceGroup, { appearanceFactors: { value: THREE.Vector2 }; appearanceEdits: { value: THREE.DataTexture }; appearanceEditCount: { value: number } }>
export function updateAppearanceUniforms(value: Appearance, objects: Array<{ id: number; saturation: number; brightness: number }>) {
  grassAppearanceUniforms.grassBaseColor.value.set(value.grass.color)
  grassAppearanceUniforms.grassBrightness.value = value.grass.brightness
  grassAppearanceUniforms.grassSaturation.value = value.grass.saturation
  grassAppearanceUniforms.grassShading.value = value.grass.shading
  grassAppearanceUniforms.grassCanopyShade.value = value.grass.canopyShade
  for (const group of APPEARANCE_GROUPS) assetAppearanceUniforms[group].appearanceFactors.value.set(
    value.assets.saturation * value.groups[group].saturation, value.assets.brightness * value.groups[group].brightness)
  const sorted = objects.filter(item => item.id > 0).sort((a,b) => a.id - b.id).slice(0,256)
  data.fill(0)
  sorted.forEach((item,i) => data.set([item.id,item.saturation,item.brightness,0],i*4))
  count.value = sorted.length; edits.needsUpdate = true
}

/** Resolve sparse per-object edits in the vertex shader, leaving pixel size and render passes intact. */
export function applyAppearance(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], group: AppearanceGroup, idExpression: string, vertexDeclaration = "", objectEdits = true) {
  Object.assign(shader.uniforms, assetAppearanceUniforms[group])
  // Published palettes use only two uniform factors; per-object lookups belong to the editor.
  shader.vertexShader = objectEdits ? `${vertexDeclaration}
    uniform vec2 appearanceFactors;
    uniform sampler2D appearanceEdits;
    uniform float appearanceEditCount;
    varying vec2 vAppearanceFactors;
    vec2 appearanceFor(float id) {
      float low = 0.0, high = appearanceEditCount - 1.0;
      for (int step = 0; step < 9; step++) {
        if (low > high || id < 0.5) break;
        float mid = floor((low + high) * 0.5);
        vec3 edit = texture2D(appearanceEdits, vec2((mid + 0.5) / 256.0, 0.5)).rgb;
        if (abs(edit.r - id) < 0.5) return appearanceFactors * edit.gb;
        if (edit.r < id) low = mid + 1.0; else high = mid - 1.0;
      }
      return appearanceFactors;
    }
    float appearanceId(vec3 encoded) { return dot(floor(encoded * 255.0 + 0.5), vec3(1.0,256.0,65536.0)); }
  ` + shader.vertexShader.replace("void main() {", `void main() {\nvAppearanceFactors = appearanceFor(${idExpression});`)
    : "uniform vec2 appearanceFactors;\nvarying vec2 vAppearanceFactors;\n"
      + shader.vertexShader.replace("void main() {", "void main() {\nvAppearanceFactors = appearanceFactors;")
  shader.fragmentShader = "varying vec2 vAppearanceFactors;\n" + shader.fragmentShader.replace("#include <tonemapping_fragment>", `
    float appearanceLuma = dot(gl_FragColor.rgb, vec3(0.2126,0.7152,0.0722));
    gl_FragColor.rgb = max(vec3(0.0), mix(vec3(appearanceLuma),gl_FragColor.rgb,vAppearanceFactors.x)) * vAppearanceFactors.y;
    #include <tonemapping_fragment>`)
}
