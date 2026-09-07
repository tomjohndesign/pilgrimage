import type { TreeSpeciesDef, TreeSpeciesId } from "../species"

/**
 * Sprite crowns are baked at full size and never stretched, so a stand drawn
 * with foliage sprites needs more room per trunk than the parametric trees:
 * one tree of a species per tile, with footprints sized to the baked crowns.
 * Big broadleaves hold the most ground; hawthorn and holly stand closest.
 */
export const FOLIAGE_FOOTPRINT: Record<TreeSpeciesId, number> = {
  oak: 0.85, beech: 0.85, birch: 0.6, scotsPine: 0.6, hawthorn: 0.45, holly: 0.45,
}

export function foliageSpacing(species: Record<TreeSpeciesId, TreeSpeciesDef>): Record<TreeSpeciesId, TreeSpeciesDef> {
  return Object.fromEntries(Object.entries(species).map(([id, def]) => [id, {
    ...def, habitat: { ...def.habitat, footprint: FOLIAGE_FOOTPRINT[id as TreeSpeciesId], perTile: 1 },
  }])) as Record<TreeSpeciesId, TreeSpeciesDef>
}
