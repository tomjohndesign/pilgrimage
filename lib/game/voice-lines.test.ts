import { describe, expect, it } from "vitest"
import { CHARACTER_VOICES, BARK_STREAK_MS, barkForStreak, barkUrl, nextStreak, voiceBodyType } from "./voice-lines"
import { CHARACTER_ASSETS } from "./character-assets"
import { travelerBodyType } from "./base-person/population"

describe("selection barks", () => {
  it("gives every traveler type lines in a period tongue", () => {
    for (const id of Object.keys(CHARACTER_ASSETS) as Array<keyof typeof CHARACTER_ASSETS>) {
      const voice = CHARACTER_VOICES[id]
      expect(voice, id).toBeDefined()
      expect(voice.select.length, id).toBeGreaterThanOrEqual(3)
      expect(voice.repeat.length, id).toBeGreaterThanOrEqual(1)
      expect(["Old English", "Church Latin"]).toContain(voice.tongue)
      expect(voice.bodyTypes.length, id).toBeGreaterThan(0)
      for (const line of [...voice.select, ...voice.repeat]) {
        expect(line.text.length, line.id).toBeGreaterThan(0)
        expect(line.gloss.length, line.id).toBeGreaterThan(0)
        expect(barkUrl(id, "Male", line)).toBe(`/sounds/voices/${id}/male/${line.id}-v1.wav`)
      }
    }
  })

  it("cycles neutral responses without entering the impatient bank", () => {
    const voice = CHARACTER_VOICES.peasant
    const spoken = [1, 2, 3, 4, 5].map(streak => barkForStreak(voice, 7, streak)!)
    expect(new Set(spoken.slice(0, 3).map(line => line.id)).size).toBe(3)
    for (const line of spoken.slice(0, 3)) expect(voice.select).toContain(line)
    for (const line of spoken.slice(3)) expect(voice.select).toContain(line)
    expect(spoken[3]).toBe(spoken[0])
  })

  it("starts different travelers on different lines", () => {
    const voice = CHARACTER_VOICES.pilgrim
    const openers = new Set([1, 2, 3, 4, 5, 6].map(id => barkForStreak(voice, id, 1)!.id))
    expect(openers.size).toBeGreaterThan(1)
  })

  it("continues a streak only for the same traveler inside the window", () => {
    expect(nextStreak(undefined, 4, 1000)).toBe(1)
    expect(nextStreak({ travelerId: 4, at: 1000, streak: 1 }, 4, 2000)).toBe(2)
    expect(nextStreak({ travelerId: 4, at: 1000, streak: 2 }, 9, 2000)).toBe(1)
    expect(nextStreak({ travelerId: 4, at: 1000, streak: 2 }, 4, 1000 + BARK_STREAK_MS + 1)).toBe(1)
  })

  it("answers with a voice of the speaker's own body type", () => {
    expect(voiceBodyType(CHARACTER_VOICES.peasant, "Female")).toBe("Female")
    expect(voiceBodyType(CHARACTER_VOICES.peasant, "Male")).toBe("Male")
    expect(barkUrl("knight", "Female", CHARACTER_VOICES.knight.select[0]))
      .toBe(`/sounds/voices/knight/female/${CHARACTER_VOICES.knight.select[0].id}-v1.wav`)
  })

  it("keeps callings bound to one sex on their own voice", () => {
    expect(CHARACTER_VOICES.friar.bodyTypes).toEqual(["Male"])
    expect(CHARACTER_VOICES.nun.bodyTypes).toEqual(["Female"])
    expect(voiceBodyType(CHARACTER_VOICES.friar, "Female")).toBe("Male")
    expect(voiceBodyType(CHARACTER_VOICES.nun, "Male")).toBe("Female")
  })

  it("takes the body type from the same draw the sprite and name use", () => {
    expect(travelerBodyType(12345, "friar", 3)).toBe("Male")
    expect(travelerBodyType(12345, "nun", 3)).toBe("Female")
    const drawn = [0, 1, 2, 3, 4, 5, 6, 7].map(id => travelerBodyType(12345, "peasant", id))
    expect(new Set(drawn).size).toBe(2)
  })
})
