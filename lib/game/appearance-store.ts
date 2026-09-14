import { create } from "zustand"
import { defaultAppearance, parseAppearance, type Appearance } from "./appearance"

const STORAGE_KEY = "pilgrimage:appearance:v1"
interface AppearanceState {
  value: Appearance
  hydrated: boolean
  storageError: string
  hydrate: () => void
  update: (value: Appearance) => void
}
export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  value: defaultAppearance(), hydrated: false, storageError: "",
  hydrate: () => {
    if (get().hydrated) return
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      set({ value: raw ? parseAppearance(raw) : defaultAppearance(), hydrated: true })
    } catch { set({ hydrated: true, storageError: "Saved appearance could not be loaded. You can import a JSON file or start fresh." }) }
  },
  update: value => {
    set({ value, storageError: "" })
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(value)) }
    catch { set({ storageError: "Browser storage is unavailable. Export JSON to keep your edits." }) }
  },
}))
export const APPEARANCE_ENABLED = process.env.NODE_ENV === "development" && process.env.NEXT_PUBLIC_PROPERTY_PANELS === "1"
