/**
 * World-space blocks, for frustum culling instanced scenery.
 *
 * Scenery batched by kind alone gives one instanced mesh per kind whose bounds
 * span the whole map, so the frustum test always passes and every tree and
 * every tuft of grass is submitted every frame however far the camera is zoomed
 * in — on a 192-tile map that is ~16M triangles to show the handful of things
 * actually on screen. Splitting each kind into blocks lets three.js reject the
 * ones off screen.
 *
 * The block size trades culling precision against draw calls. Bounding spheres
 * are what the frustum tests, so a block is rejected only once it clears the
 * view by its own half-diagonal; smaller blocks cull tighter but multiply the
 * batches drawn when the whole map is in view. Measured across the zoom range
 * on a 192-tile map, 24 beat both 16 and 12: the smaller sizes gave up more to
 * draw-call overhead when zoomed out than they saved when zoomed in.
 */
export const SCENERY_BLOCK = 24

/** Row-major key of the block a world position falls in. */
export function blockKey(x: number, z: number): number {
  // Maps are far smaller than this stride, so no two blocks ever collide.
  return Math.floor(x / SCENERY_BLOCK) * 4096 + Math.floor(z / SCENERY_BLOCK)
}
