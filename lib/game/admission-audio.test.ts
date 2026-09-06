import { afterEach, describe, expect, it, vi } from "vitest"
import { createAdmissionAudio } from "./admission-audio"

const sound = vi.hoisted(() => ({ muted: false, listener: undefined as undefined | ((state: { muted: boolean }) => void) }))
vi.mock("./character-asset-store", () => ({ useCharacterAssetStore: {
  getState: () => sound,
  subscribe: (listener: typeof sound.listener) => { sound.listener = listener; return () => { sound.listener = undefined } },
} }))

afterEach(() => { vi.unstubAllGlobals(); sound.muted = false; sound.listener = undefined })

describe("admission clinks", () => {
  it("unlocks once, plays the existing coin sound, respects mute and releases audio on cleanup", async () => {
    const sources: Array<{ start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> }> = []
    const context = {
      state: "suspended", destination: {},
      resume: vi.fn(async () => { context.state = "running" }),
      decodeAudioData: vi.fn(async () => ({})), close: vi.fn(async () => {}),
      createGain: () => ({ gain: { value: 0 }, connect: vi.fn(), disconnect: vi.fn() }),
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
    expect(audio.play()).toBe(false)
    audio.unlock()
    await vi.waitFor(() => expect(context.decodeAudioData).toHaveBeenCalledOnce())
    audio.unlock()
    expect(fetchAudio).toHaveBeenCalledExactlyOnceWith("/sounds/characters/merchant-select-v1.wav")
    expect(audio.play()).toBe(true)
    expect(sources[0].start).toHaveBeenCalledOnce()
    sound.muted = true
    sound.listener?.(sound)
    expect(sources[0].stop).toHaveBeenCalledOnce()
    expect(audio.play()).toBe(false)
    sound.muted = false
    expect(audio.play()).toBe(true)
    audio.dispose()
    expect(sources[1].stop).toHaveBeenCalledOnce()
    expect(context.close).toHaveBeenCalledOnce()
    expect(sound.listener).toBeUndefined()
    expect(audio.play()).toBe(false)
  })
})
