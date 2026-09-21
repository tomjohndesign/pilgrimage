import { coopLayout } from "../coop-layout"
import type { BuildingPart, Vec3 } from "./geometry"
import type { BuildingRecipe } from "./style"
import { thatchSurface } from "./thatch"

/** Rear half is sheltered; the front half stays open to the sky. All dimensions are tile units. */
export function chickenCoopParts(recipe: Pick<BuildingRecipe, "width" | "depth" | "wallHeight" | "roofRise" | "seed">): BuildingPart[] {
  const parts: BuildingPart[] = [], w = recipe.width, d = recipe.depth
  const h = recipe.wallHeight, back = -d / 2 + .05, front = d / 2 - .05, edge = w / 2 - .05
  const layout = coopLayout(w, d), roofAt = (z: number) => h + recipe.roofRise * (.045 - z) / (d / 2 + .045)
  const timber = "#88704e", pale = "#aa9065", dark = "#655139"
  const box = (name: string, layer: BuildingPart["layer"], position: Vec3, size: Vec3, color = timber) =>
    parts.push({ name, layer, position, size, color, outline: false })
  box("floor", "base", [0, -.011, 0], [w - .08, .024, d - .08], "#ffffff")
  parts[0].surface = "trail"
  box("coop-straw", "interior", [0, .035, back / 2], [w - .22, .025, -back - .1], "#b8a16a")
  // Upright split boards, low enough to tend from outside. No wire mesh or modern hardware.
  for (let i = 0; i < Math.ceil(w / .16); i++) {
    const n = Math.ceil(w / .16), x = -edge + (i + .5) * edge * 2 / n
    const boardWidth = edge * 2 / n - .008, top = roofAt(back)
    if (Math.abs(x) + boardWidth / 2 < layout.hatchWidth / 2) {
      box(`coop-back-below-${i}`, "wall", [x, layout.hatchBottom / 2, back], [boardWidth, layout.hatchBottom, .055], i % 3 ? timber : pale)
      const sill = layout.hatchBottom + layout.hatchHeight
      box(`coop-back-above-${i}`, "wall", [x, (top + sill) / 2, back], [boardWidth, top - sill, .055], i % 3 ? timber : pale)
    } else box(`coop-back-board-${i}`, "wall", [x, top / 2, back], [boardWidth, top, .055], i % 3 ? timber : pale)
    // A real pop-hole in the centre joins shelter and run.
    if (Math.abs(x) > .19) box(`coop-front-board-${i}`, "wall", [x, h / 2, 0], [edge * 2 / n - .008, h, .055], i % 3 ? timber : pale)
  }
  box("coop-pop-hole-lintel", "wall", [0, h - .055, 0], [.4, .11, .065], dark)
  for (const side of [-1, 1]) {
    // Boards follow the actual shed slope all the way up to its underside.
    const count = Math.ceil(-back / .14)
    for (let i = 0; i < count; i++) {
      const z = back + (i + .5) * -back / count, top = roofAt(z - (-back / count) / 2)
      box(`coop-side-${side}-${i}`, "wall", [side * edge, top / 2, z], [.055, top, -back / count + .004], i % 3 ? timber : pale)
    }
    for (const z of [back, 0, front]) box(`coop-post-${side}-${z}`, "wall", [side * edge, z > 0 ? .19 : h / 2, z], [.075, z > 0 ? .38 : h, .075], dark)
    // Woven horizontal rods and slim stakes form the low run fence.
    for (let i = 0; i <= 6; i++) box(`run-side-stake-${side}-${i}`, "wall", [side * edge, .18, i * front / 6], [.035, .36, .035], pale)
    for (let i = 0; i < 4; i++) box(`run-side-weave-${side}-${i}`, "wall", [side * edge, .08 + i * .072, front / 2], [.025, .03, front], timber)
  }
  const hatchY = layout.hatchBottom + layout.hatchHeight / 2, hatchStart = parts.length
  box("coop-egg-hatch", "wall", [0, hatchY, back - .015], [layout.hatchWidth, layout.hatchHeight, .025], pale)
  for (const side of [-1, 1]) {
    box(`coop-hatch-batten-${side}`, "wall", [side * layout.hatchWidth * .35, hatchY, back - .035], [.055, layout.hatchHeight, .025], dark)
  }
  box("coop-hatch-latch", "wall", [0, layout.hatchBottom + .045, back - .037], [.12, .035, .025], dark)
  // The flap lifts outward around its upper edge, leaving both nests accessible.
  for (const part of parts.slice(hatchStart)) part.gateHinge = {
    position: [0, layout.hatchBottom + layout.hatchHeight, back - .0275], axis: "x", openAngle: Math.PI * 2 / 3,
  }
  const gateX = -.5, gateWidth = .42
  for (let i = 0; i <= 14; i++) {
    const x = -edge + i * edge * 2 / 14
    box(`run-front-stake-${i}`, "wall", [x, .18, front], [.035, .36, .035], pale)
  }
  for (let i = 0; i < 4; i++) box(`run-front-weave-${i}`, "wall", [0, .08 + i * .072, front], [edge * 2, .03, .025], timber)
  for (const sign of [-1, 1]) box(`run-gate-post-${sign}`, "wall", [gateX + sign * gateWidth / 2, .2, front + .015], [.055, .4, .055], dark)
  box("run-gate-latch", "wall", [gateX + .12, .27, front + .025], [.16, .035, .025], dark)
  box("coop-owner-mark", "wall", [gateX, .27, front + .026], [.13, .08, .012], "#737d57")
  parts[parts.length - 1].playerAccent = true
  // A shallow thatch pitch keeps the raised henhouse compact.
  const high = h + recipe.roofRise
  parts.push(...thatchSurface([-w / 2, high, -d / 2], [w / 2, high, -d / 2], [-w / 2, h, .045], [w / 2, h, .045], recipe.seed, "coop"))
  box("coop-roost", "interior", [0, .16, back * .94], [w - .25, .04, .035], dark)
  for (const x of [-w * .3, w * .3]) {
    box(`coop-nest-${x}`, "interior", [x, .06, back * .7], [.32, .06, .25], pale)
    box(`coop-nest-straw-${x}`, "interior", [x, .096, back * .7], [.25, .025, .19], "#c7ae72")
  }
  // Raise the enclosed half, including the hatch hinges, while the run stays on earth.
  for (const part of parts) {
    if (part.layer !== "roof" && (!part.name.startsWith("coop-") || part.position[2] > 0)) continue
    if (part.vertices) part.vertices = part.vertices.map((value, i) => value + (i % 3 === 1 ? layout.floorHeight : 0))
    else part.position[1] += layout.floorHeight
    if (part.gateHinge) part.gateHinge.position[1] += layout.floorHeight
  }
  box("coop-raised-floor", "base", [0, layout.floorHeight - .025, back / 2], [w - .08, .05, -back + .08], dark)
  for (const side of [-1, 1]) for (const z of [back + .03, -.03]) {
    box(`coop-stilt-${side}-${z}`, "base", [side * (edge - .04), layout.floorHeight / 2, z], [.095, layout.floorHeight, .095], dark)
  }
  const rampAngle = Math.atan2(layout.floorHeight, layout.rampLength)
  const halfRamp = layout.rampWidth / 2
  const a: Vec3 = [-halfRamp, layout.floorHeight, 0], b: Vec3 = [halfRamp, layout.floorHeight, 0]
  const c: Vec3 = [halfRamp, 0, layout.rampLength], e: Vec3 = [-halfRamp, 0, layout.rampLength]
  const lowA: Vec3 = [-halfRamp, layout.floorHeight - .028, 0], lowB: Vec3 = [halfRamp, layout.floorHeight - .028, 0]
  parts.push({ name: "coop-ramp", layer: "interior", position: [0,0,0], color: pale, outline: false,
    vertices: [a,b,c, a,c,e, lowA,e,c, lowA,c,lowB, a,lowA,e, b,c,lowB, a,b,lowB, a,lowB,lowA].flat() })
  for (let i = 1; i < 5; i++) {
    const z = layout.rampLength * i / 5
    box(`coop-ramp-cleat-${i}`, "interior", [0, layout.floorHeight * (1 - z / layout.rampLength) + .009, z], [layout.rampWidth, .018, .028], dark)
    parts[parts.length - 1].rotation = [rampAngle, 0, 0]
  }
  box("coop-feed-trough", "interior", [w * .32, .065, front * .7], [.3, .09, .12], dark)
  box("coop-grain", "interior", [w * .32, .112, front * .7], [.25, .012, .075], "#c4a76b")
  return parts
}
