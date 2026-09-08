/** Trees use native pixel foliage sprites; the original geometry remains available in tuning. */
export const TREE_MODELS = ["procedural", "sprites"] as const
export type TreeModel = typeof TREE_MODELS[number]
export const DEFAULT_TREE_MODEL: TreeModel = "sprites"
export function isTreeModel(value: unknown): value is TreeModel {
  return (TREE_MODELS as readonly unknown[]).includes(value)
}
