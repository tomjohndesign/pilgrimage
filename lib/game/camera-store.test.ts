import { afterEach, expect, it } from "vitest"
import { useCameraStore } from "./camera-store"

const initial = useCameraStore.getState()
afterEach(() => useCameraStore.setState(initial, true))

it("locks pan, minimap focus, rotation, zoom and reset during the opening reveal", () => {
  useCameraStore.setState({ inputLocked: true, targetX: 3, targetZ: 4, viewIndex: 1, viewSize: 25 })
  const camera = useCameraStore.getState()
  camera.pan(5, 5)
  camera.panTo(-10, -10)
  camera.rotate(1)
  camera.zoomBy(2)
  camera.reset()
  expect(useCameraStore.getState()).toBe(camera)
  // World creation can still focus its church while player controls are locked.
  useCameraStore.setState({ targetX: 8, targetZ: 9 })
  expect(useCameraStore.getState().targetX).toBe(8)
  useCameraStore.setState({ inputLocked: false })
  camera.pan(1, 2)
  camera.rotate(1)
  camera.zoomBy(1.2)
  expect(useCameraStore.getState()).toMatchObject({ targetX: 9, targetZ: 11, viewIndex: 2, viewSize: 30 })
})

it("follows only while something is selected and releases on any player pan", () => {
  const camera = useCameraStore.getState()
  camera.setFollowing(true)
  expect(useCameraStore.getState().following).toBe(false)
  camera.select({ kind: "traveler", id: 3 })
  camera.setFollowing(true)
  expect(useCameraStore.getState().following).toBe(true)
  camera.follow(4, 5)
  expect(useCameraStore.getState()).toMatchObject({ targetX: 4, targetZ: 5, following: true })
  camera.pan(1, 1)
  expect(useCameraStore.getState()).toMatchObject({ targetX: 5, targetZ: 6, following: false })
  // The follow step is inert once released.
  camera.follow(9, 9)
  expect(useCameraStore.getState().targetX).toBe(5)
  camera.setFollowing(true)
  camera.panTo(0, 0)
  expect(useCameraStore.getState().following).toBe(false)
  camera.setFollowing(true)
  camera.select({ kind: "monk", id: 1 })
  expect(useCameraStore.getState().following).toBe(false)
})
