import type { BuildingPart, Vec3 } from "./geometry"

/** A freestanding timber charity counter with access for its server; the shared structure renderer supplies pixels and selection. */
export function almsTableParts(width = 1, depth = 1, seed = 17): BuildingPart[] {
  const parts: BuildingPart[] = []
  const box = (name: string, position: Vec3, size: Vec3, color: string) =>
    parts.push({ name, layer: "base", position, size, color, outline: false })
  box("floor", [0, -.019, 0], [width, .04, depth], "#ffffff")
  parts[0].surface = "trail"
  for (const x of [-.34, .34]) for (const z of [-.19, .19]) box(`table-leg-${x}-${z}`, [x, .19, z], [.065, .38, .065], "#755439")
  for (let i = 0; i < 3; i++) box(`table-plank-${i}`, [0, .4, (i - 1) * .17], [.88, .06, .16], (i + seed) % 3 === 1 ? "#a18358" : "#92744e")
  box("table-stretcher", [0, .14, 0], [.73, .045, .05], "#795b3b")
  box("table-apron", [0, .33, .21], [.78, .12, .035], "#826343")
  box("cross-upright", [0, .33, .233], [.022, .095, .008], "#c2a174")
  box("cross-arms", [0, .35, .233], [.07, .022, .008], "#c2a174")
  // Faceted ring vessels keep broad silhouettes readable at native pixel size.
  const vessel = (name: string, x: number, z: number, radius: number, height: number, color: string, contents: string) => {
    box(`${name}-contents`, [x, .43 + height * .7, z], [radius * 1.55, .025, radius * 1.55], contents)
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4
      box(`${name}-side-${i}`, [x + Math.sin(a) * radius, .43 + height / 2, z + Math.cos(a) * radius], [radius * .84, height, .025], color)
      parts[parts.length - 1].rotation = [0, a, 0]
    }
  }
  vessel("bread-basket", -.23, -.025, .14, .115, "#ab8c55", "#785634")
  for (let i = 0; i < 3; i++) {
    box(`bread-loaf-${i}`, [-.3 + i * .065, .57 + (i % 2) * .018, -.025 + (i % 2) * .06], [.09, .065, .075], i === 1 ? "#b58b4e" : "#a47b43")
    box(`bread-score-${i}`, [-.3 + i * .065, .605 + (i % 2) * .018, -.025 + (i % 2) * .06], [.055, .008, .013], "#d2ae70")
  }
  vessel("pottage-pot", .23, -.07, .105, .16, "#795445", "#b1a06b")
  box("ladle-handle", [.19, .63, -.04], [.022, .018, .21], "#b69969")
  vessel("wooden-bowl-1", .06, .16, .054, .04, "#a08250", "#6f5538")
  vessel("wooden-bowl-2", .23, .17, .054, .04, "#a08250", "#6f5538")
  for (const part of parts) if (part.name !== "floor") {
    part.position[0] = part.position[0] * .48 + .23
    part.position[2] *= .6
    if (part.size) { part.size[0] *= .48; part.size[2] *= .6 }
  }
  return parts
}
