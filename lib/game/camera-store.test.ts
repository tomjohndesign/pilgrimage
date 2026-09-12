import { afterEach, expect, it } from "vitest"
import { useCameraStore } from "./camera-store"
import { DEFAULT_VIEW_SIZE, WALK_VIEW_SIZE } from "./render/iso"

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

it("walks only with someone who walks, and gives the borrowed view back", () => {
  const camera = useCameraStore.getState()
  useCameraStore.setState({ viewSize: 30, viewIndex: 2 })
  camera.setWalkWith(true)
  expect(useCameraStore.getState().walkWith).toBe(false)
  camera.select({ kind: "animal", id: 4 })
  camera.setWalkWith(true)
  expect(useCameraStore.getState().walkWith).toBe(false)

  camera.select({ kind: "traveler", id: 3 })
  camera.setWalkWith(true)
  // The walk comes in close and takes the camera with it.
  expect(useCameraStore.getState()).toMatchObject({ walkWith: true, following: true, viewSize: WALK_VIEW_SIZE })
  camera.steer(3)
  camera.follow(4, 5)
  expect(useCameraStore.getState()).toMatchObject({ viewIndex: 3, targetX: 4, targetZ: 5 })

  camera.setWalkWith(false)
  expect(useCameraStore.getState()).toMatchObject({ walkWith: false, following: false, viewSize: 30, viewIndex: 2 })
  // The walk step is inert once it has ended.
  camera.steer(1)
  expect(useCameraStore.getState().viewIndex).toBe(2)
})

it("ends the walk on any player camera move, keeping the framing they chose", () => {
  const camera = useCameraStore.getState()
  // Each walk starts from the same settled view, so what it gives back is plain.
  const walk = () => {
    camera.select({ kind: "monk", id: 1 })
    useCameraStore.setState({ viewSize: DEFAULT_VIEW_SIZE, viewIndex: 0 })
    camera.setWalkWith(true)
  }

  walk()
  camera.pan(2, 0)
  expect(useCameraStore.getState()).toMatchObject({ walkWith: false, following: false, viewSize: WALK_VIEW_SIZE })

  walk()
  camera.rotate(1)
  expect(useCameraStore.getState().walkWith).toBe(false)

  // Zoom is the player's to keep inside the walk; nothing else writes it.
  walk()
  camera.zoomBy(1.25)
  expect(useCameraStore.getState()).toMatchObject({ walkWith: true, viewSize: WALK_VIEW_SIZE * 1.25 })

  // Leaving by the crosshair, by choosing someone else, or by reset all end it.
  camera.setFollowing(false)
  expect(useCameraStore.getState()).toMatchObject({ walkWith: false, following: false, viewSize: DEFAULT_VIEW_SIZE })

  walk()
  camera.select({ kind: "traveler", id: 9 })
  expect(useCameraStore.getState()).toMatchObject({ walkWith: false, viewSize: DEFAULT_VIEW_SIZE })

  walk()
  camera.reset()
  expect(useCameraStore.getState()).toMatchObject({ walkWith: false, viewSize: DEFAULT_VIEW_SIZE })
})

it("keeps the walk out of the opening reveal", () => {
  const camera = useCameraStore.getState()
  camera.select({ kind: "traveler", id: 3 })
  useCameraStore.setState({ inputLocked: true })
  camera.setWalkWith(true)
  expect(useCameraStore.getState().walkWith).toBe(false)
  useCameraStore.setState({ inputLocked: false })
  camera.setWalkWith(true)
  expect(useCameraStore.getState().walkWith).toBe(true)
  // A locked reveal cannot end one either; it waits for the player.
  useCameraStore.setState({ inputLocked: true })
  camera.setWalkWith(false)
  expect(useCameraStore.getState().walkWith).toBe(true)
})
