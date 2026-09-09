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
        before: { x: 150, y: 100, distance: 100, angle: 0 },
        after: { x: 200, y: 100, distance: 200, angle: 0 },
        zoom: 0.5,
        rotation: 0,
      })
      expect(gesture.end(lifted, { x: lifted === 1 ? 100 : 300, y: 100 })).toBe(false)
      const remaining = lifted === 1 ? 2 : 1
      const x = remaining === 1 ? 100 : 300
      const movement = gesture.move(remaining, { x: x + 10, y: 110 })!
      expect(movement.after.x - movement.before.x).toBe(10)
      expect(movement.zoom).toBe(1)
      expect(movement.rotation).toBe(0)
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
    expect(gesture.move(2, { x: 101, y: 100 })).toMatchObject({ zoom: 1, rotation: 0 })
    expect(gesture.end(2, { x: 101, y: 100 })).toBe(false)
    expect(gesture.end(1, { x: 100, y: 100 })).toBe(false)
    gesture.start(3, { x: 100, y: 100 })
    expect(gesture.end(3, { x: 100, y: 100 }, true)).toBe(false)
    gesture.start(4, { x: 100, y: 100 })
    gesture.clear()
    expect(gesture.move(4, { x: 150, y: 100 })).toBeNull()
    expect(gesture.end(4, { x: 100, y: 100 })).toBe(false)
  })

  it("tracks clockwise and counterclockwise twists while zooming and moving the midpoint", () => {
    for (const direction of [-1, 1]) {
      const gesture = new CameraGesture()
      gesture.start(1, { x: 100, y: 100 })
      gesture.start(2, { x: 200, y: 100 })
      const movement = gesture.move(2, { x: 100, y: 100 + direction * 200 })!
      expect(movement.rotation).toBeCloseTo(direction * Math.PI / 2)
      expect(movement.zoom).toBe(0.5)
      expect(movement.after).toMatchObject({ x: 100, y: 100 + direction * 100 })
      expect(gesture.end(2, { x: 100, y: 100 + direction * 200 })).toBe(false)
      expect(gesture.end(1, { x: 100, y: 100 })).toBe(false)
    }
  })

  it("takes the short arc when twisting across the angle boundary in either direction", () => {
    for (const direction of [-1, 1]) {
      const gesture = new CameraGesture()
      gesture.start(1, { x: 200, y: 200 })
      gesture.start(2, { x: 100, y: 200 + direction })
      const movement = gesture.move(2, { x: 100, y: 200 - direction })!
      expect(movement.rotation).toBeCloseTo(direction * 2 * Math.atan(0.01))
      expect(movement.zoom).toBe(1)
    }
  })

  it("starts a fresh angle baseline when replacing either finger", () => {
    for (const lifted of [1, 2]) {
      const gesture = new CameraGesture()
      gesture.start(1, { x: 100, y: 100 })
      gesture.start(2, { x: 200, y: 100 })
      gesture.move(2, { x: 100, y: 200 })
      gesture.end(lifted, { x: 100, y: lifted === 1 ? 100 : 200 })
      const remaining = lifted === 1 ? 2 : 1
      const y = remaining === 1 ? 100 : 200
      expect(gesture.move(remaining, { x: 110, y })?.rotation).toBe(0)
      gesture.start(3, { x: 210, y })
      expect(gesture.move(3, { x: 210, y })?.rotation).toBe(0)
      expect(gesture.move(3, { x: 110, y: y + 100 })?.rotation).toBeCloseTo(Math.PI / 2)
    }
  })
})
