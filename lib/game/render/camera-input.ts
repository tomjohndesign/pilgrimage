/** Shared game wheel response. The factor multiplies visible world size. */
export function wheelZoomFactor(deltaY: number, deltaMode = 0): number {
  return Math.exp((deltaMode === 1 ? deltaY * 16 : deltaY) * .0015)
}
