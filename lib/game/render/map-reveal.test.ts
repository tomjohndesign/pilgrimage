import { describe, expect, it } from "vitest"
import { MapRevealState, REVEAL_TIMEOUT } from "./map-reveal"

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

  it("reveals a map whose assets never settle rather than stranding the player", () => {
    const state = new MapRevealState()
    state.begin() // A boundary that never resolves: the disposer is never called.
    for (let second = 0; second < REVEAL_TIMEOUT - 1; second++)
      for (let frame = 0; frame < 60; frame++) state.advance(1 / 60, true, false)
    expect(state.phase).toBe("loading")
    expect(state.timedOut).toBe(false)
    for (let frame = 0; frame < 120; frame++) state.advance(1 / 60, true, false)
    expect(state.phase).toBe("revealing")
    expect(state.timedOut).toBe(true)
    expect(state.pending).toBe(1)
  })

  it("completes a timed-out reveal under reduced motion", () => {
    const state = new MapRevealState()
    state.begin()
    for (let frame = 0; frame < 60 * (REVEAL_TIMEOUT + 1); frame++) state.advance(1 / 60, true, true)
    expect(state.phase).toBe("complete")
    expect(state.progress).toBe(1)
  })

  it("does not let a stall between frames trip the timeout on its own", () => {
    const state = new MapRevealState()
    const finish = state.begin()
    // A backgrounded tab reports one enormous delta; it must not count as the whole wait.
    state.advance(600, true, false)
    expect(state.phase).toBe("loading")
    expect(state.timedOut).toBe(false)
    finish()
    warm(state)
    expect(state.phase).toBe("revealing")
    expect(state.timedOut).toBe(false)
  })

  it("runs the ordinary reveal to completion without the timeout interfering", () => {
    const state = new MapRevealState()
    const terrain = state.begin(), sprites = state.begin()
    // A realistic load: assets settle after about two seconds of frames.
    for (let frame = 0; frame < 120; frame++) state.advance(1 / 60, false, false)
    expect(state.phase).toBe("loading")
    terrain(); sprites()
    warm(state)
    expect(state.phase).toBe("revealing")
    for (let frame = 0; frame < 120; frame++) state.advance(1 / 60, false, false)
    expect(state.phase).toBe("complete")
    expect(state.progress).toBe(1)
    expect(state.timedOut).toBe(false)
  })
})
