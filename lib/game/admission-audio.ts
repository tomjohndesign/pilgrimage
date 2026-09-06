"use client"

import { CHARACTER_ASSETS } from "./character-assets"
import { useCharacterAssetStore } from "./character-asset-store"

/** The existing merchant coin-purse recording, unlocked by a game gesture. */
export function createAdmissionAudio() {
  let context: AudioContext | undefined
  let buffer: AudioBuffer | undefined
  let loading: Promise<void> | undefined
  let disposed = false
  const active = new Set<AudioBufferSourceNode>()
  const stop = () => { for (const source of active) source.stop(); active.clear() }
  const unsubscribe = useCharacterAssetStore.subscribe(state => { if (state.muted) stop() })
  return {
    unlock() {
      if (disposed || typeof AudioContext === "undefined") return
      context ??= new AudioContext()
      void context.resume().catch(() => {})
      const audio = context
      loading ??= fetch(CHARACTER_ASSETS.merchant.sound)
        .then(response => { if (!response.ok) throw new Error("Coin audio unavailable"); return response.arrayBuffer() })
        .then(data => audio.decodeAudioData(data))
        .then(decoded => { if (!disposed) buffer = decoded })
        .catch(() => { loading = undefined })
    },
    play(): boolean {
      if (disposed || useCharacterAssetStore.getState().muted || context?.state !== "running" || !buffer || active.size >= 4) return false
      const source = context.createBufferSource(), gain = context.createGain()
      source.buffer = buffer
      gain.gain.value = 0.4
      source.connect(gain).connect(context.destination)
      active.add(source)
      source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect() }
      source.start()
      return true
    },
    dispose() {
      disposed = true
      unsubscribe()
      stop()
      if (context) void context.close().catch(() => {})
    },
  }
}
