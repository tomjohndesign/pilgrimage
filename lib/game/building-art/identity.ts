import { groundDetail } from "./ground-detail"
import { hasDirtFloor } from "./dirt-floor"
import { buildingGreenery } from "./greenery"
import type { BuildingPart, Vec3 } from "./geometry"
import { EARLY_ROOF_MATERIALS as roof } from "./materials"

/** Material and large-form cues stay fixed by use; ownership is a separate paint layer.
 * Research and the per-building art direction are in assets/BUILDING_READABILITY.md. */
export const BUILDING_IDENTITIES: Record<string, { roof: string; timber: string; shingles?: boolean; poles?: boolean; cue: string }> = {
  house: { roof: "#c2a56e", timber: "#514b3f", cue: "Golden thatch, dark weathered log sides and pale earthen front panels" },
  tavern: { roof: roof.weatheredStraw, timber: "#49372c", cue: "Weathered brown thatch and the hanging ale sign above the door" },
  inn: { roof: roof.weatheredOak, timber: "#494c49", shingles: true, cue: "Grey-brown split-oak shingles and a bed sign" },
  "monk-shelter": { roof: roof.reed, timber: "#81765c", cue: "Pale reed roof, limewashed walls and crosses" },
  shelter: { roof: roof.paleStraw, timber: "#948362", cue: "Light straw canopy and a hanging bedroll" },
  workshop: { roof: roof.workyardOak, timber: "#63523d", poles: true, cue: "Long roundwood roof and a broad axe above the work court" },
  "wood-shelter": { roof: roof.splitOak, timber: "#96774e", shingles: true, cue: "Split-wood roof and paired round log ends" },
  hall: { roof: roof.goldenThatch, timber: "#574b36", cue: "Heavy golden roof and a tall crossed entrance crest" },
  market: { roof: "#d1bea0", timber: "#8c7050", cue: "Broad cream-and-ochre cloth panels above the open counter" },
  "guard-post": { roof: roof.darkOak, timber: "#414842", poles: true, cue: "Long roundwood canopy, round shield and upright spears" },
  "sheep-pen": { roof: roof.weatheredReed, timber: "#938263", cue: "Weathered reed hut and a tall shepherd's crook at the fold" },
  storehouse: { roof: "#b29b75", timber: "#a4895d", cue: "Raised platform and a high loading frame with a grain mark" },
  lumberCamp: { roof: "#947b51", timber: "#8d6b45", cue: "Open timber yard with a tall timber sorting frame" },
  garden: { roof: "#96966b", timber: "#827153", cue: "Herb beds and a broad climbing frame" },
  cross: { roof: "#827153", timber: "#67553b", cue: "Carved cross with a painted binding" },
  enclosure: { roof: "#aaa48d", timber: "#877755", cue: "Open sacred court with painted gate heads" },
  shrine: { roof: roof.dryReed, timber: "#817459", cue: "Light reed roof and pale masonry beneath the bell tower" },
}

function materialShade(source: string, target: string, reference: number): string {
  const rgb = [1, 3, 5].map(i => parseInt(source.slice(i, i + 2), 16))
  const light = (rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114) / reference
  return "#" + [1, 3, 5].map(i => Math.min(255, Math.max(0, Math.round(parseInt(target.slice(i, i + 2), 16) * light))).toString(16).padStart(2, "0")).join("")
}

/** Mark each model's intended paint surfaces once, before runtime ownership coloring. */
export function buildingIdentity(parts: BuildingPart[], type: string, width: number, depth: number, height: number, seed = 17): BuildingPart[] {
  const identity = BUILDING_IDENTITIES[type]
  if (!identity) return parts
  const colored = parts.map(part => {
    const roof = /(^|-)(thatch|shingle|pole-roof)-/.test(part.name)
    const timber = /^(log-wall-|log-end-|earthfast-post-|hut-post-|inn-post-|inn-cross-|yard-|raised-|platform-)/.test(part.name) || /(?:^|-)(?:log-core$|log-\d+$)/.test(part.name)
    const accent = /^(raised-nave-eave-pole-|chapel-door-lintel$|corner-post-|eave-pole-|hut-eave-|inn-eave-|inn-shutter-|residence-side-sill-|aisle-eave-|door-lintel$|hall-lintel$|gatepost-|yard-post-|hitching-post-)/.test(part.name)
      || part.name === "weather-hanging-cloth"
    return { ...part, color: roof ? materialShade(part.color, identity.roof, 150) : timber ? materialShade(part.color, identity.timber, 100) : part.color,
      ...(accent ? { playerAccent: true } : {}) }
  })
  return [...colored, ...buildingLandmark(type, width, depth, height), ...buildingGreenery(type, width, depth, height, seed), ...(hasDirtFloor(type) && type !== "shrine" ? groundDetail(width, depth, seed) : [])]
}

/** Bold, period-material objects attached to the shell, clear of entrances and
 * live storage. They survive distant detail reduction and carry real object IDs. */
