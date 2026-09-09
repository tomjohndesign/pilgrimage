import { populationDesign } from "../base-person/population"
import { DEFAULT_DESIGN } from "../base-person/design"
import { TRAVELER_TYPES, type TravelerTypeId } from "../travelers"

/** The same body, gait and clothing, with the shared planted walking staff.
 * The free hand's baked socket carries the lead as the arm swings. */
export function packHandlerDesign(calling: TravelerTypeId, variant: number) {
  return populationDesign(TRAVELER_TYPES[calling], variant, { ...DEFAULT_DESIGN, walkingStick: true })
}
