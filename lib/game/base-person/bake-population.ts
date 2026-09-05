import { TRAVELER_TYPES, type TravelerTypeId } from "../travelers"
import { bakeBasePerson } from "./bake"
import { BASE_PERSON } from "./pose"
import { DEFAULT_DESIGN, personRecipe, type PersonDesign } from "./design"
import { POPULATION_PROFILES, populationDesign, type PopulationPack } from "./population"

/** Runs once per edited foundation, never once per traveler or frame. */
export async function bakePopulation(base: PersonDesign = DEFAULT_DESIGN,
  progress: (done: number) => void = () => {}, cancelled: () => boolean = () => false): Promise<PopulationPack> {
  const size = BASE_PERSON.cellSize, count = POPULATION_PROFILES.length
  const canvas = (columns: number) => {
    const result = document.createElement("canvas")
    result.width = columns * size; result.height = count * 8 * size
    return result
  }
  const shadowWalk = canvas(8), shadowIdle = canvas(1)
  const draw = async (target: HTMLCanvasElement, url: string, variant: number) => {
    const image = new Image(); image.src = url; await image.decode()
    target.getContext("2d")!.drawImage(image, 0, variant * 8 * size)
  }
  const callings = {} as PopulationPack["callings"]
  const types = Object.values(TRAVELER_TYPES)
  const strideRatios: number[] = []
  const referenceStride = personRecipe(base).body.stride
  for (const [typeIndex, type] of types.entries()) {
    const walk = canvas(8), idle = canvas(1)
    const designs: PersonDesign[] = []
    for (let variant = 0; variant < count; variant++) {
      // Let the map keep drawing and allow a newer edit to cancel this pack.
      await new Promise(resolve => setTimeout(resolve, 0))
      if (cancelled()) throw new DOMException("Superseded character design", "AbortError")
      const design = populationDesign(type, variant, base)
      const bake = bakeBasePerson(design, false)
      designs.push(design)
      await draw(walk, bake.walk, variant); await draw(idle, bake.idle, variant)
      if (typeIndex === 0) {
        await draw(shadowWalk, bake.shadowWalk, variant); await draw(shadowIdle, bake.shadowIdle, variant)
        strideRatios.push(personRecipe(design).body.stride / referenceStride)
      }
      progress((typeIndex * count + variant + 1) / (types.length * count))
    }
    callings[type.id as TravelerTypeId] = { walk: walk.toDataURL("image/png"), idle: idle.toDataURL("image/png"), designs }
  }
  return { templateVersion: BASE_PERSON.version, cellSize: size, anchor: BASE_PERSON.anchor,
    rows: count * 8, callings, shadows: { walk: shadowWalk.toDataURL("image/png"), idle: shadowIdle.toDataURL("image/png") }, strideRatios }
}
