import type { SpriteClip } from "../character-assets"
import manifest from "../../../public/textures/characters/minstrel/v1/manifest.json"

export const MINSTREL_PLAYING: SpriteClip & { fps: number } = {
  url: `/textures/characters/minstrel/v${manifest.version}/playing.png`,
  columns: manifest.frames, rows: manifest.rows, stillFrame: 0, fps: manifest.fps,
}
