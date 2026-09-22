"use client"

import { ChromeButton } from "@/components/ui/chrome-controls"
import { Tuner } from "./game/property-controls"
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
    <ChromeButton className={SOUND_BUTTON} onClick={stopAllSounds}><Square size={13} /> Stop</ChromeButton>
    <ChromeButton className={SOUND_BUTTON} aria-label={muted ? "Unmute sounds" : "Mute sounds"} aria-pressed={muted} onClick={() => setMuted(!muted)}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}{muted ? "Unmute" : "Mute"}</ChromeButton>
  </>
}

export function CharacterSoundControls({ type, transport = true }: { type: TravelerTypeId; transport?: boolean }) {
  const { assets, patch, muted } = useCharacterAssetStore()
  return <div>
    <p className="mt-1 text-xs leading-relaxed text-ink-light">Spoken in {CHARACTER_VOICES[type].tongue}. Select again to try the next response.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      {CHARACTER_VOICES[type].bodyTypes.map(body => <ChromeButton key={body} className={SOUND_BUTTON} disabled={muted} onClick={() => void playCharacterSound(type, 0, body)}><Volume2 size={14} />{body === "Male" ? "Select man" : "Select woman"}</ChromeButton>)}
      {transport && <SoundTransport />}
    </div>
    <Tuner label="Character volume" display={`${Math.round(assets[type].volume * 100)}%`} min={0} max={1} step={.01} value={assets[type].volume} onChange={volume => patch(type, { volume })} />
  </div>
}
