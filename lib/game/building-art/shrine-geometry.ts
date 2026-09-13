import { crucifixFigureVertices } from "./crucifix"
import type { ChurchWing } from "../church-additions"
import { CHURCH_EAVE, CHURCH_NAVE_BASE, churchAisleHeight, churchAisleRoof, churchNaveEdge, clipRoof } from "./church-roof"
import { churchWallBuilder, CHURCH_PLASTER, type ChurchOpening } from "./church-wall"
import { buildingParts, type BuildingPart, type Vec3 } from "./geometry"
import { earlyBuildingParts, RELIC_TABLE_TOP } from "./early-geometry"
import { DEFAULT_RECIPE, earlyBuildingRecipe } from "./style"
import { shrineAltarZ, shrineAltarRise, shrineChancelFront, shrineDivider } from "../shrine-layout"
import { EARLY_MATERIALS as palette } from "./materials"

/** The same timber steeple and cross crown both chapel and church ridges. */
function steepleParts(ridge: number, steepleZ: number): BuildingPart[] {
  const parts: BuildingPart[] = []
  const box = (name: string, layer: BuildingPart["layer"], position: Vec3, size: Vec3, color: string) =>
    parts.push({ name, layer, position, size, color, outline: false })
  const face = (name: string, layer: BuildingPart["layer"], vertices: number[], color: string) =>
    parts.push({ name, layer, position: [0, 0, 0], vertices, color, outline: false })
  box("steeple-foot", "roof", [0,ridge+.09,steepleZ], [.4,.18,.4],palette.darkWood)
  for(const x of [-.14,.14]) for(const z of [-.14,.14]) box(`steeple-post-${x}-${z}`,"roof",[x,ridge+.32,steepleZ+z],[.055,.35,.055],palette.paleWood)
  const cap: number[]=[]
  for(const [ax,az,bx,bz] of [[-.24,-.24,.24,-.24],[.24,-.24,.24,.24],[.24,.24,-.24,.24],[-.24,.24,-.24,-.24]]) cap.push(ax,ridge+.49,steepleZ+az,bx,ridge+.49,steepleZ+bz,0,ridge+.75,steepleZ)
  face("steeple-cap","roof",cap,palette.darkWood)
  box("steeple-cross-upright","roof",[0,ridge+1.02,steepleZ],[.085,.75,.08],palette.paleWood)
  box("steeple-cross-arm","roof",[0,ridge+1.15,steepleZ],[.47,.085,.08],palette.paleWood)
  return parts
}

/** Small carved timber crosses, sharing the same proportions at every scale. */
function crossParts(name: string, position: Vec3, height: number, carved = false,
  layer: BuildingPart["layer"] = "interior", side?: [number, number], yaw = 0): BuildingPart[] {
  const parts: BuildingPart[] = []
  const block = (suffix: string, x: number, y: number, z: number, w: number, h: number, d: number, color: string) => {
    parts.push({ name: `${name}-${suffix}`, layer, cutawaySide: side, outline: false,
      position: [position[0] + height * (x * Math.cos(yaw) + z * Math.sin(yaw)), position[1] + height * y,
        position[2] + height * (z * Math.cos(yaw) - x * Math.sin(yaw))],
      size: [w * height, h * height, d * height], rotation: [0, yaw, 0], color })
  }
  block("upright", 0, 0, 0, carved ? .075 : .11, 1, .09, palette.darkWood)
  block("arm", 0, .2, 0, carved ? .76 : .62, carved ? .075 : .11, .09, palette.darkWood)
  if (carved) {
    const figure = crucifixFigureVertices()
    const vertices: number[] = []
    for (let i = 0; i < figure.length; i += 3) {
      const x = figure[i] * height, y = figure[i + 1] * height, z = figure[i + 2] * height
      vertices.push(position[0] + x * Math.cos(yaw) + z * Math.sin(yaw), position[1] + y,
        position[2] + z * Math.cos(yaw) - x * Math.sin(yaw))
    }
    parts.push({ name: `${name}-carved-figure`, layer, cutawaySide: side, position: [0, 0, 0],
      vertices, color: palette.darkWood, outline: false })
    block("footrest", 0, -.415, .075, .16, .035, .15, palette.darkWood)
    block("inscription-board", 0, .385, .06, .23, .065, .035, palette.darkWood)
  }
  return parts
}