export function buildingLandmark(type: string, width: number, depth: number, height: number): BuildingPart[] {
  const parts: BuildingPart[] = []
  const w = width / 2, d = depth / 2
  const x = Math.max(0, w - .4), z = d - .12, y = height + .26
  const wood = "#67513b", linen = "#e3d3ae", ink = "#493c2e"
  const box = (name: string, position: Vec3, size: Vec3, color = wood, accent = false, rotation?: Vec3, layer: BuildingPart["layer"] = "wall") => {
    parts.push({ name: `identity-${name}`, layer, position, size, rotation, color, playerAccent: accent, outline: false,
      cutawaySide: [0, position[2] < 0 ? -1 : 1], maxSceneryDetail: 2 })
  }
  const disk = (name: string, cx: number, cy: number, cz: number, radius: number, color: string, accent = false) => {
    const vertices: number[] = []
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6, b = (i + 1) * Math.PI / 6
      vertices.push(cx, cy, cz, cx + Math.sin(a) * radius, cy + Math.cos(a) * radius, cz,
        cx + Math.sin(b) * radius, cy + Math.cos(b) * radius, cz)
    }
    parts.push({ name: `identity-${name}`, layer: "wall", position: [0, 0, 0], vertices, color, playerAccent: accent,
      cutawaySide: [0, cz < 0 ? -1 : 1], outline: false, maxSceneryDetail: 2 })
  }
  const board = (name: string, cy = y, sx = .58, sy = .42) => {
    box(`${name}-post`, [x, cy / 2, z - .035], [.07, cy, .07])
    box(`${name}-frame`, [x, cy, z], [sx, sy, .055], wood)
    box(`${name}-face`, [x, cy, z + .034], [sx - .07, sy - .07, .014], linen)
    return z + .047
  }
  if (type === "workshop") {
    const face = board("axe", y + .05, .58, .58)
    box("axe-haft", [x, y + .04, face + .008], [.055, .45, .025], ink, false, [0, 0, -.3])
    box("axe-head", [x + .08, y + .15, face + .018], [.23, .18, .032], "#697473", false, [0, 0, -.3])
    box("axe-edge", [x + .18, y + .12, face + .021], [.06, .2, .035], "#d0cec0", false, [0, 0, -.3])
  } else if (type === "guard-post") {
    for (const side of [-1, 1]) {
      box(`spear-shaft-${side}`, [x + side * .2, (y + .45) / 2, z - .02], [.035, y + .45, .035])
      box(`spear-head-${side}`, [x + side * .2, y + .5, z - .02], [.065, .18, .035], "#a9aca1")
    }
    disk("shield-rim", x, y, z, .27, linen)
    disk("shield-field", x, y, z + .01, .225, wood, true)
    disk("shield-boss", x, y, z + .02, .075, "#9faaa5")
  } else if (type === "storehouse" || type === "lumberCamp") {
    const rear = -d + .15, top = type === "storehouse" ? 1.15 : .95
    for (const side of [-1, 1]) box(`loading-post-${side}`, [side * (w - .16), top / 2, rear], [.09, top, .09])
    box("loading-header", [0, top, rear], [width - .2, .14, .12], wood, true)
    if (type === "storehouse") {
      box("grain-board", [0, top - .23, rear + .02], [.46, .36, .06], linen)
      box("grain-stem", [0, top - .23, rear + .057], [.035, .27, .02], "#95733e")
      for (const side of [-1, 1]) for (let i = 0; i < 3; i++) box(`grain-ear-${side}-${i}`, [side * .065, top - .31 + i * .065, rear + .058], [.12, .045, .02], "#95733e", false, [0, 0, side * .55])
    }
  } else if (type === "garden") {
    const rear = -d + .085, span = width * .36, cx = -width * .26
    for (const side of [-1, 1]) box(`trellis-post-${side}`, [cx + side * span / 2, .34, rear], [.045, .68, .045])
    for (let i = 0; i < 3; i++) box(`trellis-rail-${i}`, [cx, .22 + i * .2, rear], [span + .05, .045, .035], wood, i === 2)
    for (const side of [-1, 1]) box(`trellis-leaf-${side}`, [cx + side * span * .23, .4, rear + .025], [.1, .26, .04], "#7e8d53", false, [0, 0, side * .4])
  } else if (type === "cross") {
    box("cross-binding", [0, height * .73, .055], [Math.min(.55, width * .65), .055, .016], wood, true)
    box("cross-tail", [.065, height * .73 - .14, .06], [.07, .25, .016], wood, true)
  } else if (type === "sheep-pen") {
    box("crook-staff", [x, (y + .25) / 2, z], [.05, y + .25, .05], wood)
    // Open hooked head, never a modern shepherd's metal crook.
    box("crook-top", [x - .085, y + .26, z], [.22, .055, .05], linen)
    box("crook-hook", [x - .17, y + .19, z], [.055, .17, .05], linen)
    box("crook-binding", [x, y - .04, z], [.09, .26, .07], wood, true)
  } else if (type === "wood-shelter") {
    // Hang below the high front eave, rather than through the roof covering.
    const signY = height + .05, face = board("timber", signY, .6, .35)
    for (const side of [-1, 1]) {
      disk(`log-bark-${side}`, x + side * .135, signY, face, .12, "#6e5539")
      disk(`log-end-${side}`, x + side * .135, signY, face + .01, .085, "#c5a775")
    }
  } else if (type === "shelter") {
    box("blanket-rail", [x, y - .12, z], [.64, .07, .08])
    box("hanging-blanket", [x, y - .26, z + .05], [.48, .32, .06], linen)
    box("blanket-border", [x, y - .38, z + .085], [.49, .075, .018], wood, true)
    box("bedroll", [x, y - .11, z + .04], [.52, .13, .14], "#b5a17c")
  } else if (type === "hall") {
    box("hall-crest-post", [x, y / 2, z], [.09, y, .09])
    box("hall-crest", [x, y + .12, z], [.09, .6, .08], linen)
    box("hall-crest-arm", [x, y + .19, z], [.5, .08, .085], linen)
    box("hall-crest-binding", [x, y, z + .05], [.13, .22, .018], wood, true)
  }
  return parts
}
