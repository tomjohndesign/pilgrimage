import { isBird, type WildlifeKind } from "./species"
import type { WildlifeAnimal } from "./simulation"
import type { WildlifeGait } from "./gait"

export function chooseGait(kind: WildlifeKind, frightened: boolean, random: number): WildlifeGait {
  if (kind === "rabbit") return "hop"
  if (kind === "sheep" || kind === "goat") return "walk"
  if (kind === "boar") return frightened ? "trot" : "walk"
  if (kind === "fox") return frightened ? "gallop" : random < 0.7 ? "trot" : "canter"
  if (kind === "deer" || kind === "buck") return frightened ? random < 0.15 ? "leap" : "gallop" : random < 0.78 ? "walk" : random < 0.96 ? "canter" : "leap"
  return "walk"
}
export function restDuration(kind: WildlifeKind, random: number) {
  return kind === "goat" ? 35 + random * 50 : kind === "sheep" ? 15 + random * 24 : kind === "fox" ? 12 + random * 24 : 12 + random * 26
}
export function activityLabel(animal: WildlifeAnimal) {
  if (animal.burrowState === "inside") return "In burrow"
  if (animal.burrowState === "entering" || animal.burrowState === "returning") return "Returning to burrow"
  if (animal.burrowState === "emerging") return "Leaving burrow"
  if (animal.flight) return "Flying"
  if (isBird(animal.kind)) return animal.concealed ? "In tree cover" : "Perched"
  if (animal.lying > 0.1) return animal.rest < 1.5 ? "Getting up" : "Lying down"
  if (animal.moving) return ({ walk: "Walking", trot: "Trotting", canter: "Loping", gallop: "Running", hop: "Hopping", leap: "Leaping" })[animal.gait]
  return animal.grazing > 0.5 ? animal.kind === "boar" ? "Rooting" : "Grazing" : "Resting"
}
