import { layoutHand } from "./building-layout"
import { marketLayout } from "./market-layout"
/**
 * Where a posted worker stands inside their workplace. Leaf data with no
 * imports, so both the building catalogue and the task planner can read it
 * without pulling each other in.
 *
 * Offsets are fractions of the authored footprint, measured from its centre in
 * the building's own local frame (+Z is the front, where the door is), so a
 * resized or rotated building keeps its posts.
 */
export const WORK_POSTS: Record<string, readonly (readonly [number, number])[]> = {
  // Along the back of the serving counter, which stands at (width×.2, -depth×.14),
  // with a fourth keeper at the rear wall behind it, clear of the service door.
  tavern: [[0.06, -0.30], [0.34, -0.30], [0.20, -0.30], [0.20, -0.42]],
  // Both aisles, clear of the central beds, reception furniture and ladder.
  inn: [[-.215,-.225],[.215,-.225],[-.215,.225],[.215,.225]],
  // Out in the open fold, clear of the water trough and the gate.
  "sheep-pen": [[0.14, -0.10], [0.32, 0.18]],
  // Behind the stall counter at the front of the footprint.
  market: [[0, 0.02]],
}

export function workPost(type: string | undefined, slot: number, w: number, d: number, layoutSeed?: number): { x: number; z: number } | null {
  const posts = type ? WORK_POSTS[type] : undefined
  if (!posts?.length) return null
  const [x, z] = posts[((slot % posts.length) + posts.length) % posts.length]
  const layout = type === "market" ? marketLayout(w, d, layoutSeed) : null
  return { x: layout ? layout.stallX + x * layout.stallWidth * layout.hand : x * w * layoutHand(type,layoutSeed), z: z * d }
}
