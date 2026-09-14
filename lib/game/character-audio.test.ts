import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const pending = new Map<string, () => Promise<void>>()
const instances: FakeAudio[] = []
class FakeAudio {
  currentTime = 0
  volume = 1
  playbackRate = 1
  preservesPitch = true
  loop = false
  preload = ""
  onended: (() => void) | null = null
  load = vi.fn()
  pause = vi.fn()
  play = vi.fn(() => pending.get(this.src)?.() ?? Promise.resolve())
  constructor(public src: string) { instances.push(this) }
}
let player: typeof import("./character-audio")
let assets: typeof import("./character-asset-store")
let subtitles: typeof import("./voice-subtitle-store")
const base = "/sounds/elevenlabs/v2/"

beforeEach(async () => {
  vi.resetModules()
  pending.clear(); instances.length = 0
  vi.stubGlobal("Audio", FakeAudio)
  player = await import("./character-audio")
  assets = await import("./character-asset-store")
  subtitles = await import("./voice-subtitle-store")
})
afterEach(() => { player.stopCharacterSound(); vi.unstubAllGlobals() })

describe("character and playground playback", () => {
  it("plays new greetings for every calling, job and supported body", async () => {
    const {CHARACTER_VOICES} = await import("./voice-lines")
    const {AUDIO_PROFILES} = await import("./character-sound-store")
    for (const profile of Object.keys(AUDIO_PROFILES)) {
      const type = (profile.startsWith("job/") ? "peasant" : profile) as keyof typeof CHARACTER_VOICES
      for (const body of CHARACTER_VOICES[type].bodyTypes) {
        expect(await player.playCharacterSound(type,0,body,profile)).toBe(true)
        expect(player.useSoundPlaybackStore.getState().url).toBe(`/sounds/elevenlabs/${type === "knight" ? "v9" : "v6"}/${profile.replaceAll("/","-")}-${body.toLowerCase()}-greeting-v6.wav`)
        expect(subtitles.useVoiceSubtitleStore.getState().line?.gloss).toBeTruthy()
      }
    }
  })

  it("cycles to the regenerated plain-Latin Deo gratias recording", async () => {
    await player.playCharacterSound("friar",0)
    await player.playCharacterSound("friar",0)
    expect(player.useSoundPlaybackStore.getState().url).toBe("/sounds/elevenlabs/v9/friar-2-daniel-gentle.wav")
    expect(subtitles.useVoiceSubtitleStore.getState().line?.text).toBe("Deo gratias.")
  })

  it("keeps greeting volume constant while zooming, including a newly selected voice", async () => {
    const {useCameraStore}=await import("./camera-store")
    useCameraStore.setState({viewSize:12})
    await player.playCharacterSound("peasant",0)
    const near=instances.at(-1)!.volume
    useCameraStore.setState({viewSize:120})
    expect(instances.at(-1)!.volume).toBeCloseTo(near)
    await player.playCharacterSound("peasant",0,"Male","peasant",{voiceVariant:0})
    expect(instances.at(-1)!.volume).toBeCloseTo(near)
    useCameraStore.setState({viewSize:8})
    expect(instances.at(-1)!.volume).toBeCloseTo(near)
  })

  it("ignores an old rejection after another selection, without playing a stale fallback", async () => {
    let reject!: (reason: unknown) => void
    pending.set(`/sounds/elevenlabs/v6/peasant-male-greeting-v6.wav`, () => new Promise((_, r) => { reject = r }))
    const old = player.playCharacterSound("peasant", 1, "Male")
    await player.playCharacterSound("nun", 2, "Female", "nun", {voiceVariant:0})
    reject(new DOMException("Interrupted", "AbortError"))
    expect(await old).toBe(false)
    expect(player.useSoundPlaybackStore.getState().url).toBe(`/sounds/elevenlabs/v6/nun-female-greeting-v6.wav`)
    expect(subtitles.useVoiceSubtitleStore.getState().travelerId).toBe(2)
    expect(instances).toHaveLength(2)
  })

  it("stopping during loading prevents the pending response from restoring its subtitle", async () => {
    let resolve!: () => void
    pending.set(`/sounds/elevenlabs/v6/peasant-male-greeting-v6.wav`, () => new Promise(r => { resolve = r }))
    const loading = player.playCharacterSound("peasant", 1)
    player.stopCharacterSound()
    resolve()
    expect(await loading).toBe(false)
    expect(player.useSoundPlaybackStore.getState().status).toBe("idle")
    expect(subtitles.useVoiceSubtitleStore.getState().line).toBeNull()
  })

  it("stops a looping preview on mute and updates volume while a clip plays", async () => {
    await player.playSoundPreview(`${base}forest-birds.wav`, 0.4, true)
    expect(instances[0].loop).toBe(true)
    player.setSoundPreviewVolume(0.2)
    expect(instances[0].volume).toBe(0.2)
    assets.useCharacterAssetStore.getState().setMuted(true)
    expect(instances[0].pause).toHaveBeenCalled()
    expect(player.useSoundPlaybackStore.getState().status).toBe("idle")
    expect(await player.playCharacterSound("peasant", 1)).toBe(false)
  })

  it("falls back when audio is missing, but respects a browser autoplay refusal", async () => {
    const voice = `/sounds/elevenlabs/v6/peasant-male-greeting-v6.wav`
    pending.set(voice, () => Promise.reject(new DOMException("Missing", "NotSupportedError")))
    expect(await player.playCharacterSound("peasant", 1)).toBe(true)
    expect(player.useSoundPlaybackStore.getState().url).toBe(assets.useCharacterAssetStore.getState().assets.peasant.sound)
    player.stopCharacterSound()
    pending.set(voice, () => Promise.reject(new DOMException("Blocked", "NotAllowedError")))
    expect(await player.playCharacterSound("peasant", 1)).toBe(false)
    expect(player.useSoundPlaybackStore.getState().status).toBe("error")
    expect(instances[1].play).toHaveBeenCalledTimes(1)
  })
})
