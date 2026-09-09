import { describe, expect, it } from "vitest"
import { MapRevealState } from "./map-reveal"

function warm(state: MapRevealState, reducedMotion = false) {
  for (let frame = 0; frame < 3; frame++) state.advance(1 / 60, false, reducedMotion)
}

describe("map reveal readiness", () => {
  it("keeps the scene covered until every asset settles and two frames have rendered", () => {
    const state = new MapRevealState()
    const terrain = state.begin(), sprites = state.begin()
    warm(state)
    terrain()
    warm(state)
    expect(state.phase).toBe("loading")
    sprites()
    state.advance(1 / 60, false, false)
    state.advance(1 / 60, false, false)
    expect(state.phase).toBe("loading")
    state.advance(1 / 60, false, false)
    expect(state.phase).toBe("revealing")
  })

  it("waits for generated character assets and restarts warming for newly mounted textures", () => {
    const state = new MapRevealState()
    state.advance(1 / 60, false, false)
    state.advance(1 / 60, true, false)
    expect(state.phase).toBe("loading")
    const finish = state.begin()
    finish()
    finish() // Cleanup after success or failure must not decrement twice.
    expect(state.pending).toBe(0)
    warm(state)
    expect(state.phase).toBe("revealing")
  })

  it("does not skip the animation after a slow GPU frame or replay it for later assets", () => {
    const state = new MapRevealState()
    warm(state)
    state.advance(10, false, false)
    expect(state.progress).toBeLessThan(0.05)
    for (let frame = 0; frame < 120; frame++) state.advance(1 / 60, false, false)
    expect(state.phase).toBe("complete")
    const finish = state.begin()
    warm(state)
    expect(state.phase).toBe("complete")
    finish()
  })

  it("reveals immediately after readiness with reduced motion, including when enabled mid-reveal", () => {
    const state = new MapRevealState()
    const finish = state.begin()
    warm(state, true)
    expect(state.phase).toBe("loading")
    finish()
    warm(state, true)
    expect(state.phase).toBe("complete")
    expect(state.progress).toBe(1)
    const second = new MapRevealState()
    warm(second)
    second.advance(1 / 60, false, true)
    expect(second.phase).toBe("complete")
  })
})
