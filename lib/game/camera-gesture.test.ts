import { describe, expect, it } from "vitest"
import { CameraGesture } from "./camera-gesture"

describe("camera touch gestures", () => {
  it("allows a tap with finger jitter, but rejects a drag that returns to its start", () => {
    const gesture = new CameraGesture()
    gesture.start(1, { x: 100, y: 100 })
    gesture.move(1, { x: 103, y: 102 })
    expect(gesture.end(1, { x: 103, y: 102 })).toBe(true)
    gesture.start(2, { x: 100, y: 100 })
    gesture.move(2, { x: 150, y: 100 })
    gesture.move(2, { x: 100, y: 100 })
    expect(gesture.end(2, { x: 100, y: 100 })).toBe(false)
  })

  it("zooms around the midpoint and continues panning after either finger lifts", () => {
    for (const lifted of [1, 2]) {
      const gesture = new CameraGesture()
      gesture.start(1, { x: 100, y: 100 })
      gesture.start(2, { x: 200, y: 100 })
      expect(gesture.move(2, { x: 300, y: 100 })).toEqual({
        before: { x: 150, y: 100, distance: 100 },
        after: { x: 200, y: 100, distance: 200 },
        zoom: 0.5,
      })
      expect(gesture.end(lifted, { x: lifted === 1 ? 100 : 300, y: 100 })).toBe(false)
      const remaining = lifted === 1 ? 2 : 1
      const x = remaining === 1 ? 100 : 300
      const movement = gesture.move(remaining, { x: x + 10, y: 110 })!
      expect(movement.after.x - movement.before.x).toBe(10)
      expect(movement.zoom).toBe(1)
      expect(gesture.end(remaining, { x: x + 10, y: 110 })).toBe(false)
      expect(gesture.active).toBe(false)
      gesture.start(3, { x: 100, y: 100 })
      expect(gesture.end(3, { x: 100, y: 100 })).toBe(true)
    }
  })

  it("never treats a stationary multi-touch sequence or cancellation as a tap", () => {
    const gesture = new CameraGesture()
    gesture.start(1, { x: 100, y: 100 })
    gesture.start(2, { x: 100, y: 100 })
    expect(gesture.move(2, { x: 101, y: 100 })?.zoom).toBe(1)
    expect(gesture.end(2, { x: 101, y: 100 })).toBe(false)
    expect(gesture.end(1, { x: 100, y: 100 })).toBe(false)
    gesture.start(3, { x: 100, y: 100 })
    expect(gesture.end(3, { x: 100, y: 100 }, true)).toBe(false)
    gesture.start(4, { x: 100, y: 100 })
    gesture.clear()
    expect(gesture.move(4, { x: 150, y: 100 })).toBeNull()
    expect(gesture.end(4, { x: 100, y: 100 })).toBe(false)
  })
})
