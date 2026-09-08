import * as THREE from "three"
import { TERRAIN } from "../map/terrain"

/**
 * Anchor tints for the forest-shade gradient. Every tile's colour is pulled
 * (by its terrain's `shadeBlend`) toward a point on the ramp between these two,
 * chosen by how deep in the woods it sits — so the ground darkens under the
 * forest cluster and brightens continuously toward open meadow, instead of
 * snapping between two flat greens at the tree line.
 */
export const DEEP_WOOD_TINT = new THREE.Color("#36452a")
export const OPEN_MEADOW_TINT = new THREE.Color("#94a158")

/**
 * The ground darkens by this much more under the heart of a dark forest.
 * Unlike the forest-shade tint this ignores `shadeBlend`: it is the canopy's
 * shadow, and it falls on the track cut through the old growth just as it
 * falls on the forest floor — a bright ribbon through the dark would lie
 * about how dark it is in there.
 */
export const DARK_WOOD_DARKEN = 0.4

/** Grass base colour shared by terrain and small turf-covered scenery. */
export function grassSurfaceColor(shade = 0, dark = 0, grain = 0) {
  const tint = OPEN_MEADOW_TINT.clone().lerp(DEEP_WOOD_TINT, shade)
  return new THREE.Color(TERRAIN.grass.color).lerp(tint, TERRAIN.grass.shadeBlend)
    .multiplyScalar((1 + grain * TERRAIN.grass.jitter) * (1 - DARK_WOOD_DARKEN * dark))
}
