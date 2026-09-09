export interface GesturePoint { x: number; y: number }

function frame(points: Map<number, GesturePoint>) {
  const [a, b] = points.values()
  return b
    ? {
      x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
      distance: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    }
    : { ...a, distance: 0, angle: 0 }
}

/** A gesture stays camera-only after a drag, pinch or twist, until every finger lifts. */
export class CameraGesture {
  private points = new Map<number, GesturePoint>()
  private origin: GesturePoint = { x: 0, y: 0 }
  dragged = false

  has(id: number) { return this.points.has(id) }

  get active() { return this.points.size > 0 }
  get pinching() { return this.points.size > 1 }

  start(id: number, point: GesturePoint) {
    if (!this.active) {
      this.origin = point
      this.dragged = false
    } else this.dragged = true
    this.points.set(id, point)
  }

  move(id: number, point: GesturePoint) {
    if (!this.points.has(id)) return null
    const before = frame(this.points)
    this.points.set(id, point)
    if (Math.hypot(point.x - this.origin.x, point.y - this.origin.y) > 6) this.dragged = true
    const after = frame(this.points)
    const angle = after.angle - before.angle
    return {
      before, after,
      zoom: before.distance > 0 && after.distance > 0 ? before.distance / after.distance : 1,
      // Take the short arc across ±π; coincident fingers have no direction.
      rotation: before.distance > 0 && after.distance > 0
        ? Math.atan2(Math.sin(angle), Math.cos(angle)) : 0,
    }
  }

  end(id: number, point: GesturePoint, cancelled = false) {
    if (!this.points.has(id)) return false
    const tap = !cancelled && !this.dragged && this.points.size === 1
      && Math.hypot(point.x - this.origin.x, point.y - this.origin.y) <= 6
    if (!tap) this.dragged = true
    this.points.delete(id)
    return tap
  }

  clear() {
    this.points.clear()
    this.dragged = true
  }
}
