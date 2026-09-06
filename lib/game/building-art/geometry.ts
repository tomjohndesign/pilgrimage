import { earlyBuildingParts } from "./early-geometry"
import { BUILDING_STYLE, isEarlyBuilding, type BuildingRecipe } from "./style"
import { BUILDING_DETAIL_SCALE, BUILDING_FLOOR_TOP } from "./dimensions"
import { HOVEL_DOOR_HEIGHT, HOVEL_DOOR_WIDTH } from "../world-scale"

export type Vec3 = [number, number, number]
export interface BuildingPart {
  name: string
  layer: "base" | "interior" | "wall" | "roof"
  position: Vec3
  size?: Vec3
  rotation?: Vec3
  vertices?: number[]
  color: string
  cutawaySide?: [number, number]
  outline?: boolean
}

/** Deterministic, tile-bounded construction; shared by the hovel and workshop. */
function constructionParts(recipe: BuildingRecipe, doorOffset: number): BuildingPart[] {
  const p = BUILDING_STYLE.palette
  const w = recipe.width - 0.65, d = recipe.depth - 0.65
  const h = recipe.wallHeight, rise = recipe.roofRise, base = 0.16
  const parts: BuildingPart[] = []
  const box = (name: string, layer: BuildingPart["layer"], position: Vec3, size: Vec3, color: string, rotation?: Vec3) => parts.push({ name, layer, position, size, color, rotation })
  const face = (name: string, layer: BuildingPart["layer"], vertices: number[], color: string) => parts.push({ name, layer, position: [0, 0, 0], vertices, color })
  box("floor", "base", [0, BUILDING_FLOOR_TOP / BUILDING_DETAIL_SCALE - 0.06, 0], [w, 0.12, d], "#a39170")
  // Blocks leave real mortar gaps without a texture dependency.
  for (const side of [-1, 1]) {
    for (let i = 0; i < Math.ceil(w); i++) box(`stone-x-${side}-${i}`, "base", [-w / 2 + (i + 0.5) * w / Math.ceil(w), base / 2, side * (d / 2 - 0.1)], [w / Math.ceil(w) - 0.025, base, 0.22], p.stone)
    for (let i = 0; i < Math.ceil(d); i++) box(`stone-z-${side}-${i}`, "base", [side * (w / 2 - 0.1), base / 2, -d / 2 + (i + 0.5) * d / Math.ceil(d)], [0.22, base, d / Math.ceil(d) - 0.025], p.stone)
  }
  const front = d / 2 - (recipe.variant === "porch" ? 0.65 : 0)
  const door = Math.max(-w / 2 + 0.65, Math.min(w / 2 - 0.65, doorOffset))
  const doorWidth = HOVEL_DOOR_WIDTH / BUILDING_DETAIL_SCALE, doorHeight = HOVEL_DOOR_HEIGHT / BUILDING_DETAIL_SCALE
  box("rear-wall", "wall", [0, base + h / 2, -d / 2], [w, h, 0.15], p.plaster)
  for (const sign of [-1, 1]) box(`side-wall-${sign}`, "wall", [sign * w / 2, base + h / 2, (front - d / 2) / 2], [0.15, h, front + d / 2], p.plaster)
  const left = door - doorWidth / 2 + w / 2, right = w / 2 - door - doorWidth / 2
  box("front-left", "wall", [-w / 2 + left / 2, base + h / 2, front], [left, h, 0.15], p.plaster)
  box("front-right", "wall", [w / 2 - right / 2, base + h / 2, front], [right, h, 0.15], p.plaster)
  box("lintel-plaster", "wall", [door, base + doorHeight + (h - doorHeight) / 2, front], [doorWidth, h - doorHeight, 0.15], p.plaster)
  for (const x of [door - 0.46, door + 0.46]) box(`door-post-${x}`, "wall", [x, base + doorHeight / 2, front + 0.09], [0.12, doorHeight, 0.17], p.timber)
  box("doorway-shadow", "wall", [door, base + doorHeight / 2, front - 0.12], [doorWidth, doorHeight, 0.03], p.ink)
  box("door-lintel", "wall", [door, base + doorHeight, front + 0.09], [1.05, 0.14, 0.18], p.timber)
  box("threshold", "base", [door, BUILDING_FLOOR_TOP / BUILDING_DETAIL_SCALE - 0.05, front + 0.11], [1, 0.1, 0.4], p.stone)
  for (const x of [-w / 2, w / 2]) {
    for (const z of [-d / 2, 0, d / 2]) box(`oak-post-${x}-${z}`, "wall", [x, base + h / 2, z], [0.15, h + 0.08, 0.15], p.timber)
    box(`oak-sill-${x}`, "wall", [x, base + 0.18, 0], [0.18, 0.12, d], p.timber)
    box(`oak-eaves-${x}`, "wall", [x, base + h, 0], [0.18, 0.16, d], p.timber)
    box(`window-${x}`, "wall", [x + Math.sign(x) * 0.085, base + h * 0.6, -d * 0.2], [0.05, 0.6, 0.65], p.ink)
    for (const z of [-d * 0.2 - 0.26, -d * 0.2 + 0.26]) box(`shutter-${x}-${z}`, "wall", [x + Math.sign(x) * 0.12, base + h * 0.6, z], [0.06, 0.65, 0.18], p.timber)
    box(`brace-${x}`, "wall", [x + Math.sign(x) * 0.09, base + h * 0.65, d * 0.28], [0.1, h * 0.7, 0.12], p.timber, [0.6, 0, 0])
  }
  if (/relic|hovel/i.test(recipe.subject)) {
    box("cross-upright", "wall", [door, base + h - 0.12, front + 0.14], [0.07, 0.32, 0.06], p.timber)
    box("cross-arm", "wall", [door, base + h - 0.06, front + 0.14], [0.23, 0.06, 0.06], p.timber)
  }
  const rw = recipe.width / 2 - 0.1, rd = recipe.depth / 2 - 0.1, eave = base + h + 0.08
  const ridge = eave + rise
  if (recipe.variant === "hipped") {
    const rz = Math.max(0.15, rd - rw * 0.85)
    face("hip-roof", "roof", [
      -rw,eave,-rd, rw,eave,-rd, 0,ridge,-rz,
      rw,eave,rd, -rw,eave,rd, 0,ridge,rz,
      -rw,eave,rd, -rw,eave,-rd, 0,ridge,-rz, -rw,eave,rd, 0,ridge,-rz, 0,ridge,rz,
      rw,eave,-rd, rw,eave,rd, 0,ridge,rz, rw,eave,-rd, 0,ridge,rz, 0,ridge,-rz,
    ], p.thatch)
    for (const s of [-1, 1]) {
      box(`hip-eave-x-${s}`, "roof", [0,eave,s*rd], [rw*2,0.2,0.15], p.thatchShade)
      box(`hip-eave-z-${s}`, "roof", [s*rw,eave,0], [0.15,0.2,rd*2], p.thatchShade)
    }
  } else {
    const angle = Math.atan2(rise, rw), slope = Math.hypot(rw, rise)
    for (const sign of [-1, 1]) {
      box(`thatch-slope-${sign}`, "roof", [sign*rw/2, eave+rise/2, 0], [slope, 0.19, rd*2], p.thatch, [0,0,-sign*angle])
      // Short strokes follow the fall of the straw; no continuous plank seams.
      const grain: number[] = [], highlights: number[] = []
      const noise = (n: number) => {
        const value = Math.sin(n * 127.1 + recipe.seed * 31.7 + sign * 13.9) * 43758.5453
        return value - Math.floor(value)
      }
      const normalX = sign * rise / slope, normalY = rw / slope
      for (let i = 0; i < 100; i++) {
        const t = 0.04 + noise(i * 5) * 0.84
        const end = Math.min(0.97, t + (0.08 + noise(i * 5 + 1) * 0.2) / slope)
        const z = -rd + 0.12 + noise(i * 5 + 2) * (rd * 2 - 0.24)
        const width = 0.012 + noise(i * 5 + 3) * 0.02
        const at = (t: number, z: number) => [sign * rw * t + normalX * 0.104, ridge - rise * t + normalY * 0.104, z]
        const vertices = noise(i * 5 + 4) > 0.7 ? highlights : grain
        vertices.push(...at(t, z-width), ...at(end, z-width), ...at(end, z+width), ...at(t,z-width), ...at(end,z+width), ...at(t,z+width))
      }
      face(`thatch-grain-${sign}`, "roof", grain, "#9e7d48")
      face(`thatch-highlight-${sign}`, "roof", highlights, "#d0ad70")
      // Sparse seeded reed clusters along the eaves, kept inside the tile bounds.
      for (let i=0; i<18; i++) {
        const jitter = ((Math.sin(i * 127.1 + recipe.seed * 31.7) * 43758.5453) % 1) * 0.025
        box(`reed-${sign}-${i}`, "roof", [sign*(rw-0.06),eave+0.06+jitter,-rd+0.14+i*(rd*2-0.28)/17], [0.16,0.04,0.025], p.thatchShade, [0,0,-sign*angle])
      }
    }
    for (const z of [-d / 2, front]) {
      face(`gable-${z}`, "roof", [-w/2,eave,z, w/2,eave,z, 0,ridge-0.12,z], p.plaster)
      box(`gable-beam-${z}`, "roof", [0,eave,z], [w,0.15,0.18], p.timber)
      box(`gable-king-post-${z}`, "roof", [0,eave+(rise-0.12)/2,z], [0.13,rise-0.12,0.18], p.timber)
    }
  }
  box("ridge-cap", "roof", [0,ridge+0.04,0], [0.2,0.16,recipe.variant === "hipped" ? Math.max(0.3,(rd-rw*0.85)*2) : rd*2], p.thatchShade)
  return parts
}

/** Tile dimensions remain literal while construction details retain human scale. */
export function buildingParts(recipe: BuildingRecipe, doorOffset = 0): BuildingPart[] {
  if (isEarlyBuilding(recipe.variant)) return earlyBuildingParts(recipe)
  const scale = BUILDING_DETAIL_SCALE
  const dimensions = (v: Vec3): Vec3 => [v[0] * scale, v[1] * scale, v[2] * scale]
  return constructionParts({ ...recipe, width: recipe.width / scale, depth: recipe.depth / scale, wallHeight: recipe.wallHeight / scale, roofRise: recipe.roofRise / scale }, doorOffset / scale).map(part => ({
    ...part,
    position: dimensions(part.position),
    size: part.size && dimensions(part.size),
    vertices: part.vertices?.map(n => n * scale),
  }))
}
