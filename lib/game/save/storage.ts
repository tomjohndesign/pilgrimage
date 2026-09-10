import { parseDisplaySettings, parseGameSave, type GameSave } from "./schema"
import type { DisplaySettings } from "./settings"

/**
 * Browser storage for the game save and the display preferences. One save
 * slot per origin for now: it is overwritten by the autosave of whichever
 * world is being played. Accounts will add named slots on top of the same
 * document.
 */
export const GAME_SAVE_KEY = "pilgrimage.game.v1"
export const DISPLAY_SETTINGS_KEY = "pilgrimage.display.v1"
/**
 * A cookie carries the saved world's seed and the zoom it was left at, since
 * the server cannot read localStorage. It lets the play page render straight
 * into the resume loading state at the right scale, and the landing page
 * offer "Continue", before the browser's save is read. Nothing else about the
 * game is in it.
 */
export const RESUME_COOKIE = "pilgrimage.resume"

function markResumable(save: GameSave | null): void {
  try {
    if (typeof document === "undefined") return
    const value = save === null ? "" : `${save.world.seed >>> 0}:${save.camera.viewSize}`
    document.cookie = `${RESUME_COOKIE}=${value}; path=/; max-age=${save === null ? 0 : 60 * 60 * 24 * 365}; SameSite=Lax`
  } catch {
    /* Cookies blocked: the game still resumes once the save is read. */
  }
}

/** What the cookie names (`seed` or `seed:viewSize`), or null when there is no usable cookie. */
export function parseResumeCookie(value: string | undefined): { seed: number; viewSize: number | null } | null {
  const match = value === undefined ? null : /^(\d+)(?::(\d+(?:\.\d+)?))?$/.exec(value)
  if (!match) return null
  const seed = Number(match[1])
  if (!Number.isSafeInteger(seed)) return null
  const viewSize = match[2] === undefined ? NaN : Number(match[2])
  return { seed: seed >>> 0, viewSize: Number.isFinite(viewSize) && viewSize > 0 ? viewSize : null }
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

/** Null when nothing is saved, storage is blocked, or the document is unreadable. */
export function loadGameSave(): { save: GameSave | null; error: string | null } {
  const store = storage()
  if (!store) return { save: null, error: null }
  let raw: string | null
  try {
    raw = store.getItem(GAME_SAVE_KEY)
  } catch {
    return { save: null, error: null }
  }
  if (raw === null) return { save: null, error: null }
  try {
    return parseGameSave(JSON.parse(raw))
  } catch {
    return { save: null, error: "Saved game could not be read." }
  }
}

/** False when the browser refused the write, typically for lack of space. */
export function storeGameSave(save: GameSave): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(GAME_SAVE_KEY, JSON.stringify(save))
    markResumable(save)
    return true
  } catch {
    return false
  }
}

export function clearGameSave(): void {
  try {
    storage()?.removeItem(GAME_SAVE_KEY)
  } catch {
    /* Nothing to clear when storage is unavailable. */
  }
  markResumable(null)
}

export function loadDisplaySettings(): Partial<DisplaySettings> {
  const store = storage()
  if (!store) return {}
  try {
    const raw = store.getItem(DISPLAY_SETTINGS_KEY)
    return raw === null ? {} : parseDisplaySettings(JSON.parse(raw))
  } catch {
    return {}
  }
}

export function storeDisplaySettings(settings: DisplaySettings): boolean {
  const store = storage()
  if (!store) return false
  try {
    store.setItem(DISPLAY_SETTINGS_KEY, JSON.stringify(settings))
    return true
  } catch {
    return false
  }
}
