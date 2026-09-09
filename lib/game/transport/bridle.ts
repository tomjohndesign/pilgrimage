import * as THREE from "three"
import { animalProfile, type Animal, type HorseVariant } from "./assets"
import { animalMotion, spinePoint } from "./animal-pose"
import type { Point3 } from "../base-person/pose"

export function animalHead(kind: Animal, variant: HorseVariant) {
  const donkey = kind === "donkey", noble = !donkey && variant === "noble"
  return { neckOrigin: [0, animalProfile(kind, variant).legHeight + 0.18, 0.58] as Point3,
    poll: (noble ? [0, 1.02, 0.4] : donkey ? [0, 0.39, 0.64] : [0, 0.58, 0.75]) as Point3,
    faceLength: donkey ? 0.88 : 1, faceForward: noble ? 0.86 : 1, restPitch: donkey ? 0.16 : noble ? -0.05 : 0.10 }
}
export function bitLocal(kind: Animal, variant: HorseVariant, side: number): Point3 {
  const head = animalHead(kind, variant)
  return [side * 0.15, -0.46 * head.faceLength, 0.51 * head.faceForward]
}
/** Same articulated neck and jaw transforms as the baked animal. */
export function animalBit(kind: Animal, variant: HorseVariant, phase: number, moving: boolean, side: number): Point3 {
  const head = animalHead(kind, variant), motion = animalMotion(kind, phase, moving, variant)
  return new THREE.Vector3(...bitLocal(kind, variant, side))
    .applyAxisAngle(new THREE.Vector3(1, 0, 0), head.restPitch + motion.head).add(new THREE.Vector3(...head.poll))
    .applyEuler(new THREE.Euler(motion.pitch + motion.neck, 0, motion.roll))
    .add(new THREE.Vector3(...spinePoint(head.neckOrigin, kind, phase, moving, variant))).toArray() as Point3
}
