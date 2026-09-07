import * as THREE from "three"
import { COMPLEXION_SLOTS, type ComplexionSwap } from "../base-person/complexion"

/**
 * Per-person skin and hair colour over shared sprite atlases.
 *
 * Every baked pixel was snapped to the design's own render palette, so a lit
 * skin or hair pixel is exactly one of its eight steps. Matching those steps in
 * the fragment shader recolours one character without a second atlas, and leaves
 * ink, cloth and equipment untouched. The match is exact: the nearest other
 * palette entry is more than five times the tolerance away in working space.
 */
export const MATCH_TOLERANCE = 0.001

/** Outside the unit cube, so unused slots never match a sampled texel. */
const UNUSED = () => new THREE.Color(-1, -1, -1)

export interface ComplexionUniforms {
  complexionFrom: { value: THREE.Color[] }
  complexionTo: { value: THREE.Color[] }
}

export function complexionUniforms(swap: ComplexionSwap): ComplexionUniforms {
  const slots = (colors: string[], fallback: () => THREE.Color) => Array.from({ length: COMPLEXION_SLOTS },
    (_, index) => index < colors.length ? new THREE.Color(colors[index]) : fallback())
  return { complexionFrom: { value: slots(swap.from, UNUSED) }, complexionTo: { value: slots(swap.to, () => new THREE.Color()) } }
}

/** Same slot count in the shader and the uniform, so one compiled program serves everyone. */
export function applyComplexionSwap(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], uniforms: ComplexionUniforms) {
  shader.uniforms.complexionFrom = uniforms.complexionFrom
  shader.uniforms.complexionTo = uniforms.complexionTo
  shader.fragmentShader = `uniform vec3 complexionFrom[${COMPLEXION_SLOTS}];\nuniform vec3 complexionTo[${COMPLEXION_SLOTS}];\n` +
    shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
    for (int i = 0; i < ${COMPLEXION_SLOTS}; i++) {
      if (all(lessThan(abs(diffuseColor.rgb - complexionFrom[i]), vec3(${MATCH_TOLERANCE})))) {
        diffuseColor.rgb = complexionTo[i];
        break;
      }
    }`)
}
