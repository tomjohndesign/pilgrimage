import type { SpriteClip } from "../character-assets"
import manifest from "../../../public/textures/characters/minstrel/v4/manifest.json"

export const MINSTREL_PLAYING: SpriteClip & { fps: number; reservedTones: boolean } = {
  reservedTones: (manifest as { reservedTones?: boolean }).reservedTones === true,
  url: `/textures/characters/minstrel/v${manifest.version}/playing.png`,
  depth: `/textures/characters/minstrel/v${manifest.version}/depth-playing.png`,
  columns: manifest.frames, rows: manifest.rows, stillFrame: 0, fps: manifest.fps,
}
