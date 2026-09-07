import { buildingEntry } from "@/lib/game/building-rotation"
import type { BuildingDef } from "@/lib/game/map/types"
import { coords, DEPTH, journeyPosition, neighbors, ROAD_Z, WIDTH, type PathWorld } from "@/lib/path-lab/simulation"

import { CELL, drawPathSurface } from "@/lib/path-lab/road-surface"
export { CELL } from "@/lib/path-lab/road-surface"
export type MapLayer = "ground" | "wear" | "frontage"
export interface MapView { layer: MapLayer; grid: boolean; routes: boolean; selected: number | null; candidate?: BuildingDef; valid?: boolean }
const snap = (n: number) => Math.round(n / 2) * 2

/** Schematic markers, not character sprites. One fixed pixel grid covers the whole map. */
export function drawPathMap(ctx: CanvasRenderingContext2D, world: PathWorld, view: MapView) {
  ctx.clearRect(0, 0, WIDTH * CELL, DEPTH * CELL)
  ctx.fillStyle = "#75804f"; ctx.fillRect(0, 0, WIDTH * CELL, DEPTH * CELL)
  for (let i = 0; i < world.wear.length; i++) {
    const { x, z } = coords(i), px = x * CELL, pz = z * CELL, wear = world.wear[i]
    ctx.fillStyle = (x * 3 + z * 7) % 5 === 0 ? "#7b8553" : "#75804f"
    ctx.fillRect(px, pz, CELL, CELL)
    ctx.fillStyle = "#657344"; ctx.fillRect(px + ((x * 7 + z * 3) % 10) * 2, pz + ((x * 3 + z * 7) % 10) * 2, 2, 2)
    if (world.blocked[i] === 1) {
      ctx.fillStyle = "#3f5339"; ctx.fillRect(px + 2, pz + 2, 20, 20)
      ctx.fillStyle = "#526a43"; ctx.fillRect(px + 4, pz + 4, 12, 10)
    }
    if (view.layer === "wear") {
      ctx.fillStyle = `rgb(${Math.round(75 + wear * 148)},${Math.round(91 + wear * 73)},${Math.round(58 + wear * 29)})`
      if (!world.blocked[i]) ctx.fillRect(px, pz, CELL, CELL)
    }
  }
  if (view.layer !== "wear") drawPathSurface(ctx, world)
  for (let i = 0; i < world.wear.length; i++) {
    const { x, z } = coords(i), px = x * CELL, pz = z * CELL
    if (view.layer === "frontage" && !world.blocked[i]) {
      if (world.connected[i]) { ctx.fillStyle = "#dfbd73bb"; ctx.fillRect(px + 4, pz + 4, 16, 16) }
      else if (neighbors(i).some(n => world.connected[n])) { ctx.fillStyle = "#a8d6b088"; ctx.fillRect(px + 2, pz + 2, 20, 20) }
    }
    if (view.grid) { ctx.strokeStyle = "#29332524"; ctx.lineWidth = 1; ctx.strokeRect(px + .5, pz + .5, CELL, CELL) }
  }
  if (view.routes) {
    const seen = new Set<string>()
    ctx.strokeStyle = "#f2e8d58c"; ctx.lineWidth = 2; ctx.setLineDash([4, 6])
    for (const journey of world.journeys) {
      const key = journey.route.join(",")
      if (seen.has(key)) continue
      seen.add(key); ctx.beginPath()
      journey.route.forEach((i, n) => { const p = coords(i); if (n === 0) ctx.moveTo((p.x + .5) * CELL, (p.z + .5) * CELL); else ctx.lineTo((p.x + .5) * CELL, (p.z + .5) * CELL) })
      ctx.stroke()
    }
    ctx.setLineDash([])
  }
  const drawBuilding = (b: BuildingDef, color: string, preview = false) => {
    ctx.fillStyle = "#30291f"; ctx.fillRect(b.x * CELL, b.z * CELL, b.w * CELL, b.d * CELL)
    ctx.fillStyle = color; ctx.fillRect(b.x * CELL + 2, b.z * CELL + 2, b.w * CELL - 4, b.d * CELL - 4)
    ctx.fillStyle = "#f2e8d5"; ctx.font = "10px Georgia"; ctx.textAlign = "center"
    ctx.fillText(`${b.buildType === "workshop" ? "HUT" : "REST"} ${preview ? world.buildings.length + 1 : world.buildings.findIndex(item => item.id === b.id) + 1}`, (b.x + 1) * CELL, (b.z + 1) * CELL + 4)
    const entry = buildingEntry(b)
    ctx.fillStyle = preview ? color : "#ecd396"; ctx.fillRect(entry.x * CELL + 8, entry.z * CELL + 8, 8, 8)
  }
  world.buildings.forEach(b => drawBuilding(b, world.closedDestinations.has(b.id) ? "#58564c" : b.buildType === "workshop" ? "#815c3a" : "#556d7b"))
  ctx.fillStyle = "#f2e8d5"; ctx.font = "12px Georgia"; ctx.textAlign = "left"
  if (world.permutation.sources !== "local") ctx.fillText("ARRIVALS →", CELL, (ROAD_Z + 2.2) * CELL)
  if (world.permutation.sources === "both") { ctx.textAlign = "right"; ctx.fillText("← ARRIVALS", (WIDTH - 1) * CELL, (ROAD_Z + 2.2) * CELL) }
  for (const journey of world.journeys) {
    const p = journeyPosition(journey), x = snap((p.x + .5) * CELL), z = snap((p.z + .5) * CELL)
    ctx.fillStyle = "#30291f"; ctx.fillRect(x - 4, z - 4, 8, 8)
    ctx.fillStyle = journey.through ? "#e7ba64" : journey.returning ? "#b5d3dd" : "#fff0d1"
    ctx.fillRect(x - 2, z - 2, 4, 4)
  }
  if (view.candidate) {
    ctx.globalAlpha = .8; drawBuilding(view.candidate, view.valid ? "#407b57" : "#9b4435", true); ctx.globalAlpha = 1
  } else if (view.selected !== null) {
    const p = coords(view.selected)
    ctx.strokeStyle = "#fff0d1"; ctx.lineWidth = 2; ctx.strokeRect(p.x * CELL + 1, p.z * CELL + 1, CELL - 2, CELL - 2)
  }
}
