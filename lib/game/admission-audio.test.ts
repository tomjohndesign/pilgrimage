import { afterEach, describe, expect, it, vi } from "vitest"
import { createAdmissionAudio } from "./admission-audio"

const sound = vi.hoisted(() => ({ muted: false, listener: undefined as undefined | ((state: { muted: boolean }) => void) }))
vi.mock("./character-asset-store", () => ({ useCharacterAssetStore: {
  getState: () => sound,
  subscribe: (listener: typeof sound.listener) => { sound.listener = listener; return () => { sound.listener = undefined } },
} }))

afterEach(() => { vi.unstubAllGlobals(); sound.muted = false; sound.listener = undefined })

describe("admission clinks", () => {
  it("unlocks once, plays the new ElevenLabs coin sound, respects mute and releases audio on cleanup", async () => {
    const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = []
    const gains: Array<{value:number}> = []
    const context = {
      state: "suspended", destination: {},
      resume: vi.fn(async () => { context.state = "running" }),
      decodeAudioData: vi.fn(async () => ({})), close: vi.fn(async () => {}),
      createGain: () => { const gain={value:0};gains.push(gain);return { gain, connect: vi.fn(), disconnect: vi.fn() } },
      createBufferSource: () => {
        const source = { start: vi.fn(), stop: vi.fn(), connect: (gain: unknown) => gain, disconnect: vi.fn() }
        sources.push(source)
        return source
      },
    }
    vi.stubGlobal("AudioContext", class { constructor() { return context } })
    const fetchAudio = vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
    vi.stubGlobal("fetch", fetchAudio)
    const audio = createAdmissionAudio()
    expect(audio.play(true)).toBe(false)
    audio.unlock()
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce())
    audio.unlock()
    expect(fetchAudio).toHaveBeenCalledExactlyOnceWith("/sounds/elevenlabs/v1/coin-purse-1.wav")
    expect(audio.play(false)).toBe(false)
    expect(audio.play(true)).toBe(true)
    expect(gains[0].value).toBe(.12)
    expect(audio.play(true)).toBe(false)
    expect(sources[0].start).toHaveBeenCalledOnce()
    sound.muted = true
    sound.listener?.(sound)
    expect(sources[0].stop).toHaveBeenCalledOnce()
    expect(audio.play(true)).toBe(false)
    sound.muted = false
    expect(audio.play(true)).toBe(true)
    audio.setVisible(false)
    expect(sources[1].stop).toHaveBeenCalledOnce()
    audio.dispose()
    expect(sources[1].stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
    expect(sound.listener).toBeUndefined()
    expect(audio.play(true)).toBe(false)
  })
})