const plaster = CHURCH_PLASTER

/** A plastered shrine with one door, arched openings and a timber upper nave. */
function churchStructureParts(width: number, depth: number, wings: readonly ChurchWing[] = []): BuildingPart[] {
  const altarZ = shrineAltarZ(depth), altarRise = shrineAltarRise(depth)
  const parts = buildingParts({ ...DEFAULT_RECIPE, width, depth })
    .filter(p => p.name === "floor" || p.name.startsWith("paving-") || p.name === "relic-table" || p.name.startsWith("table-trestle-"))
  for (const p of parts) if (p.name === "relic-table" || p.name.startsWith("table-trestle-")) p.position = [0, altarRise, altarZ]
  const box = (name: string, layer: BuildingPart["layer"], position: Vec3, size: Vec3, color: string = palette.wood) =>
    parts.push({ name, layer, position, size, color, outline: false })
  const face = (name: string, layer: BuildingPart["layer"], vertices: number[], color: string) =>
    parts.push({ name, layer, position: [0, 0, 0], vertices, color, outline: false })

  const wallX = width / 2 - .13, wallZ = depth / 2 - .13
  const eave = CHURCH_EAVE, naveBase = CHURCH_NAVE_BASE, naveEave = 2.04, upperRise = .4
  const naveWidth = width * .48, naveX = naveWidth / 2 - .13
  const wall = churchWallBuilder(parts)

  const windowCount = Math.max(1, Math.floor(depth / 1.4))
  const windows: ChurchOpening[] = Array.from({ length: windowCount }, (_, i) => ({ centre: (i - (windowCount - 1) / 2) * depth * .3, sill: .4, shoulder: .72, radius: .17 }))
  for (const side of [-1, 1]) {
    const attached = wings.filter(wing => wing.side === side)
    const breaks = [...new Set([-wallZ, wallZ, ...attached.flatMap(wing => [Math.max(-wallZ, wing.from), Math.min(wallZ, wing.to)])])].sort((a, b) => a - b)
    for (let i = 0; i < breaks.length - 1; i++) {
      const from = breaks[i], to = breaks[i + 1], wing = attached.find(wing => wing.from <= from && wing.to >= to)
      const openings = wing ? [{ centre: wing.doorZ, sill: 0, shoulder: .83, radius: .22 }]
        : windows.filter(window => window.centre - window.radius > from && window.centre + window.radius < to)
      wall(attached.length ? `side-wall-${side}-span-${i}` : `side-wall-${side}`, "x", side * wallX, from, to, 0,
        wing ? churchAisleHeight(width, wing.reach, wallX) : eave, openings)
    }
    wall(`upper-timber-${side}`, "x", side * naveX, -wallZ, wallZ, naveBase, naveEave,
      windows.map(w => ({ ...w, sill: naveBase + .09, shoulder: naveBase + .24, radius: .095 })), true, "wall")
    box(`nave-bottom-beam-${side}`, "roof", [side * naveX, naveBase, 0], [.09, .065, wallZ * 2], palette.darkWood)
    box(`nave-top-beam-${side}`, "roof", [side * naveX, naveEave, 0], [.09, .065, wallZ * 2], palette.darkWood)
    if (!attached.length) box(`side-sill-${side}`, "wall", [side * wallX, .045, 0], [.12, .09, wallZ * 2], palette.stone)
    for (const end of [-1, 1]) box(`corner-post-${side}-${end}`, "wall", [side * wallX, eave / 2, end * wallZ], [.09, eave, .09])
  }
  wall("entrance", "z", wallZ, -wallX, wallX, 0, eave, [{ centre: 0, sill: 0, shoulder: .83, radius: .31 }])
  wall("rear-wall", "z", -wallZ, -wallX, wallX, 0, eave, [])
  for (const end of [-1, 1]) {
    // The front and rear of the raised volume rise directly from the lower walls.
    wall(`nave-end-${end}`, "z", end * wallZ, -naveX, naveX, eave, naveBase, [])
    wall(`upper-timber-end-${end}`, "z", end * wallZ, -naveX, naveX, naveBase, naveEave, [], true, "wall")
    face(`upper-gable-${end}`, "wall", [-naveX, naveEave, end * wallZ, naveX, naveEave, end * wallZ, 0, naveEave + upperRise, end * wallZ], palette.paleWood)
    // Close the triangular wall below each lower lean-to, with no extra doors.
    for (const side of [-1, 1]) face(`aisle-gable-${end}-${side}`, "wall", [side * naveX, eave, end * wallZ, side * wallX, eave, end * wallZ, side * naveX, naveBase, end * wallZ], plaster)
  }

  // The two lower roof slopes stop at the timber nave, leaving the middle open.
  const roofX = width / 2
  let lower: BuildingPart[] = earlyBuildingParts({ ...earlyBuildingRecipe("monk-shelter"), width, depth, wallHeight: eave, roofRise: .65, roofForm: "gable" })
    .filter(p => p.name.startsWith("thatch-"))
    .map(p => ({ ...p, name: `lower-${p.name}`, vertices: p.vertices!.map((v, i) => i % 3 === 0
      ? (v < 0 || v === 0 && p.name.includes("--1") ? -1 : 1) * (naveX + Math.abs(v) / roofX * (roofX - naveX))
      : i % 3 === 1 ? eave + (v - eave) * (naveBase - eave) / .65 : v) }))
  if (wings.length) {
    lower = []
    for (const side of [-1, 1]) {
      const attached = wings.filter(wing => wing.side === side)
      const breaks = [...new Set([-depth / 2, depth / 2, ...attached.flatMap(wing => [wing.from, wing.to])])].sort((a, b) => a - b)
      for (let i = 0; i < breaks.length - 1; i++) {
        const from = breaks[i], to = breaks[i + 1], wing = attached.find(wing => wing.from <= from && wing.to >= to)
        lower.push(...clipRoof(churchAisleRoof(width, side, from, to, wing?.reach ?? 0), side * width / 2, -side))
      }
      for (const [i, wing] of attached.entries()) for (const end of [wing.from, wing.to]) {
        face(`wing-roof-step-${side}-${i}-${end}`, "wall", [side * churchNaveEdge(width), naveBase, end,
          side * width / 2, eave, end, side * width / 2, churchAisleHeight(width, wing.reach, width / 2), end], plaster)
        parts[parts.length - 1].cutawaySide = [0, end === wing.from ? -1 : 1]
      }
    }
  }
  const raised = earlyBuildingParts({ ...earlyBuildingRecipe("monk-shelter"), width: naveWidth, depth, wallHeight: naveEave, roofRise: upperRise, roofForm: "gable" })
    .filter(p => p.layer === "roof" && !p.name.startsWith("shelter-cross-"))
    .map(p => ({ ...p, name: `raised-nave-${p.name}` }))
  box("roof-cross-upright", "roof", [0, naveEave + upperRise + .21, wallZ], [.07, .5, .065], palette.paleWood)
  box("roof-cross-arm", "roof", [0, naveEave + upperRise + .3, wallZ], [.3, .065, .065], palette.paleWood)

  parts.push(...steepleParts(naveEave + upperRise, -wallZ + .3))

  const rear = depth / 2 - (depth === 2 ? .07 : .13)
  parts.push(...crossParts("sanctuary-crucifix", [0, depth === 2 ? .99 : 1.4, -rear + .09],
    depth === 2 ? .56 : 1.04, true, "wall", [0, -1]))
  const altarCrossHeight = depth === 2 ? .25 : .32
  parts.push(...crossParts("altar-cross", [0, altarRise + RELIC_TABLE_TOP + .035 + altarCrossHeight / 2, altarZ - .08], altarCrossHeight))
  box("altar-cross-foot", "interior", [0, altarRise + RELIC_TABLE_TOP + .022, altarZ - .08], [.14, .035, .12], palette.darkWood)
  if (depth > 2) {
    const front = shrineChancelFront(depth)
    box("sanctuary-platform", "interior", [0, altarRise / 2, (-wallZ + front) / 2], [wallX * 2, altarRise, front + wallZ], "#929486")
    box("sanctuary-step", "interior", [0, altarRise / 4, front + .08], [wallX * 2, altarRise / 2, .16], "#adae9a")
    for (const [index, rail] of shrineDivider(width, depth).entries()) {
      for (const end of [-1, 1]) box(`chancel-post-${index}-${end}`, "interior",
        [rail.x + end * (rail.width / 2 - .03), .25, rail.z], [.06, .39, .07], palette.darkWood)
      for (const y of [.17, .4]) box(`chancel-rail-${index}-${y}`, "interior", [rail.x, y, rail.z], [rail.width, .045, .06], palette.paleWood)
      for (const offset of [-.22, 0, .22]) box(`chancel-spindle-${index}-${offset}`, "interior", [rail.x + offset, .285, rail.z], [.03, .23, .035], palette.wood)
      parts.push(...crossParts(`chancel-cross-${index}`, [rail.x, .49, rail.z], .19))
    }
    for (const side of [-1, 1]) for (const face of [-1, 1]) {
      parts.push(...crossParts(`side-cross-${side}-${face}`, [side * (wallX + face * .085), .77, depth * .15], .3,
        false, "wall", [side, 0], side * Math.PI / 2))
    }
    parts.push(...crossParts("entrance-gable-cross", [0, naveEave + .1, wallZ + .09], .3, false, "wall", [0, 1]))
  }

  // A linen veil falls from the altar slab over the reliquary underneath.
  box("relic-shelf", "interior", [0, altarRise + .105, altarZ], [.42, .04, .34], "#918c78")
  box("altar-linen-top", "interior", [0, altarRise + RELIC_TABLE_TOP + .005, altarZ], [.76, .01, .5], "#d6c8a8")
  for (let fold = 0; fold < 12; fold++) {
    const x = (fold - 5.5) * .06
    const z = altarZ + .255 + (fold % 2 ? .015 : 0)
    box(`relic-veil-${fold}`, "interior", [x, altarRise + .25, z], [.061, .38, .018], fold % 2 ? "#b5a687" : "#d6c8a8")
    box(`relic-veil-hem-${fold}`, "interior", [x, altarRise + .078, z + .002], [.061, .025, .02], "#92764e")
  }
  // Small wall-mounted timber offering box beside the entrance, with an iron slot.
  box("offering-box", "interior", [1, .42, wallZ - .13], [.3, .24, .2], palette.darkWood)
  box("offering-box-lid", "interior", [1, .548, wallZ - .13], [.33, .025, .23], palette.paleWood)
  box("offering-box-slot", "interior", [1, .562, wallZ - .15], [.16, .004, .025], "#302c27")
  for (const x of [.9, 1.1]) box(`offering-box-strap-${x}`, "interior", [x, .42, wallZ - .235], [.026, .24, .014], "#555349")
  for(const side of [-1,1]) {
    const x=side*.73,z=altarZ+.08
    box(`candle-stand-foot-${side}`,"interior",[x,altarRise+.035,z],[.24,.07,.24],palette.darkWood)
    box(`candle-stand-stem-${side}`,"interior",[x,altarRise+.31,z],[.055,.55,.055],"#777568")
    box(`candle-stand-tray-${side}`,"interior",[x,altarRise+.6,z],[.29,.04,.13],"#96865c")
    for(let i=0;i<3;i++) {
      const px=x+(i-1)*.09,height=.1+i*.035
      box(`candle-${side}-${i}`,"interior",[px,altarRise+.62+height/2,z],[.045,height,.045],"#e1c995")
      box(`candle-flame-${side}-${i}`,"interior",[px,altarRise+.65+height,z],[.028,.06,.028],"#ffcf65")
    }
  }
  return [...parts, ...lower, ...raised]
}


