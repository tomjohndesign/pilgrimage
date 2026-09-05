"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { CHARACTER_ASSETS, type CharacterAsset } from "./character-assets"
import type { TravelerTypeId } from "./travelers"

export type AssetTable = Record<TravelerTypeId, CharacterAsset>
const safePath = (value: unknown, ext: string) => typeof value === "string" &&
  value.startsWith("/") && !value.startsWith("//") && !value.includes("..") &&
  !/[?#\\]/.test(value) && value.endsWith(ext)

/** Validate both uploaded settings and persisted browser data before use. */
export function validateCharacterAssets(input: unknown): AssetTable {
  const value = input as AssetTable
  if (!value || typeof value !== "object") throw new Error("Expected a character settings object.")
  const output = {} as AssetTable
  for (const id of Object.keys(CHARACTER_ASSETS) as TravelerTypeId[]) {
    const asset = value[id]
    if (!asset || !safePath(asset.sheet, ".png") || !safePath(asset.sound, ".wav") ||
      typeof asset.soundLabel !== "string" || asset.soundLabel.length > 100 ||
      !Number.isFinite(asset.fps) || asset.fps < 1 || asset.fps > 16 ||
      !Number.isFinite(asset.scale) || asset.scale < 0.3 || asset.scale > 1.5 ||
      !Number.isFinite(asset.volume) || asset.volume < 0 || asset.volume > 1) {
      throw new Error(`Invalid settings for ${id}. Use local PNG/WAV paths and the playground's slider ranges.`)
    }
    output[id] = { sheet: asset.sheet, sound: asset.sound, soundLabel: asset.soundLabel,
      fps: asset.fps, scale: asset.scale, volume: asset.volume }
  }
  return output
}

interface AssetState {
  assets: AssetTable
  muted: boolean
  patch: (id: TravelerTypeId, patch: Partial<CharacterAsset>) => void
  replace: (assets: unknown) => void
  reset: (id: TravelerTypeId) => void
  setMuted: (muted: boolean) => void
}

export const useCharacterAssetStore = create<AssetState>()(persist((set) => ({
  assets: CHARACTER_ASSETS,
  muted: false,
  patch: (id, patch) => set((s) => ({ assets: validateCharacterAssets({ ...s.assets, [id]: { ...s.assets[id], ...patch } }) })),
  replace: (assets) => set({ assets: validateCharacterAssets(assets) }),
  reset: (id) => set((s) => ({ assets: { ...s.assets, [id]: CHARACTER_ASSETS[id] } })),
  setMuted: (muted) => set({ muted }),
}), {
  name: "pilgrimage-character-assets-v1",
  partialize: (s) => ({ assets: s.assets, muted: s.muted }),
  merge: (persisted, current) => {
    try {
      const saved = persisted as { assets: unknown; muted: boolean }
      return { ...current, assets: validateCharacterAssets(saved.assets), muted: saved.muted === true }
    } catch { return current }
  },
}))
