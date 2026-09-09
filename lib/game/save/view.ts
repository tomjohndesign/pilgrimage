import { z } from "zod"

import { ISO_PITCH, projectGround, yawForView } from "../render/iso"
import { cameraSaveSchema, worldSettingsSchema, type CameraSave, type GameSave } from "./schema"
import { GAME_SAVE_KEY } from "./storage"

/**
 * A picture of the land the player was looking at, kept beside the save.
 *
 * Regenerating a world takes a moment. Rather than redraw the remembered
 * ground with a second copy of every terrain feature, the autosave keeps the
 * game's own world image: a crop of the pixel-art world buffer around the
 * camera focus, at the game's texel density. On reload the play page paints it
 * at the saved zoom before any game code runs, so the middle of the screen
 * shows exactly what the reveal will uncover.
 *
 * It is presentation cache, not game state, so it lives under its own key and
 * never travels with the save document. It is valid only for the world and
 * camera pose it was taken at; a save with any other pose ignores it.
 */
export const VIEW_SNAPSHOT_KEY = "pilgrimage.view.v1"

/**
 * The picture is as large a disc of tiles as the frustum holds, with room
 * above the far rim for the crowns of trees rooted there and a little either
 * side for their overhang. The disc sits a couple of tiles towards the viewer
 * from the focus, so the crowns of trees on its near rim, which lean over the
 * middle of the screen, belong to tiles inside it. Its texel count is capped
 * so a large display or a zoomed-out view never stores much more than half a
 * megabyte; the disc is then a little smaller.
 */
export const VIEW_SNAPSHOT_MAX_TEXELS: readonly [number, number] = [1024, 640]
/** Screen-space world units of canopy above a tree's base tile, and of crown either side. */
export const CANOPY_ALLOWANCE = 4.5
export const CROWN_OVERHANG = 2
/** Tiles the disc's centre lies towards the viewer from the focus. */
export const NEAR_SHIFT = 2
/** A tile of ground distance towards the viewer rises this far on screen. */
const TILE_RISE = Math.sin(ISO_PITCH)

const finite = z.number().finite()

export const viewSnapshotSchema = z.object({
  world: worldSettingsSchema,
  camera: cameraSaveSchema,
  image: z.string().startsWith("data:image/").describe("The world buffer crop as a data URL"),
  width: finite.positive().describe("Screen-space world units the image spans horizontally"),
  height: finite.positive(),
  offsetX: finite.describe("Image centre from the camera focus, screen-space world units, right and down"),
  offsetY: finite,
})

export type ViewSnapshot = z.output<typeof viewSnapshotSchema>

export function samePose(a: CameraSave, b: CameraSave): boolean {
  return a.targetX === b.targetX && a.targetZ === b.targetZ && a.viewIndex === b.viewIndex && a.viewSize === b.viewSize
}

/** The snapshot stands in for this save only when it shows the same world from the same place. */
export function viewSnapshotMatches(view: ViewSnapshot, save: Pick<GameSave, "world" | "camera">): boolean {
  return JSON.stringify(view.world) === JSON.stringify(save.world) && samePose(view.camera, save.camera)
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** The stored snapshot when it matches the save; null otherwise. */
export function loadViewSnapshot(save: Pick<GameSave, "world" | "camera">): ViewSnapshot | null {
  const store = storage()
  if (!store) return null
  try {
    const raw = store.getItem(VIEW_SNAPSHOT_KEY)
    if (raw === null) return null
    const result = viewSnapshotSchema.safeParse(JSON.parse(raw))
    return result.success && viewSnapshotMatches(result.data, save) ? result.data : null
  } catch {
    return null
  }
}

export function storeViewSnapshot(view: ViewSnapshot): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(VIEW_SNAPSHOT_KEY, JSON.stringify(view))
    return true
  } catch {
    return false
  }
}

export function clearViewSnapshot(): void {
  try {
    storage()?.removeItem(VIEW_SNAPSHOT_KEY)
  } catch {
    /* Nothing to clear when storage is unavailable. */
  }
}

/**
 * CSS custom properties that place the snapshot on the loading overlay: its
 * size and offset in dvh at the saved zoom, where 100dvh is the frustum height.
 * Null clears them. The same properties are written by the resume script
 * before hydration, so keep the names in step with `resumeViewScript`.
 */
export function viewSnapshotStyle(view: ViewSnapshot | null): Record<string, string | null> {
  if (!view) return { "--resume-view": null, "--resume-view-width": null, "--resume-view-height": null, "--resume-view-x": null, "--resume-view-y": null }
  const scale = 100 / view.camera.viewSize
  return {
    "--resume-view": `url("${view.image}")`,
    "--resume-view-width": `${view.width * scale}dvh`,
    "--resume-view-height": `${view.height * scale}dvh`,
    "--resume-view-x": `${view.offsetX * scale}dvh`,
    "--resume-view-y": `${view.offsetY * scale}dvh`,
  }
}

