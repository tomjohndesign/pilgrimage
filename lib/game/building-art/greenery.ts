import type { BuildingPart, Vec3 } from "./geometry"

/** Protected growth stays inside the plot; clear doorways and cart bays remain usable.
 * Broad leaf masses survive the same pixel scale as the rest of the building kit. */
export function buildingGreenery(type: string, width: number, depth: number, height: number, seed = 17): BuildingPart[] {
  const parts: BuildingPart[] = [], w = width / 2, d = depth / 2
  if (type === "enclosure") return parts
  const jitter = (seed % 7) * .003
  const closed = ["house", "tavern", "inn", "monk-shelter", "shrine"].includes(type)
  const face = (name: string, vertices: number[], color: string, side: [number, number], detail: 1 | 2 = 2) => {
    parts.push({ name: `growth-${name}`, layer: "wall", position: [0, 0, 0], vertices, color,
      cutawaySide: side, outline: false, maxSceneryDetail: detail })
  }
  // Uneven, faceted clumps rather than spherical topiary or tiny isolated leaves.
  const clump = (name: string, x: number, z: number, rx: number, rz: number, h: number, side: [number, number]) => {
    for (let i = 0; i < 7; i++) {
      const a = i * Math.PI * 2 / 7, b = (i + 1) * Math.PI * 2 / 7
      const p: Vec3 = [x + Math.cos(a) * rx, .035, z + Math.sin(a) * rz]
      const q: Vec3 = [x + Math.cos(b) * rx, .035, z + Math.sin(b) * rz]
      const top: Vec3 = [x - rx * .15, h, z + rz * .13]
      face(`${name}-${i}`, [...p, ...q, ...top], ["#284b32", "#42683e", "#68824b", "#355938"][i % 4], side)
    }
  }
  for (const side of [-1, 1]) {
    // Keep the market's cart side empty, including its back entrance.
    if (type === "market" && side === 1) continue
    const x = side * (w - .09)
    for (let i = 0; i < 3; i++) {
      const z = -d + .22 + i * Math.min(.27, (depth - .44) / 3)
      clump(`side-herb-${side}-${i}`, x, z, .075, .11, .16 + (i % 2) * .08 + jitter, [side, 0])
    }
    if (closed && width >= 2) {
      for (let i = 0; i < 3; i++) clump(`door-shrub-${side}-${i}`, side * (w - .10),
        d - .10 - i * .075, .065, .065, [.22, .30, .18][i], [0, 1])
      // Moss on the low side wall, away from windows and the shared doorway.
      const x = side * (w - .065)
      for (let i = 0; i < 4; i++) {
        const z = -d + .22 + i * .11, top = [.21, .30, .24, .14][i] * Math.min(1, height / .6)
        face(`wall-moss-${side}-${i}`, [x,.045,z-.06, x,.045,z+.06, x,top,z+.04,
          x,.045,z-.06, x,top,z+.04, x,top*.8,z-.06], ["#435520", "#64793b", "#82994f"][i % 3], [side, 0])
      }
      // A short climbing spray beside the rear corner, not over a window.
      for (let i = 0; i < 5; i++) {
        const y = .23 + i * Math.min(.095, height * .11), z = -d + .20 + (i % 2) * .055
        face(`ivy-${side}-${i}`, [x,y-.075,z, x,y,z-.085, x,y+.065,z,
          x,y-.075,z, x,y+.065,z, x,y,z+.085], i % 2 ? "#517348" : "#2b5035", [side, 0])
      }
    }
  }
  return parts
}
