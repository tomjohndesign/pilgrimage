"use client"

import { Square, Volume2, VolumeX } from "lucide-react"
import { playCharacterSound, stopAllSounds } from "@/lib/game/character-audio"
import { useCharacterAssetStore } from "@/lib/game/character-asset-store"
import { CHARACTER_VOICES } from "@/lib/game/voice-lines"
import type { TravelerTypeId } from "@/lib/game/travelers"

/** Shared sound controls used by the character and sound playgrounds. */
export const SOUND_BUTTON = "inline-flex items-center justify-center gap-2 border border-rule px-3 py-2 text-xs text-ink transition hover:bg-parchment-dark focus-visible:outline-2 focus-visible:outline-gold disabled:opacity-40"

export function SoundTransport() {
  const muted = useCharacterAssetStore(s => s.muted)
  const setMuted = useCharacterAssetStore(s => s.setMuted)
  return <>
    <button className={SOUND_BUTTON} onClick={stopAllSounds}><Square size={13} /> Stop</button>
    <button className={SOUND_BUTTON} aria-label={muted ? "Unmute sounds" : "Mute sounds"} aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{muted ? "Unmute" : "Mute"}</button>
  </>
}

export function CharacterSoundControls({ type, transport = true }: { type: TravelerTypeId; transport?: boolean }) {
  const { assets, patch, muted } = useCharacterAssetStore()
  return <div>
    <p className="mt-1 text-xs leading-relaxed text-ink-light">Spoken in {CHARACTER_VOICES[type].tongue}. Select again to try the next response.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {CHARACTER_VOICES[type].bodyTypes.map(body => <button key={body} className={SOUND_BUTTON} disabled={muted} onClick={() => void playCharacterSound(type, 0, body)}><Volume2 size={14} />{body === "Male" ? "Select man" : "Select woman"}</button>)}
      {transport && <SoundTransport />}
    </div>
    <label className="mt-4 block text-sm">Character volume <span className="float-right font-mono text-xs">{Math.round(assets[type].volume * 100)}%</span><input className="mt-2 w-full accent-[#94742f]" type="range" min="0" max="1" step="0.01" value={assets[type].volume} onChange={event => patch(type, { volume: Number(event.target.value) })} /></label>
  </div>
}
