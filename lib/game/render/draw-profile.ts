import type * as THREE from "three"

interface DrawTotals { calls: number; triangles: number; lines: number; points: number }

/** Opt-in counts of actual renderer submissions, including every color/ID pass.
 * Hidden scene nodes and resident batch capacity are not counted as draws. */
export function createDrawProfile(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const originalDraw = renderer.renderBufferDirect, originalRender = renderer.render
  const categories = new WeakMap<THREE.Object3D, string>()
  let active = false
  let draws: Record<string, DrawTotals> = {}, passes: Record<string, number> = {}
  const category = (object: THREE.Object3D) => {
    // Isolation swaps a road mesh to its plain-ground material in place.
    if (object.name === "terrain-path") return object.userData.pathsVisible === false ? "ground" : "paths"
    if (object.name === "terrain-path-edge") return "paths"
    const cached = categories.get(object)
    if (cached) return cached
    let label = object.name || object.type
    for (let node: THREE.Object3D | null = object; node; node = node.parent) {
      if (node.name.startsWith("visibility-")) { label = node.name.slice("visibility-".length); break }
      if (node.name === "scenery-batches") { label = "scenery"; break }
    }
    categories.set(object, label)
    return label
  }
  const draw: typeof originalDraw = function (...args) {
    const info = renderer.info.render
    const calls = info.calls, triangles = info.triangles, lines = info.lines, points = info.points
    originalDraw.apply(renderer, args)
    if (info.calls === calls) return
    const key = category(args[4])
    const total = draws[key] ?? (draws[key] = { calls: 0, triangles: 0, lines: 0, points: 0 })
    total.calls += info.calls - calls; total.triangles += info.triangles - triangles
    total.lines += info.lines - lines; total.points += info.points - points
  }
  const render: typeof originalRender = function (object, camera) {
    const key = object === scene ? `scene-layer-${camera.layers.mask}` : "presentation"
    passes[key] = (passes[key] ?? 0) + 1
    originalRender.call(renderer, object, camera)
  }
  const stop = () => {
    if (!active) return
    if (renderer.renderBufferDirect === draw) renderer.renderBufferDirect = originalDraw
    if (renderer.render === render) renderer.render = originalRender
    active = false
  }
  return {
    capture(enabled: boolean) {
      if (!enabled) { stop(); return { draws, passes } }
      draws = {}; passes = {}
      if (!active) { renderer.renderBufferDirect = draw; renderer.render = render; active = true }
      return { draws, passes }
    },
    dispose: stop,
  }
}
