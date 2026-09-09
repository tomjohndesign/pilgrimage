export type MapRevealPhase = "loading" | "revealing" | "complete"

/** Wait for committed assets and two warm frames before exposing the scene. */
export class MapRevealState {
  pending = 0
  phase: MapRevealPhase = "loading"
  progress = 0
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
      if (this.pending || preparing) this.warmFrames = 0
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
