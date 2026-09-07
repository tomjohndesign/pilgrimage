import manifest from "../../../public/textures/characters/rockets/v11/manifest.json"
import { GREY_HAIR_AGE } from "../character-age"
import { monkVisual } from "../base-person/monk-assets"
import { ACTION_CLIPS } from "../base-person/pose"

function equippedVisual(age: number) {
  const base = monkVisual(age), hair = age >= GREY_HAIR_AGE ? "grey" : "brown"
  const clip = (name: string) => ({ url: `/textures/characters/rockets/v${manifest.version}/${hair}-${name}.png`,
    depth: `/textures/characters/rockets/v${manifest.version}/depth-${hair}-${name}.png`,
    columns: manifest.frameCounts[name as keyof typeof manifest.frameCounts], rows: manifest.directions.length, stillFrame: 0 })
  return {
    visual: { ...base, walk: { ...base.walk, ...clip("walk") }, idle: clip("idle"),
      actions: Object.fromEntries(ACTION_CLIPS.map(name => [name, { ...base.actions[name], ...clip(name) }])) },
    flight: { ...clip("flying"), fps: manifest.flightFps },
  }
}
const brown = equippedVisual(30), grey = equippedVisual(80)
export const rocketMonkVisual = (age: number) => (age >= GREY_HAIR_AGE ? grey : brown).visual
export const rocketFlightClip = (age: number) => (age >= GREY_HAIR_AGE ? grey : brown).flight
