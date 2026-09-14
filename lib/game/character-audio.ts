"use client"

import { useCharacterSoundStore } from "./character-sound-store"
import { audioQA, setDialogueActive, stopSceneAudio } from "./scene-audio"
import { create } from "zustand"
import { useCharacterAssetStore } from "./character-asset-store"
import { characterBark, VOICE_AUDITIONS } from "./sound-catalog"
import { nextStreak, type BarkHistory, type BodyType } from "./voice-lines"
import { useVoiceSubtitleStore } from "./voice-subtitle-store"
import type { TravelerTypeId } from "./travelers"

let current: HTMLAudioElement | undefined
let history: BarkHistory | undefined
let historyVoice = ""
let request = 0
let volumeCharacter: TravelerTypeId | undefined
let volumeProfile: string | undefined
const clips = new Map<string, HTMLAudioElement>()

export const useSoundPlaybackStore = create<{ url: string | null; status: "idle" | "loading" | "playing" | "error"; stopCount: number }>(() => ({ url: null, status: "idle", stopCount: 0 }))

function clipFor(url: string): HTMLAudioElement {
  const cached = clips.get(url)
  if (cached) return cached
  const audio = new Audio(url)
  audio.preload = "auto"
  audio.load()
  clips.set(url, audio)
  return audio
}

type ClipResult = "played" | "blocked" | "unavailable" | "cancelled"

/** Every asynchronous result belongs to its selection; old failures cannot start a fallback. */
async function playClip(url: string, volume: number, playbackRate: number, token: number, loop = false): Promise<ClipResult> {
  if (typeof Audio === "undefined") return "unavailable"
  const audio = clipFor(url)
  current = audio
  audio.currentTime = 0
  audio.volume = volume
  audio.playbackRate = playbackRate
  audio.preservesPitch = true
  audio.loop = loop
  useSoundPlaybackStore.setState({ url, status: "loading" })
  audio.onended = () => {
    if (token !== request) return
    useSoundPlaybackStore.setState({ url: null, status: "idle" })
    useVoiceSubtitleStore.getState().clear()
    setDialogueActive(false)
  }
  try {
    await audio.play()
    if (token !== request) return "cancelled"
    setDialogueActive(true)
    useSoundPlaybackStore.setState({ url, status: "playing" })
    return "played"
  } catch (error) {
    if (token !== request) return "cancelled"
    useSoundPlaybackStore.setState({ url, status: "error" })
    return (error as DOMException)?.name === "NotAllowedError" ? "blocked" : "unavailable"
  }
}

/** Preload the recorded selection clips; legacy voices are fetched only when selected. */
export function warmCharacterVoices(): void {
  if (typeof Audio === "undefined") return
  for (const sound of VOICE_AUDITIONS.filter(sound => sound.response === "greeting")) clipFor(sound.url)
}

export async function playCharacterSound(type: TravelerTypeId, travelerId = 0, bodyType: BodyType = "Male", profile = type as string, options: {voiceVariant?:number} = {}): Promise<boolean> {
  const { assets, muted } = useCharacterAssetStore.getState()
  if (muted || typeof Audio === "undefined") return false
  const { mixer, profiles } = useCharacterSoundStore.getState().document
  const slot = profiles[profile]?.selection
  if (!slot?.enabled || (mixer.solo !== "none" && mixer.solo !== "selection")) return false
  current?.pause()
  setDialogueActive(false)
  const token = ++request
  useVoiceSubtitleStore.getState().clear()
  const now = Date.now(), identity = `${profile}/${bodyType}/${options.voiceVariant ?? Math.floor(travelerId / 2)}`
  const streak = nextStreak(historyVoice === identity ? history : undefined, travelerId, now)
  // Update on the gesture, so rapid repeated clicks advance even during loading.
  history = { travelerId, at: now, streak }
  historyVoice = identity
  const bark = characterBark(type, bodyType, travelerId, streak, undefined, profile, slot.clips, options.voiceVariant ?? Math.floor(travelerId / 2))
  const asset = assets[type]
  volumeCharacter = type
  volumeProfile = profile
  const volume = asset.volume * slot.volume * mixer.master * mixer.selection
  const result = await playClip(bark.url, volume, slot.rate, token)
  audioQA(profile, "selection", bark.id, result, volume)
  if (token !== request) return false
  if (result === "played") {
    useVoiceSubtitleStore.getState().show(bark.line, bark.tongue, travelerId)
    return true
  }
  if (result !== "unavailable") return false
  history = undefined
  return await playClip(asset.sound, volume, slot.rate, token) === "played"
}

/** Exact clip audition shares the game's mute, cancellation, and playback status. */
export async function playSoundPreview(url: string, volume: number, loop = false, character?: TravelerTypeId): Promise<boolean> {
  stopCharacterSound()
  if (useCharacterAssetStore.getState().muted || typeof Audio === "undefined") return false
  volumeCharacter = character
  return await playClip(url, volume, character ? useCharacterSoundStore.getState().document.profiles[character].selection.rate : 1, request, loop) === "played"
}

export function setSoundPreviewVolume(volume: number) {
  if (current) current.volume = Math.max(0, Math.min(1, volume))
}

export function stopAllSounds() {
  stopSceneAudio()
  stopCharacterSound()
  useSoundPlaybackStore.setState(state => ({ stopCount: state.stopCount + 1 }))
}

export function stopCharacterSound() {
  ++request
  current?.pause()
  current = undefined
  history = undefined
  historyVoice = ""
  volumeCharacter = undefined
  volumeProfile = undefined
  setDialogueActive(false)
  useSoundPlaybackStore.setState({ url: null, status: "idle" })
  useVoiceSubtitleStore.getState().clear()
}

// The same mute switch is used in the game and both playgrounds.
useCharacterAssetStore.subscribe((state, previous) => {
  if (state.muted && !previous.muted) stopCharacterSound()
  if (volumeCharacter && state.assets[volumeCharacter].volume !== previous.assets[volumeCharacter].volume) {
    refreshSelectionMix()
  }
})

function refreshSelectionMix() {
  if (!current || !volumeCharacter || !volumeProfile) return
  const {mixer, profiles} = useCharacterSoundStore.getState().document
  const slot = profiles[volumeProfile].selection
  if (!slot.enabled || (mixer.solo !== "none" && mixer.solo !== "selection")) { stopCharacterSound(); return }
  current.volume = useCharacterAssetStore.getState().assets[volumeCharacter].volume * slot.volume * mixer.master * mixer.selection
  current.playbackRate = slot.rate
}
useCharacterSoundStore.subscribe(refreshSelectionMix)