/** A small daub chapel: one open timber doorway, gabled thatch and an altar with space for its keeper. */
export function shrineStructureParts(width: number, depth: number, wings: readonly ChurchWing[] = [], entranceX = .5): BuildingPart[] {
  if (width !== 2 || depth !== 2) return churchStructureParts(width, depth, wings)
  const parts = churchStructureParts(width, depth).filter(p => p.layer === "base" || p.name === "floor" || p.name.startsWith("paving-")
    || p.name === "relic-table" || p.name.startsWith("table-trestle-") || p.name === "relic-shelf"
    || p.name === "altar-linen-top" || p.name.startsWith("relic-veil-")
    || p.name.startsWith("altar-cross-") || p.name.startsWith("sanctuary-crucifix-"))
  const box = (name: string, layer: BuildingPart["layer"], position: Vec3, size: Vec3, color: string, side?: [number, number]) =>
    parts.push({ name, layer, position, size, color, outline: false, cutawaySide: side })
  const edge = .93, eave = .9, rise = .6, halfDoor = .29, doorHeight = .78
  const wall = churchWallBuilder(parts, .22)
  for (const side of [-1, 1]) {
    wall(`chapel-side-${side}`, "x", side * edge, -edge, edge, 0, eave,
      [{ centre: 0, sill: .4, shoulder: .6, radius: .13 }])
    for (const end of [-1, 1]) box(`chapel-post-${side}-${end}`, "wall", [side * edge, eave / 2, end * edge], [.09, eave, .09], palette.wood, [side, end])
  }
  wall("chapel-back", "z", -edge, -edge, edge, 0, eave, [])
  for (const [index, a, b] of [[0, -edge, entranceX - halfDoor], [1, entranceX + halfDoor, edge]]) {
    wall(`chapel-front-${index}`, "z", edge, a, b, 0, eave, [])
  }
  box("chapel-door-header", "wall", [entranceX, (eave + doorHeight) / 2, edge], [halfDoor * 2, eave - doorHeight, .1], "#b3aa8e", [0, 1])
  for (const side of [-1, 1]) box(`chapel-door-jamb-${side}`, "wall", [entranceX + side * halfDoor, doorHeight / 2, edge + .02], [.065, doorHeight, .13], palette.darkWood, [0, 1])
  box("chapel-door-lintel", "wall", [entranceX, doorHeight, edge + .02], [halfDoor * 2 + .12, .075, .13], palette.darkWood, [0, 1])
  for (const end of [-1, 1]) parts.push({ name: `chapel-gable-${end}`, layer: "wall", position: [0, 0, 0],
    vertices: [-edge, eave, end * edge, edge, eave, end * edge, 0, eave + rise, end * edge], color: "#b3aa8e", outline: false, cutawaySide: [0, end] })
  parts.push(...earlyBuildingParts({ ...earlyBuildingRecipe("monk-shelter"), width, depth, wallHeight: eave, roofRise: rise, roofForm: "gable", fireplace: false })
    .filter(p => p.layer === "roof" && !p.name.startsWith("shelter-cross-")))
  parts.push(...steepleParts(eave + rise, -edge + .3))
  // Center the offering box on the broad wall and center the cross in the front gable.
  const offeringX = entranceX > 0 ? (-edge + entranceX - halfDoor) / 2 : (edge + entranceX + halfDoor) / 2
  const offeringZ = edge + .14
  box("offering-box", "wall", [offeringX, .34, offeringZ], [.16, .2, .16], palette.darkWood, [0, 1])
  box("offering-box-lid", "wall", [offeringX, .448, offeringZ], [.19, .025, .19], palette.paleWood, [0, 1])
  box("offering-box-slot", "wall", [offeringX, .463, offeringZ], [.1, .005, .025], "#302c27", [0, 1])
  box("chapel-wall-cross-upright", "wall", [0, eave + .28, edge + .08], [.055, .34, .045], palette.darkWood, [0, 1])
  box("chapel-wall-cross-arm", "wall", [0, eave + .34, edge + .08], [.22, .055, .045], palette.darkWood, [0, 1])
  return parts
}
