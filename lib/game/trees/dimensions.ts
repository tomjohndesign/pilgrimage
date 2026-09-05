import { deriveSeed, makeRng, SEED_STREAM } from "../rng"
import type { TreePlacement } from "./placement"
import { generateTree, TREE_SPECIES, type TreeShape, type TreeSpeciesDef, type TreeSpeciesId } from "./species"

/** Sample once so rendering, timber yield and remains share the same individual. */
export function growTreePlacements(
  placements: readonly TreePlacement[], seed: number,
  species: Record<TreeSpeciesId, TreeSpeciesDef> = TREE_SPECIES, variance = 1,
): TreePlacement[] {
  const rng = makeRng(seed)
  return placements.map((tree) => ({ ...tree, shape: generateTree(species[tree.species], rng, variance),
    trunkTaper: species[tree.species].trunk.taper, footprint: species[tree.species].habitat.footprint }))
}

/** Hand-authored maps can omit a shape; game maps always supply the rendered one. */
export function shapeForTree(tree: TreePlacement, index: number, seed: number): TreeShape {
  return tree.shape ?? generateTree(TREE_SPECIES[tree.species],
    makeRng(deriveSeed(seed, SEED_STREAM.treeShapes) ^ Math.imul(index + 1, 73)))
}
