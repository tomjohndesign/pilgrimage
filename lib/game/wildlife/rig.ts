import type { WildlifeKind } from "./species"
import { createBirdRig } from "./bird-rig"
import { createMammalRig } from "./mammal-rig"

/** All consumers use the same rig; bird artwork is independent of mammal anatomy. */
export function createWildlifeRig(kind: WildlifeKind, construction = false) {
  return kind === "hawk" || kind === "sparrow" ? createBirdRig(kind) : createMammalRig(kind, construction)
}
