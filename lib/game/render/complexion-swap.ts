import * as THREE from "three"
import type { ComplexionSwap } from "../base-person/complexion"
import { CHARACTER_PALETTE_SLOTS } from "../player-color"

/**
 * Per-person skin, hair and clothing over shared sprite atlases. Palette steps
 * are authored by the baker; matching them preserves lit folds and leaves
 * unmatched pixels alone. Standalone and batched sprites use the same slots.
 */
export const MATCH_TOLERANCE = 0.001

/** Outside the unit cube, so unused slots never match a sampled texel. */
const UNUSED = () => new THREE.Color(-1, -1, -1)

export interface ComplexionUniforms {
  complexionFrom: { value: THREE.Color[] }
  complexionTo: { value: THREE.Color[] }
}

export function complexionUniforms(swap: ComplexionSwap): ComplexionUniforms {
  const slots = (colors: string[], fallback: () => THREE.Color) => Array.from({ length: CHARACTER_PALETTE_SLOTS },
    (_, index) => index < colors.length ? new THREE.Color(colors[index]) : fallback())
  return { complexionFrom: { value: slots(swap.from, UNUSED) }, complexionTo: { value: slots(swap.to, () => new THREE.Color()) } }
}

/** Same slot count in the shader and the uniform, so one compiled program serves everyone. */
export function applyComplexionSwap(shader: Parameters<THREE.Material["onBeforeCompile"]>[0], uniforms: ComplexionUniforms) {
  shader.uniforms.complexionFrom = uniforms.complexionFrom
  shader.uniforms.complexionTo = uniforms.complexionTo
  shader.fragmentShader = `uniform vec3 complexionFrom[${CHARACTER_PALETTE_SLOTS}];\nuniform vec3 complexionTo[${CHARACTER_PALETTE_SLOTS}];\n` +
    shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
    for (int i = 0; i < ${CHARACTER_PALETTE_SLOTS}; i++) {
      if (all(lessThan(abs(diffuseColor.rgb - complexionFrom[i]), vec3(${MATCH_TOLERANCE})))) {
        diffuseColor.rgb = complexionTo[i];
        break;
      }
    }`)
}
