import { BASE_CHARACTER_SCALE, DEFAULT_WALK_CADENCE, personWalkStride } from "../base-person/gait"
import { populationDesign } from "../base-person/population"
import { TRAVELER_TYPES } from "../travelers"
import type { Activity } from "../sim"
import type { GameMap } from "../map/types"
import { merchantWalkSpeed, cartOffset, pullingDesign, SHOP_SECONDS, type HorseVariant, type Puller } from "./assets"
import { createPasture, stepPasture, type PastureAnimal } from "./pasture"

import { roadsideManeuver, routeLength, routePoint } from "./roadside"
import { keeperRoutine } from "./keeper"
import { STALL, stallPoint, stallObstacles, animalClearance } from "./stall"
import { alignCart, followCart, type CartPose } from "./follow"

export const MERCHANT_DEMO_MAP: GameMap = {
  width: 11, depth: 7, seed: 84, buildings: [],
  tiles: Array.from({ length: 77 }, (_, i) => Math.floor(i / 11) === 5 ? "path" : Math.floor(i / 11) === 0 && (i % 11 < 2 || i % 11 > 8) ? "forest" : "grass"),
  road: Array.from({ length: 11 }, (_, x) => ({ x, z: 5 })),
}
export const DEMO_STAGES = ["Arriving", "Opening", "Selling", "Closing", "Continuing"] as const
type MerchantStage = typeof DEMO_STAGES[number]
export type DemoStage = MerchantStage | "Approach" | "Turning" | "Exit" | "Backing"
export interface DemoPerson { x: number; z: number; heading: number; moving: boolean }
export interface MerchantDemoFrame {
  time: number; stage: DemoStage; activity: Activity; merchant: DemoPerson; customer: DemoPerson
  reversing?: boolean
  clearance?: boolean
  keeperTime: number; cartPose: CartPose; shopProgress: number; pasture?: PastureAnimal; sales: number
}
export interface MerchantDemo {
  map: GameMap; stages: readonly DemoStage[]; frames: MerchantDemoFrame[]; starts: Partial<Record<DemoStage, number>>; duration: number; step: number; turning: boolean
}
const STEP = 1 / 30
/** A repeatable, scrubbable staging of the complete journey, using the runtime
 * rig speeds, action durations and pasture solver. It never touches the live game.
 */
export function merchantDemo(puller: Puller, variant: HorseVariant = "common"): MerchantDemo & { starts: Record<MerchantStage, number> } {
  const wheelbase = -cartOffset(puller) * BASE_CHARACTER_SCALE
  const speed = merchantWalkSpeed(puller, BASE_CHARACTER_SCALE, personWalkStride(pullingDesign(0)) * BASE_CHARACTER_SCALE, variant)
  const maneuver = roadsideManeuver({ x: -4, z: 2 }, { x: 1, z: 0 }, 0, 1, wheelbase)
  const arrival = [{ x: -4.4, z: 2 }, ...maneuver.entry]
  const departure = [...maneuver.exit, { x: 5.3, z: 2 }]
  const park = maneuver.park
  let cartPose = alignCart(arrival[0], Math.PI / 2, wheelbase)
  const arrive = routeLength(arrival) / speed
  const customerSpeed = personWalkStride(populationDesign(TRAVELER_TYPES.peasant, 3)) * BASE_CHARACTER_SCALE * DEFAULT_WALK_CADENCE
  const parkedAxle = { x: park.x - wheelbase, z: park.z }
  const frontage = stallPoint(parkedAxle, maneuver.heading, 1, BASE_CHARACTER_SCALE, STALL.customer)
  const customerArrival = [{ x: -2, z: 2 }, { x: frontage.x, z: 2 }, frontage]
  const customerExit = [frontage, { x: frontage.x, z: 2 }, { x: 3, z: 2 }]
  const approachSeconds = routeLength(customerArrival) / customerSpeed, sellSeconds = Math.max(26, approachSeconds + 5 + routeLength(customerExit) / customerSpeed)
  const frames: MerchantDemoFrame[] = [], starts = {} as Record<MerchantStage, number>
  const pasture = puller === "hand" ? undefined : createPasture(park, stallObstacles(parkedAxle, maneuver.heading, 1, BASE_CHARACTER_SCALE), animalClearance(puller, BASE_CHARACTER_SCALE), maneuver.heading)
  let stage: MerchantStage = "Arriving", elapsed = 0, time = 0
  while (time < 240) {
    starts[stage] ??= time
    let merchant: DemoPerson = { ...park, heading: maneuver.heading, moving: false }
    let progress = 0, sales = 0
    let customer: DemoPerson = { ...customerArrival[0], heading: Math.PI / 2, moving: false }
    if (stage === "Arriving") merchant = routePoint(arrival, elapsed * speed)
    if (stage === "Opening") progress = Math.min(1, elapsed / SHOP_SECONDS)
    if (stage === "Selling") {
      progress = 1
      customer = elapsed < approachSeconds ? routePoint(customerArrival, elapsed * customerSpeed)
        : elapsed < approachSeconds + 5 ? { ...frontage, heading: Math.PI, moving: false }
        : routePoint(customerExit, (elapsed - approachSeconds - 5) * customerSpeed)
      sales = elapsed >= approachSeconds + 3 ? 1 : 0
    }
    if (stage === "Closing" || stage === "Continuing") customer = { ...customerExit.at(-1)!, heading: Math.PI / 2, moving: false }
    if (stage === "Closing") { progress = Math.max(0, 1 - elapsed / SHOP_SECONDS); sales = 1 }
    if (stage === "Continuing") { merchant = routePoint(departure, elapsed * speed); sales = 1 }
    if (pasture && (stage === "Opening" || stage === "Selling" || stage === "Closing")) stepPasture(MERCHANT_DEMO_MAP, pasture, STEP, speed, stage === "Closing")
    if (stage === "Arriving" || stage === "Continuing") cartPose = followCart(cartPose, merchant, wheelbase)
    else cartPose = alignCart(park, maneuver.heading, wheelbase)
    frames.push({ keeperTime: stage === "Selling" ? elapsed : 0, cartPose: { ...cartPose, hitch: { ...cartPose.hitch } }, time, stage, activity: stage === "Opening" ? "openingShop" : stage === "Selling" ? "vending" : stage === "Closing" ? "packingShop" : "walking", merchant, customer, shopProgress: progress, sales,
      pasture: pasture && stage !== "Arriving" && stage !== "Continuing" ? { ...pasture, home: { ...pasture.home }, route: pasture.route.map(p => ({ ...p })) } : undefined })
    let next: MerchantStage = stage
    if (stage === "Arriving" && elapsed >= arrive) next = "Opening"
    if (stage === "Opening" && elapsed >= SHOP_SECONDS) next = "Selling"
    if (stage === "Selling" && elapsed >= sellSeconds && keeperRoutine(elapsed, puller, BASE_CHARACTER_SCALE, personWalkStride(pullingDesign(0)) * BASE_CHARACTER_SCALE).atHome) next = "Closing"
    if (stage === "Closing" && elapsed >= SHOP_SECONDS && (!pasture || pasture.ready)) next = "Continuing"
    if (stage === "Continuing" && elapsed >= routeLength(departure) / speed + 1) break
    elapsed = next === stage ? elapsed + STEP : 0; stage = next; time += STEP
  }
  return { frames, starts, duration: time, step: STEP, map: MERCHANT_DEMO_MAP, stages: DEMO_STAGES, turning: false }
}
