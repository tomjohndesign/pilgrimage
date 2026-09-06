import { validatePersonDesign } from "./base-person/design"
import { personWalkStride } from "./base-person/gait"
import { actionPlaybackRate } from "./base-person/activity"
import { ACTION_CLIPS, type ActionClip } from "./base-person/pose"
import type { BasePersonBake } from "./base-person/bake"
import type { TravelerTypeId } from "./travelers"
import baseMetadata from "../../public/textures/characters/base/base-person-v26.json"

export type CharacterModel = "base" | "callings"

export interface SpriteClip {
  url: string
  columns: number
  rows: number
  stillFrame: number
  playbackRate?: number
  /** Number of full leg strides represented by this atlas loop. */
  strides?: number
}

/** Layout belongs to the selected art, independently of traveler identity/SFX. */
export function characterVisual(asset: CharacterAsset, model: CharacterModel, custom?: BasePersonBake | null) {
  const metadata = custom?.metadata ?? baseMetadata
  if (model === "base") return {
    walk: { strides: "walkStrides" in metadata ? Number(metadata.walkStrides) : 1, url: custom?.walk ?? baseMetadata.images.walk, columns: metadata.frameCount, rows: metadata.directions.length, stillFrame: 0 } satisfies SpriteClip,
    idle: { url: custom?.idle ?? baseMetadata.images.idle, columns: 1, rows: metadata.directions.length, stillFrame: 0 } satisfies SpriteClip,
    actions: Object.fromEntries(ACTION_CLIPS.flatMap(clip => {
      const action = custom?.actions?.[clip] ?? baseMetadata.images.actions[clip]
      return action ? [[clip, { url: action.url, shadow: action.shadow, playbackRate: actionPlaybackRate(clip, validatePersonDesign(metadata.design)), columns: metadata.clips[clip].length / metadata.directions.length, rows: metadata.directions.length, stillFrame: 0 }]] : []
    })) as Partial<Record<ActionClip, SpriteClip & { shadow: string }>>,
    shadow: { walk: custom?.shadowWalk ?? baseMetadata.images.shadowWalk, idle: custom?.shadowIdle ?? baseMetadata.images.shadowIdle },
    center: [metadata.anchor[0] / metadata.cellSize, 1 - metadata.anchor[1] / metadata.cellSize] as [number, number],
    fps: 18, scale: 0.74 * metadata.cellSize / 48,
    design: validatePersonDesign(metadata.design),
    walkStride: personWalkStride(validatePersonDesign(metadata.design), 0.74 * metadata.cellSize / 48, metadata.camera.viewSize),
  }
  const clip: SpriteClip = { url: asset.sheet, columns: 4, rows: 8, stillFrame: 1 }
  return { walk: clip, idle: clip, actions: {} as Partial<Record<ActionClip, SpriteClip & { shadow: string }>>, shadow: null, center: [0.5, 6 / 64] as [number, number], fps: asset.fps, scale: asset.scale, walkStride: 0.44 * asset.scale / 0.74, design: undefined }
}

/** Screen-relative facing, clockwise from the front, matching the atlas rows. */
export const SPRITE_DIRECTIONS = ["S", "SW", "W", "NW", "N", "NE", "E", "SE"] as const
export const SPRITE_CELL = 64
export const SPRITE_COLUMNS = 4
export const SPRITE_ROWS = 8

export interface CharacterAsset {
  sheet: string
  sound: string
  soundLabel: string
  fps: number
  /** Full 64px cell height in world units; visible figure occupies 48px. */
  scale: number
  volume: number
}

const soundLabels: Record<TravelerTypeId, string> = {
  peasant: "Soft steps & cloth",
  pilgrim: "Staff tap & pilgrim bell",
  merchant: "A purse of coins",
  friar: "Low chapel bells",
  knight: "Armour & steel",
  minstrel: "Three lute notes",
  vendor: "Wooden cart & shop bell",
}

export const CHARACTER_ASSETS = Object.fromEntries(
  Object.entries(soundLabels).map(([id, soundLabel]) => [id, {
    sheet: `/textures/characters/${id}-v1.png`,
    sound: `/sounds/characters/${id}-select-v1.wav`,
    soundLabel, fps: 6, scale: 0.74, volume: 0.65,
  }]),
) as Record<TravelerTypeId, CharacterAsset>

/** Heading is atan2(world dx, world dz), yaw points from the target to camera. */
export function spriteRow(heading: number, cameraYaw: number, directions = 8): number {
  return ((Math.round((cameraYaw - heading) / (Math.PI * 2 / directions)) % directions) + directions) % directions
}

export function spriteFrame(seconds: number, fps: number, moving = true, columns = 4, stillFrame = 1): number {
  return moving ? ((Math.floor(seconds * fps) % columns) + columns) % columns : stillFrame
}

/** Stable slight pitch variation gives individual travelers their own cue. */
export function selectionPlaybackRate(id: number): number {
  return 0.92 + (((Math.imul(id + 1, 2654435761) >>> 0) % 1000) / 1000) * 0.16
}
