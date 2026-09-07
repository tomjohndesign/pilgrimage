/**
 * How the forest is drawn. The parametric low-poly trees are the shipped
 * default; the baked pixel foliage sprites are the prototype from the tree
 * playground, switchable from the World panel so both can be judged in play.
 */
export const TREE_MODELS = ["procedural", "sprites"] as const
export type TreeModel = typeof TREE_MODELS[number]
export const DEFAULT_TREE_MODEL: TreeModel = "procedural"
export function isTreeModel(value: unknown): value is TreeModel {
  return (TREE_MODELS as readonly unknown[]).includes(value)
}