/** Write or clear the snapshot properties on the document root, which React never styles. */
export function applyViewSnapshot(view: ViewSnapshot | null): void {
  if (typeof document === "undefined") return
  const style = document.documentElement.style
  for (const [name, value] of Object.entries(viewSnapshotStyle(view))) {
    if (value === null) style.removeProperty(name)
    else style.setProperty(name, value)
  }
}

/**
 * An inline script for the play page when the resume cookie names this seed.
 * It runs while the HTML is still parsing, before the overlay below it paints,
 * so the remembered land is on screen from the first frame. It applies the
 * same checks as `loadViewSnapshot` and writes the same properties as
 * `viewSnapshotStyle`; a mismatch leaves the shimmer grid alone.
 */
export function resumeViewScript(seed: number): string {
  const save = JSON.stringify(GAME_SAVE_KEY), view = JSON.stringify(VIEW_SNAPSHOT_KEY)
  return `(function(){try{var s=localStorage.getItem(${save}),v=localStorage.getItem(${view});if(!s||!v)return;s=JSON.parse(s);v=JSON.parse(v);`
    + `if(!s||!v||!s.world||!s.camera||!v.world||!v.camera||s.world.seed!==${seed >>> 0}||JSON.stringify(v.world)!==JSON.stringify(s.world))return;`
    + `var c=s.camera,p=v.camera;if(p.targetX!==c.targetX||p.targetZ!==c.targetZ||p.viewIndex!==c.viewIndex||p.viewSize!==c.viewSize)return;`
    + `if(typeof v.image!=="string"||v.image.indexOf("data:image/")!==0)return;`
    + `var k=100/c.viewSize,t=document.documentElement.style;t.setProperty("--resume-view",'url("'+v.image+'")');`
    + `t.setProperty("--resume-view-width",v.width*k+"dvh");t.setProperty("--resume-view-height",v.height*k+"dvh");`
    + `t.setProperty("--resume-view-x",v.offsetX*k+"dvh");t.setProperty("--resume-view-y",v.offsetY*k+"dvh");}catch(e){}})()`
}

/**
 * The picture is cut along the tile lattice into a disc of whole tiles: solid
 * near the focus, stepping down tile by tile to a faint rim, like the landing
 * church's ground. `radius` is in tiles from the tile under the focus.
 */
export function tileDiscAlpha(distance: number, radius: number): number {
  return distance > radius ? 0 : Math.min(1, (radius + .3 - distance) / 1.7)
}

/**
 * The largest tile disc, in tiles from its centre, whose ground and canopies
 * a picture of this screen-space extent holds. A tile of distance is a world
 * unit: a whole unit across the screen, a third of one up it.
 */
export function tileDiscRadius(width: number, height: number): number {
  return Math.max(1, Math.min((width - 2 * CROWN_OVERHANG) / 2, (height - CANOPY_ALLOWANCE) / (2 * TILE_RISE)) - .5)
}

/**
 * The crop to take for a frustum of this size at this texel density: the disc
 * that fits, its canopy room, and how far above the display centre that puts
 * the crop's middle. All in screen-space world units.
 */
export function viewSnapshotExtent(frustumWidth: number, frustumHeight: number, density: number): { halfWidth: number; halfHeight: number; up: number; radius: number } {
  const radius = tileDiscRadius(Math.min(frustumWidth, VIEW_SNAPSHOT_MAX_TEXELS[0] / density), Math.min(frustumHeight, VIEW_SNAPSHOT_MAX_TEXELS[1] / density))
  const width = (radius + .5) * 2 + 2 * CROWN_OVERHANG
  const height = (radius + .5) * 2 * TILE_RISE + CANOPY_ALLOWANCE
  return { halfWidth: width / 2, halfHeight: height / 2, up: CANOPY_ALLOWANCE / 2 - NEAR_SHIFT * TILE_RISE, radius }
}

/**
 * Where the tile under the camera focus sits relative to that focus, projected
 * onto the screen in frustum units. The overlay's decorative grid is authored
 * around a tile centre; sliding it by this keeps its lattice on the real
 * tiles, whose focus need not be a tile centre.
 */
export function focusGridShift(size: number, camera: CameraSave): { x: number; y: number } {
  const half = size / 2
  const tileX = Math.floor(camera.targetX + half), tileZ = Math.floor(camera.targetZ + half)
  return projectGround(tileX - half + .5 - camera.targetX, tileZ - half + .5 - camera.targetZ, 0, yawForView(camera.viewIndex))
}
