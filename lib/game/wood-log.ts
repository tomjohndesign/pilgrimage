import * as THREE from "three"
import { BASE_CHARACTER_SCALE, PERSON_SPRITE_SCALE } from "./base-person/gait"
import { BASE_PERSON } from "./base-person/pose"

/** The character's chopping round is the source for carried and stored timber. */
export const WOOD_LOG = {
  radius: 0.14,
  length: 0.38,
  segments: 12,
  bark: "#785637",
  endGrain: "#d6b57b",
} as const

/** Rig units to world tiles, using the same projection as the character bake. */
export function woodLogScale(characterScale = BASE_CHARACTER_SCALE): number {
  return PERSON_SPRITE_SCALE / BASE_PERSON.camera.viewSize * characterScale
}

/** Cylinder material groups are bark, top end grain, bottom end grain. */
export function createWoodLogGeometry(side?: number): THREE.CylinderGeometry {
  const { radius, length, segments } = WOOD_LOG
  return side === undefined
    ? new THREE.CylinderGeometry(radius, radius, length, segments)
    : new THREE.CylinderGeometry(radius, radius, length, segments / 2, 1, false,
      side < 0 ? Math.PI : 0, Math.PI)
}
