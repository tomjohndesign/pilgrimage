import type { Scene } from "three"

export type FrameQuality = 0 | 1 | 2
export const frameQualityControl = { enabled: true }

/** Sustained frame pressure reduces detail; recovery needs several seconds of
 * spare time. Cap individual stalls so one loading frame cannot change detail. */
export class FrameQualityController {
  level: FrameQuality = 0
  private elapsed = 0
  private frames = 0
  private recovery = 0

  update(delta: number, hold = false, canRecover = true): FrameQuality {
    if (hold || !Number.isFinite(delta) || delta <= 0) return this.level
    this.elapsed += Math.min(delta, .2); this.frames++
    if (this.elapsed < 1) return this.level
    const fps = this.frames / this.elapsed
    if (fps < 30) { this.level = Math.min(2, this.level + 1) as FrameQuality; this.recovery = 0 }
    else if (fps > 45 && canRecover) {
      if (++this.recovery >= 5) { this.level = Math.max(0, this.level - 1) as FrameQuality; this.recovery = 0 }
    } else this.recovery = 0
    this.elapsed = 0; this.frames = 0
    return this.level
  }
}

const controllers = new WeakMap<Scene, FrameQualityController>()
export function frameQuality(scene: Scene): FrameQuality { return frameQualityControl.enabled ? controllers.get(scene)?.level ?? 0 : 0 }
export function updateFrameQuality(scene: Scene, delta: number, hold: boolean, canRecover = true): FrameQuality {
  if (!frameQualityControl.enabled) { controllers.delete(scene); return 0 }
  let controller = controllers.get(scene)
  if (!controller) { controller = new FrameQualityController(); controllers.set(scene, controller) }
  return controller.update(delta, hold, canRecover)
}
