import type { BuildingDef } from "../map/types"
import { constructionStage } from "../construction"
import type { BuildingPart } from "./geometry"
import { structureParts } from "./structure"

/** Staged site artwork uses the same geometry, pixel grid and ID pass as finished buildings. */
export function constructionParts(building: BuildingDef): BuildingPart[] {
  const stage = constructionStage(building)
  const finished = structureParts(building)
  if (stage === 3) return finished
  const parts: BuildingPart[] = stage === 2 ? finished.filter(p => p.layer !== "roof") : finished.filter(p => p.layer === "base")
  const w = building.w - 0.3, d = building.d - 0.3, h = Math.max(0.65, building.height)
  const box = (name: string, position: [number, number, number], size: [number, number, number], color: string) =>
    parts.push({ name: `construction-${name}`, layer: "wall", position, size, color })
  box("earth", [0, 0.025, 0], [w, 0.05, d], "#8d785a")
  for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) {
    box(`post-${x}-${z}`, [x, (stage ? h : 0.25) / 2, z], [0.09, stage ? h : 0.25, 0.09], "#785638")
  }
  if (stage >= 1) {
    for (const z of [-d / 2, d / 2]) box(`rail-${z}`, [0, h * 0.8, z], [w, 0.09, 0.1], "#ad8755")
    for (const x of [-w / 2, w / 2]) {
      box(`side-rail-${x}`, [x, h * 0.8, 0], [0.09, 0.09, d], "#ad8755")
      box(`platform-${x}`, [x * 0.85, h * 0.45, 0], [0.22, 0.07, d], "#b89968")
    }
  }
  for (let i = 0; i < 4; i++) box(`planks-${i}`, [-w * 0.22, 0.09 + i * 0.055, d * 0.22], [w * 0.45, 0.045, 0.16], i % 2 ? "#b58e59" : "#997345")
  return parts
}
