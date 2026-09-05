"use client"

import { selectionPlaybackRate } from "./character-assets"
import { useCharacterAssetStore } from "./character-asset-store"
import type { TravelerTypeId } from "./travelers"

let current: HTMLAudioElement | undefined

/** Called directly from a selection gesture; no autoplay or audio context unlock. */
export async function playCharacterSound(type: TravelerTypeId, travelerId = 0): Promise<boolean> {
  const { assets, muted } = useCharacterAssetStore.getState()
  if (muted || typeof Audio === "undefined") return false
  current?.pause()
  const asset = assets[type]
  const audio = new Audio(asset.sound)
  current = audio
  audio.volume = asset.volume
  audio.playbackRate = selectionPlaybackRate(travelerId)
  audio.preservesPitch = false
  try { await audio.play(); return true } catch { return false }
}

export function stopCharacterSound() {
  current?.pause()
  current = undefined
}
