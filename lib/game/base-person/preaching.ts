import type { Point3 } from "./pose"

/** A four-second sermon: raised right hand, then an open invitation with the left. */
export function preachingMotion(phase: number, b: { shoulderOffset: number; shoulderHeight: number; hipHeight: number; upperArmLength: number; forearmLength: number }) {
  const cycle = ((phase % 1 + 1) % 1) * Math.PI * 2
  const emphasis = (1 - Math.cos(cycle)) / 2
  const open = (1 + Math.sin(cycle)) / 2
  const reach = b.upperArmLength + b.forearmLength
  const shoulder = b.shoulderHeight - b.hipHeight
  return {
    right: [-b.shoulderOffset - reach * (0.2 + emphasis * 0.25),
      shoulder + reach * (0.12 + emphasis * 0.52), reach * 0.32] as Point3,
    left: [b.shoulderOffset + reach * (0.12 + open * 0.4),
      shoulder - reach * (0.48 - open * 0.3), reach * (0.3 + open * 0.14)] as Point3,
    turn: Math.sin(cycle) * 0.09,
    nod: 0.035 + Math.sin(cycle * 2) * 0.035,
  }
}
