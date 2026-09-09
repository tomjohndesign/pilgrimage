import type { BuildingPart, Vec3 } from "./geometry"
import { signpostParts } from "./structure"

/** Riven timber, wooden pegs and a cord-lashed animal skull; a wordless warning. */
export function forestWarningParts(seed = 0): BuildingPart[] {
  const parts = signpostParts(seed).filter(p => !p.name.includes("cross") && !p.name.includes("board") && !p.name.includes("peg"))
    .map(p => ({ ...p, color: p.name.includes("stone") ? "#68665a" : "#494337" }))
  const box = (name: string, position: Vec3, size: Vec3, color: string, rotation?: Vec3) =>
    parts.push({ name, layer: "wall", position, size, color, rotation, outline: false })
  box("warning-board", [0, .57, 0], [.62, .19, .06], "#61533e", [0, 0, -.06])
  box("warning-board-split", [.19, .53, .032], [.22, .024, .009], "#302e27")
  for (const side of [-1, 1]) {
    box(`warning-peg-${side}`, [side * .11, .57, .038], [.034, .034, .025], "#302e27")
    box(`skull-cheek-${side}`, [side * .088, .88, .048], [.075, .12, .1], "#aaa58a", [0, 0, side * .2])
    box(`skull-eye-${side}`, [side * .068, .913, .108], [.055, .05, .018], "#252924")
    box(`skull-horn-base-${side}`, [side * .145, 1.028, -.014], [.065, .2, .06], "#8e8c77", [0, 0, -side * .55])
    box(`skull-horn-tip-${side}`, [side * .19, 1.13, -.02], [.035, .12, .036], "#b4af94", [0, 0, side * .15])
  }
  box("skull-brow", [0, .96, .035], [.22, .09, .14], "#c1bba0")
  box("skull-nasal-bridge", [0, .847, .08], [.072, .18, .105], "#c1bba0", [-.16, 0, 0])
  box("skull-nose", [0, .769, .133], [.043, .045, .015], "#34362e")
  for (let i = 0; i < 3; i++) box(`skull-lashing-${i}`, [0, .715 + i * .027, .013], [.135, .018, .14], "#8b8060")
  return parts
}
