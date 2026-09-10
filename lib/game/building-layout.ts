import type { BuildingPart } from "./building-art/geometry"
import type { TilePos } from "./map/types"

export function hasBuildingLayouts(type?: string): boolean {
  return ["inn", "house", "tavern", "hall", "shelter", "monk-shelter", "enclosure", "storehouse", "wood-shelter", "workshop", "market", "sheep-pen", "guard-post", "garden", "cross", "lumberCamp"].includes(type ?? "")
}

/** Persisted on purchase. Older saves retain their original doors and furniture. */
export function placementLayoutSeed(type: string, at: TilePos, worldSeed = 0): number | undefined {
  if (!hasBuildingLayouts(type)) return undefined
  let seed = (Math.imul(at.x, 73856093) ^ Math.imul(at.z, 19349663) ^ worldSeed) >>> 0
  for (const letter of type) seed = Math.imul(seed ^ letter.charCodeAt(0), 16777619) >>> 0
  return seed % 65536
}

export function layoutHand(type?: string, seed = 0): 1 | -1 {
  return type !== "inn" && hasBuildingLayouts(type) && (seed & 1) ? -1 : 1
}

/** Reflect the entire authored layout, including contacts, normals and cutaways. */
export function reflectBuildingParts(parts: BuildingPart[]): BuildingPart[] {
  return parts.map(part => {
    const vertices = part.vertices?.map((v, i) => i % 3 === 0 ? -v : v)
    if (vertices) for (let i = 0; i < vertices.length; i += 9) for (let axis = 0; axis < 3; axis++) {
      const swap = vertices[i + 3 + axis]
      vertices[i + 3 + axis] = vertices[i + 6 + axis]; vertices[i + 6 + axis] = swap
    }
    return { ...part, position: [-part.position[0], part.position[1], part.position[2]], vertices,
      rotation: part.rotation ? [part.rotation[0], -part.rotation[1], -part.rotation[2]] : undefined,
      cutawaySide: part.cutawaySide ? [-part.cutawaySide[0], part.cutawaySide[1]] : undefined,
      support: part.support ? { ...part.support, heading: -(part.support.heading ?? 0),
        anchorOffset: part.support.anchorOffset ? [-part.support.anchorOffset[0], part.support.anchorOffset[1]] : undefined } : undefined,
    }
  })
}
