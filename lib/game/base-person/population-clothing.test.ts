import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { generateTravelers, TRAVELER_TYPES } from "../travelers"
import { withTravelParties } from "../travel-parties"
import { HANDLER_FRAME, handlerVisual } from "../transport/handler-assets"
import { PASSENGER_CALLINGS, passengerColumn, passengerUrl } from "../transport/party-assets"
import { CART } from "../transport/assets"
import { DEFAULT_POPULATION, populationVisual } from "./population-assets"
import { populationDesign, POPULATION_PROFILES, travelerAppearance } from "./population"
import { shade } from "./design"

/** Inspect the shipped texels as well as the metadata: updating a design alone
 * must not leave people wearing their previous outfit in one of the atlases. */
async function imageColors(url: string) {
  const { data, info } = await sharp(`public${url}`).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  return (left: number, top: number, width: number, height: number) => {
    const colors = new Set<string>()
    for (let y = top; y < top + height; y++) for (let x = left; x < left + width; x++) {
      const at = (y * info.width + x) * 4
      if (data[at + 3] === 255) colors.add(`#${data.subarray(at, at + 3).toString("hex")}`)
    }
    return colors
  }
}

describe("individual travel clothing", () => {
  it("gives each calling six outfits and keeps colors stable when the crowd grows or reorders", () => {
    for (const calling of PASSENGER_CALLINGS) {
      expect(new Set(POPULATION_PROFILES.map((_, variant) => populationDesign(TRAVELER_TYPES[calling], variant).tunicColor)).size).toBe(6)
    }
    const seed = 12345, people = generateTravelers(seed, 300)
    const outfit = (person: typeof people[number]) => populationVisual(person.type.id, travelerAppearance(seed, person.id).variant, null).design.tunicColor
    const grouped = withTravelParties(people, seed)
    expect(grouped.map(outfit)).toEqual(people.map(outfit))
    expect(withTravelParties([...people].reverse(), seed).reverse().map(outfit)).toEqual(people.map(outfit))
    expect(withTravelParties(generateTravelers(seed, 500), seed).slice(0, people.length).map(outfit)).toEqual(people.map(outfit))
    const companies = new Map<number, typeof people>()
    for (const person of grouped) if (person.party) companies.set(person.party.id, [...companies.get(person.party.id) ?? [], person])
    const large = [...companies.values()].filter(members => members.length >= 6)
    expect(large.length).toBeGreaterThan(5)
    for (const members of large) expect(new Set(members.map(outfit)).size).toBeGreaterThan(1)
  })

  it("bakes the same individual dyes into walking, weary, idle, handler and passenger artwork", async () => {
    const passengers = await Promise.all(Array.from({ length: 6 }, (_, seat) => imageColors(passengerUrl(seat))))
    for (const calling of PASSENGER_CALLINGS) {
      const normal = populationVisual(calling, 0, null), handler = handlerVisual(calling, 0)
      const clips = [normal.walk, normal.idle, normal.actions.wearyWalk!].map(clip => ({ clip, size: DEFAULT_POPULATION.cellSize }))
        .concat([handler.walk, handler.idle].map(clip => ({ clip, size: HANDLER_FRAME.cellSize })))
      const sheets = await Promise.all(clips.map(({ clip }) => imageColors(clip.url)))
      for (let variant = 0; variant < 6; variant++) {
        const design = populationVisual(calling, variant, null).design
        expect(handlerVisual(calling, variant).design.tunicColor).toBe(design.tunicColor)
        const dyes = [.55, .8, 1, 1.3].map(factor => shade(design.tunicColor, factor))
        const containsDye = (colors: Set<string>) => expect(dyes.some(color => colors.has(color)), `${calling}, profile ${variant}`).toBe(true)
        for (const [i, { clip, size }] of clips.entries()) containsDye(sheets[i](0, variant * 8 * size, clip.columns * size, 8 * size))
        for (const sheet of passengers) containsDye(sheet(passengerColumn(calling, variant) * CART.cellSize, 0, CART.cellSize, CART.directions * CART.cellSize))
      }
    }
  }, 30_000)
})
