/** A narrow band in CSS pixels, independent of render resolution and zoom. */
const EDGE_PAN_BAND = 24

/** Screen-relative input: right is positive X, up is positive Y. */
export function cameraEdgePan(
  x: number,
  y: number,
  bounds: { left: number; top: number; right: number; bottom: number },
): { strafe: number; forward: number } {
  const width = bounds.right - bounds.left, height = bounds.bottom - bounds.top
  if (width <= 0 || height <= 0 || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) {
    return { strafe: 0, forward: 0 }
  }
  const bandX = Math.min(EDGE_PAN_BAND, width / 2), bandY = Math.min(EDGE_PAN_BAND, height / 2)
  const strength = (distance: number, band: number) => Math.max(0, 1 - distance / band)
  const strafe = strength(bounds.right - x, bandX) - strength(x - bounds.left, bandX)
  const forward = strength(y - bounds.top, bandY) - strength(bounds.bottom - y, bandY)
  // Corners move diagonally without exceeding the maximum pan speed.
  const length = Math.max(1, Math.hypot(strafe, forward))
  return { strafe: strafe / length, forward: forward / length }
}
