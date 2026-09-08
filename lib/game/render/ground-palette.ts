import * as THREE from "three"
import { TERRAIN } from "../map/terrain"

/** Habitat tints for turf-covered scenery. Terrain canopy shade uses live tree density. */
export const DEEP_WOOD_TINT = new THREE.Color("#36452a")
export const OPEN_MEADOW_TINT = new THREE.Color("#94a158")

/** Extra dark-habitat tint for small pieces of turf-covered scenery. */
export const DARK_WOOD_DARKEN = 0.4

/** Grass base colour shared by terrain and small turf-covered scenery. */
export function grassSurfaceColor(shade = 0, dark = 0, grain = 0) {
  const tint = OPEN_MEADOW_TINT.clone().lerp(DEEP_WOOD_TINT, shade)
  return new THREE.Color(TERRAIN.grass.color).lerp(tint, TERRAIN.grass.shadeBlend)
    .multiplyScalar((1 + grain * TERRAIN.grass.jitter) * (1 - DARK_WOOD_DARKEN * dark))
}
