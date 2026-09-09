/** Diagnostic switches used only in explicitly enabled local benchmark builds.
 * Every normal game runs all systems. Isolation results are never target FPS
 * results: these switches deliberately remove work to identify its cost. */
export const benchmarkWork = {
  pathDrawing: true,
  pathUpdates: true,
  pathWear: true,
  replayRoutes: false,
  characterVisuals: true,
}
export type BenchmarkWork = typeof benchmarkWork
export function resetBenchmarkWork() {
  Object.assign(benchmarkWork, { pathDrawing: true, pathUpdates: true, pathWear: true, replayRoutes: false, characterVisuals: true })
}
