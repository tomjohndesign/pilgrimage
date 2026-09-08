/** Display preferences only; hiding a layer never changes the simulation. */
export interface SceneVisibility {
  showTrees: boolean
  showCharacters: boolean
  showWildlife: boolean
  showScenery: boolean
  buildingVisibility: "auto" | "interiors" | "hidden"
}

export const DEFAULT_SCENE_VISIBILITY: SceneVisibility = {
  showTrees: true,
  showCharacters: true,
  showWildlife: true,
  showScenery: true,
  buildingVisibility: "auto",
}

export const VISIBILITY_TOGGLES = [
  ["showTrees", "Trees"],
  ["showCharacters", "Characters"],
  ["showWildlife", "Wildlife"],
  ["showScenery", "Scenery"],
] as const

export function parseSceneVisibility(params: Record<string, string | undefined>): Partial<SceneVisibility> {
  const visibility: Partial<SceneVisibility> = {}
  for (const [key] of VISIBILITY_TOGGLES) {
    if (params[key] === "0" || params[key] === "1") visibility[key] = params[key] === "1"
  }
  const buildings = params.buildingVisibility
  if (buildings === "auto" || buildings === "interiors" || buildings === "hidden") visibility.buildingVisibility = buildings
  return visibility
}

/** Three's raycaster ignores visibility, unlike its renderer. Check ancestors too. */
export function isObjectVisible(object: { visible?: boolean; parent?: object | null }): boolean {
  for (let node: typeof object | null = object; node; node = node.parent ?? null) {
    if (node.visible === false) return false
  }
  return true
}
