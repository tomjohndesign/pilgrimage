import { populationDesign } from "../base-person/population"
import { TRAVELER_TYPES } from "../travelers"

export const KNIGHT = { version: "v8", variants: 3, cellSize: 128, anchor: [64, 90] as const, frames: 20 } as const
/** c.1066 Anglo-Norman equipment: mail, nasal helmet, leather belt and scabbard.
 * Reference: https://www.bayeuxmuseum.com/en/the-bayeux-tapestry/discover-the-bayeux-tapestry/what-is-the-bayeux-tapestry-about/
 * Three body builds reuse the shared leg proportions and distance-driven gait.
 */
export function knightDesign(variant = 0) {
  return { ...populationDesign(TRAVELER_TYPES.knight, variant % KNIGHT.variants),
    hat: "None" as const, hairStyle: "Bald" as const, beard: false, satchel: false, walkingStick: false,
    tunicColor: "#777e80", shirtColor: "#777e80", trouserColor: "#514638", sleeves: 0.8, tunicLength: 1.4, hem: 0.9 }
}

/** An unarmoured attendant; equipment poses preserve the merchant's shared legs. */
export function squireDesign() {
  return { ...populationDesign(TRAVELER_TYPES.merchant, 0), hat: "None" as const,
    beard: false, satchel: true, walkingStick: false, armSwing: 0.7, elbowBend: 12 }
}
