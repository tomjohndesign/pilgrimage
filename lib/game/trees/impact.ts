import type { TreePlacement } from "./placement"

export const TREE_IMPACT_DURATION = 0.65
export const treeImpacts = new Map<TreePlacement, { elapsed: number; heading: number }>()

/** The sprite's contact frame starts a brief recoil away from the axe. */
export function strikeTree(tree: TreePlacement, heading: number) {
  treeImpacts.set(tree, { elapsed: 0, heading })
}

export function treeImpactAngle(elapsed: number): number {
  if (elapsed <= 0 || elapsed >= TREE_IMPACT_DURATION) return 0
  return 0.055 * Math.sin(elapsed * Math.PI * 10) * Math.exp(-elapsed * 5) * (1 - elapsed / TREE_IMPACT_DURATION)
}
