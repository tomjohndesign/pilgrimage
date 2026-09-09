import { makeRng } from "../rng"
import type { BuildingPart, Vec3 } from "./geometry"

/** One building owns half of a common stack, with its own enclosed flue. */
export interface SharedChimney {
  side: -1 | 1
  /** Centre of the party wall, in this building's local coordinates. */
  x: number
  z: number
  bottom: number
  top: number
}

export function sharedChimneyMouth(stack: SharedChimney): Vec3 {
  return [stack.x - stack.side * .18, stack.top + .025, stack.z]
}

/** Rough masonry and two divided mouths replace two separate chimney shafts.
 * The halves meet exactly at the party wall; each roof owns its cutaway half.
 */
export function sharedChimneyParts(stack: SharedChimney, hearth: { x: number; z: number }, seed = 17): BuildingPart[] {
  const random = makeRng(seed), stones = ["#969587", "#858779", "#a09b87", "#808477"]
  const stone = () => stones[Math.floor(random() * stones.length)]
  const parts: BuildingPart[] = [], [mx,,mz] = sharedChimneyMouth(stack)
  const box = (name: string, position: Vec3, size: Vec3, color: string, layer: BuildingPart["layer"] = "roof") =>
    parts.push({ name: `shared-chimney-${name}`, position, size, color, layer, outline: false,
      cutawaySide: layer === "wall" ? [stack.side, 0] : undefined })
  // Corbel each flue toward the common stack without moving either fireplace.
  const throats = Math.max(1, Math.ceil((stack.bottom - .67) / .11))
  for (let i = 0; i < throats; i++) {
    const t = (i + .5) / throats
    box(`throat-${i}`, [hearth.x+(mx-hearth.x)*t, .67+(stack.bottom-.67)*t, hearth.z+(mz-hearth.z)*t],
      [.30, (stack.bottom-.67)/throats+.006, .31], stone(), "wall")
  }
  const shaftTop=stack.top-.065
  const rows = Math.max(1, Math.ceil((shaftTop - stack.bottom) / (.10 + random() * .065)))
  for (let row = 0; row < rows; row++) {
    const y=stack.bottom+(row+.5)*(shaftTop-stack.bottom)/rows
    // Mortar stays within the masonry; there is no open slit along the centre.
    box(`course-${row}`, [stack.x-stack.side*.175,y,stack.z], [.35,(shaftTop-stack.bottom)/rows,.43], stone())
    for (const end of [-1,1]) box(`mortar-${row}-${end}`, [stack.x-stack.side*(.08+random()*.18),y,stack.z+end*.217], [.012,.08,.006], "#73796d")
  }
  if (seed % 3 !== 0) box("cap-course", [stack.x-stack.side*.19,stack.top-.115,stack.z],
    [.38,.065,.48],stone())
  // Each half supplies its outer rim and half the central divider.
  box("outer-rim", [stack.x-stack.side*.325,stack.top,stack.z], [.07,.08,.47], "#a0a28e")
  box("divider", [stack.x-stack.side*.0175,stack.top,stack.z], [.035,.08,.47], "#a0a28e")
  for(const end of [-1,1]) box(`end-rim-${end}`, [stack.x-stack.side*.175,stack.top,stack.z+end*.20], [.28,.08,.07], "#a0a28e")
  box("mouth", [mx,stack.top-.045,mz], [.25,.012,.33], "#30342e")
  return parts
}
