export type MapRevealPhase = "loading" | "revealing" | "complete"

/**
 * Seconds of loading after which the map is revealed regardless of outstanding
 * assets. A Suspense boundary that never settles — a texture decode that fails
 * silently, a fetch stalled on a flaky connection — would otherwise hold
 * `pending` above zero and strand the player on the loading screen forever.
 */
export const REVEAL_TIMEOUT = 20

/** A single frame contributes at most this much, so a long stall between frames cannot trip the timeout on its own. */
const MAX_FRAME_WAIT = .25

/** Wait for committed assets and two warm frames before exposing the scene. */
export class MapRevealState {
  pending = 0
  phase: MapRevealPhase = "loading"
  progress = 0
  /** Seconds spent loading, capped per frame; drives the failure timeout. */
  waited = 0
  /** True when the reveal was forced by the timeout rather than by assets settling. */
  timedOut = false
  private warmFrames = 0

  begin() {
    this.pending++
    this.warmFrames = 0
    let active = true
    return () => {
      if (!active) return
      active = false
      this.pending--
      this.warmFrames = 0
    }
  }

  advance(delta: number, preparing: boolean, reducedMotion: boolean) {
    if (this.phase === "loading") {
      this.waited += Math.min(delta, MAX_FRAME_WAIT)
      // Never let an asset that cannot settle outlast the player's patience.
      // Revealing early costs some pop-in; waiting forever costs the session.
      if (this.waited >= REVEAL_TIMEOUT) {
        this.timedOut = true
        this.phase = reducedMotion ? "complete" : "revealing"
      } else if (this.pending || preparing) this.warmFrames = 0
      else if (++this.warmFrames >= 3) this.phase = reducedMotion ? "complete" : "revealing"
    } else if (this.phase === "revealing") {
      // Shader compilation or a background tab must not swallow the reveal.
      this.progress = Math.min(1, this.progress + Math.min(delta, 0.05) / 1.6)
      if (this.progress === 1 || reducedMotion) this.phase = "complete"
    }
    if (this.phase === "complete") this.progress = 1
    return this.phase
  }
}
