/** A wooden mallet lifts slowly, strikes quickly, then holds against the timber. */
export const MALLET_HEAD_HEIGHT = 0.42
export const MALLET_CONTACT_REACH = 0.26 + MALLET_HEAD_HEIGHT
export const BUILDING_FRAMES = 24
export function buildingMotion(phase: number) {
  const p = ((phase % 1) + 1) % 1
  const lift = p < 0.6 ? (p / 0.6) ** 2 * (3 - 2 * p / 0.6)
    : p < 0.8 ? 1 - ((p - 0.6) / 0.2) ** 3 : 0
  return { lift, pitch: Math.PI / 2 - lift * 2.25, gripY: -0.22 + lift * 0.1,
    gripZ: 0.26 - lift * 0.08, impact: p >= 0.8 && p < 0.9 }
}
