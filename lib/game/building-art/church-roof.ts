import type { ChurchWing } from "../church-additions"
import type { BuildingPart, Vec3 } from "./geometry"
import { thatchSurface } from "./thatch"

export const CHURCH_EAVE = 1.18
export const CHURCH_NAVE_BASE = 1.59
export const churchNaveEdge = (width: number) => width * .24 - .13

/** One slope from the nave to the wing's outer eave, sampled by both buildings. */
export function churchAisleHeight(width: number, reach: number, x: number): number {
  const inner = churchNaveEdge(width), outer = width / 2 + reach
  return CHURCH_NAVE_BASE + (CHURCH_EAVE - CHURCH_NAVE_BASE) * (Math.abs(x) - inner) / (outer - inner)
}

export function churchAisleRoof(width: number, side: number, from: number, to: number, reach: number): BuildingPart[] {
  const inner = side * churchNaveEdge(width), outer = side * (width / 2 + reach)
  return thatchSurface([inner, CHURCH_NAVE_BASE, from], [inner, CHURCH_NAVE_BASE, to],
    [outer, CHURCH_EAVE, from], [outer, CHURCH_EAVE, to], 17, `church-aisle-${side}-${from}-${to}`)
}

/** Clip triangles at the common boundary without adding an eave or ink seam. */
export function clipRoof(source: BuildingPart[], boundary: number, side: number, axis: 0 | 2 = 0): BuildingPart[] {
  return source.flatMap(part => {
    const vertices: number[] = [], original = part.vertices!
    for (let i = 0; i < original.length; i += 9) {
      const triangle: Vec3[] = [original.slice(i, i + 3), original.slice(i + 3, i + 6), original.slice(i + 6, i + 9)] as Vec3[]
      const polygon: Vec3[] = []
      for (let j = 0; j < 3; j++) {
        const a = triangle[j], b = triangle[(j + 1) % 3], da = (a[axis] - boundary) * side, db = (b[axis] - boundary) * side
        if (da >= 0) polygon.push(a)
        if ((da >= 0) !== (db >= 0)) {
          const t = da / (da - db)
          polygon.push(a.map((v, k) => v + (b[k] - v) * t) as Vec3)
        }
      }
      for (let j = 1; j < polygon.length - 1; j++) vertices.push(...polygon[0], ...polygon[j], ...polygon[j + 1])
    }
    return vertices.length ? [{ ...part, vertices }] : []
  })
}

/** Remove a front-opening rectangle from every roof layer, including underlay
 * and fascia. Keep each source part together for batching and stable names. */
export function cutRoofEntrance(source: BuildingPart[], left: number, right: number, back: number): BuildingPart[] {
  return source.flatMap(part => {
    const middle = clipRoof(clipRoof([part], left, 1), right, -1)
    const fragments = [...clipRoof([part], left, -1), ...clipRoof([part], right, 1), ...clipRoof(middle, back, -1, 2)]
    const vertices = fragments.flatMap(fragment => fragment.vertices!)
    return vertices.length ? [{ ...part, vertices }] : []
  })
}

/** Wing-local +Z faces the church; the roof meets its aisle without a ridge. */
export function churchWingRoof(wing: ChurchWing): BuildingPart[] {
  const roof = clipRoof(churchAisleRoof(wing.churchWidth, wing.side, wing.from, wing.to, wing.reach), wing.side * wing.churchWidth / 2, wing.side)
  return roof.map(part => ({ ...part, vertices: part.vertices!.flatMap((_, i, vertices) => i % 3 ? [] : [
    wing.side * (vertices[i + 2] - (wing.from + wing.to) / 2), vertices[i + 1],
    wing.churchWidth / 2 + wing.reach / 2 - wing.side * vertices[i],
  ]) }))
}
