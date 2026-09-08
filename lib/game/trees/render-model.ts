/** Procedural trees are retained only as a performance comparison. */
export const TREE_MODELS = ["sprites", "procedural"] as const
export type TreeModel = typeof TREE_MODELS[number]
export const DEFAULT_TREE_MODEL: TreeModel = "sprites"
export function treeModelForGame(value: unknown, benchmark = process.env.NEXT_PUBLIC_GAME_BENCHMARK === "1"): TreeModel {
  return benchmark && value === "procedural" ? "procedural" : DEFAULT_TREE_MODEL
}
