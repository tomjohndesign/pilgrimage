import { GREY_HAIR_COLOR, OLDER_TRAVELER_TYPES } from "../character-age"
import { TRAVELER_TYPES, type TravelerTypeId } from "../travelers"
import { bakeBasePerson } from "./bake"
import { ACTION_CLIPS, BASE_PERSON, PERSON_CLIPS, WALK_CLIP_STRIDES } from "./pose"
import { DEFAULT_DESIGN, personRecipe, type PersonDesign } from "./design"
import { POPULATION_PROFILES, populationDesign, type PopulationPack } from "./population"
import { SPRITE_DEPTH_ENCODING } from "../render/bake-depth"

/** Runs once per edited foundation, never once per traveler or frame. */
export async function bakePopulation(base: PersonDesign = DEFAULT_DESIGN,
  progress: (done: number) => void = () => {}, cancelled: () => boolean = () => false, only?: TravelerTypeId): Promise<PopulationPack> {
  const types = [...Object.values(TRAVELER_TYPES).map(type => ({ id: type.id, grey: false })),
    ...OLDER_TRAVELER_TYPES.map(id => ({ id, grey: true }))]
  return bakeOutfits(only ? types.filter(type => type.id === only) : types, (id, variant, grey) => populationDesign(TRAVELER_TYPES[id], variant,
    grey ? { ...base, hairColor: GREY_HAIR_COLOR } : base), base, progress, cancelled)
}

/** The same rig, color/depth bakes and atlas layout serve roads and settlement jobs. */
export async function bakeOutfits<Calling extends string>(types: { id: Calling; grey: boolean }[],
  designFor: (id: Calling, variant: number, grey: boolean) => PersonDesign,
  base: PersonDesign = DEFAULT_DESIGN, progress: (done: number) => void = () => {},
  cancelled: () => boolean = () => false): Promise<PopulationPack<Calling>> {
  const size = BASE_PERSON.cellSize, count = POPULATION_PROFILES.length
  const canvas = (columns: number) => {
    const result = document.createElement("canvas")
    result.width = columns * size; result.height = count * 8 * size
    return result
  }
  const shadowWalk = canvas(PERSON_CLIPS.walk.frames), shadowIdle = canvas(1)
  const shadowActions = Object.fromEntries(ACTION_CLIPS.map(clip => [clip, canvas(PERSON_CLIPS[clip].frames)]))
  const draw = async (target: HTMLCanvasElement, url: string, variant: number) => {
    const image = new Image(); image.src = url; await image.decode()
    target.getContext("2d")!.drawImage(image, 0, variant * 8 * size)
  }
  const callings = {} as PopulationPack<Calling>["callings"]
  const greyCallings: PopulationPack<Calling>["greyCallings"] = {}
  const strideRatios: number[] = []
  const referenceStride = personRecipe(base).body.stride
  for (const [typeIndex, { id, grey }] of types.entries()) {
    const walk = canvas(PERSON_CLIPS.walk.frames), idle = canvas(1)
    const actions = Object.fromEntries(ACTION_CLIPS.map(clip => [clip, canvas(PERSON_CLIPS[clip].frames)]))
    const depths = Object.fromEntries(Object.entries(PERSON_CLIPS).map(([clip, { frames }]) => [clip, canvas(frames)]))
    const designs: PersonDesign[] = []
    for (let variant = 0; variant < count; variant++) {
      // Let the map keep drawing and allow a newer edit to cancel this pack.
      await new Promise(resolve => setTimeout(resolve, 0))
      if (cancelled()) throw new DOMException("Superseded character design", "AbortError")
      const design = designFor(id, variant, grey)
      let bake
      try { bake = bakeBasePerson(design, false) }
      catch (error) { throw new Error(`${id}, profile ${variant + 1}: ${error instanceof Error ? error.message : error}`) }
      designs.push(design)
      await draw(walk, bake.walk, variant); await draw(idle, bake.idle, variant)
      await draw(depths.walk, bake.depthWalk, variant); await draw(depths.idle, bake.depthIdle, variant)
      for (const clip of ACTION_CLIPS) await draw(actions[clip], bake.actions[clip].url, variant)
      for (const clip of ACTION_CLIPS) await draw(depths[clip], bake.actions[clip].depth, variant)
      if (typeIndex === 0) {
        for (const clip of ACTION_CLIPS) await draw(shadowActions[clip], bake.actions[clip].shadow, variant)
        await draw(shadowWalk, bake.shadowWalk, variant); await draw(shadowIdle, bake.shadowIdle, variant)
        strideRatios.push(personRecipe(design).body.stride / referenceStride)
      }
      progress((typeIndex * count + variant + 1) / (types.length * count))
    }
    const destination = grey ? greyCallings : callings
    destination[id] = { walk: walk.toDataURL("image/png"), idle: idle.toDataURL("image/png"), actions: Object.fromEntries(ACTION_CLIPS.map(clip => [clip, actions[clip].toDataURL("image/png")])) as NonNullable<PopulationPack<Calling>["callings"][Calling]["actions"]>, designs }
    destination[id]!.depths = Object.fromEntries(Object.entries(depths).map(([clip, canvas]) => [clip, canvas.toDataURL("image/png")])) as NonNullable<PopulationPack<Calling>["callings"][Calling]["depths"]>
  }
  return { reservedTones: true, depthEncoding: SPRITE_DEPTH_ENCODING, walkStrides: WALK_CLIP_STRIDES, frameCounts: Object.fromEntries(Object.entries(PERSON_CLIPS).map(([clip, definition]) => [clip, definition.frames])), templateVersion: BASE_PERSON.version, cellSize: size, anchor: BASE_PERSON.anchor,
    rows: count * 8, callings, greyCallings, shadows: { walk: shadowWalk.toDataURL("image/png"), idle: shadowIdle.toDataURL("image/png"), actions: Object.fromEntries(ACTION_CLIPS.map(clip => [clip, shadowActions[clip].toDataURL("image/png")])) as NonNullable<PopulationPack<Calling>["shadows"]["actions"]> }, strideRatios }
}
