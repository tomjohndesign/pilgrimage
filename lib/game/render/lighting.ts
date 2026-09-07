import * as THREE from "three"
import { lightOffsetForYaw } from "./iso"

/** Shared surface lighting for map geometry and native-pixel sprite bakes. */
export const SURFACE_LIGHT = {
  ambient: 0.5,
  sky: "#bcd0f0",
  ground: "#3a2a16",
  hemisphere: 0.45,
  sun: 2.7,
} as const

/** Bake at yaw zero: rotate the rig for each atlas row, never its light. */
export function addSurfaceLighting(scene: THREE.Scene, yaw = 0) {
  const sun = new THREE.DirectionalLight(0xffffff, SURFACE_LIGHT.sun)
  sun.position.set(...lightOffsetForYaw(yaw))
  // Surface shading only; no shadow maps, receivers or extra render passes.
  sun.castShadow = false
  scene.add(new THREE.AmbientLight(0xffffff, SURFACE_LIGHT.ambient),
    new THREE.HemisphereLight(SURFACE_LIGHT.sky, SURFACE_LIGHT.ground, SURFACE_LIGHT.hemisphere), sun)
  return sun
}
