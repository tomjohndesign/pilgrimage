import { PARTY_TRANSPORT_VERSION, CART, RIG_TO_WORLD, type Animal } from "./assets"
import type { TravelerTypeId } from "../travelers"
export type PassengerCart = "bench" | "rear"
export const PASSENGER_CALLINGS: TravelerTypeId[] = ["peasant","pilgrim","friar","merchant"]
/** Seats refer to the shared person's root; hip height remains poseDriver's .65.
 * Front occupants face forward; rear benches face into the open cart bed. */
export const PASSENGER_SEATS = [
  { x:-.32,y:.73,z:1.24,heading:0 }, { x:.32,y:.73,z:1.24,heading:0 },
  { x:-.42,y:.53,z:-.52,heading:Math.PI/2 }, { x:.42,y:.53,z:-.52,heading:-Math.PI/2 },
  { x:-.42,y:.53,z:.18,heading:Math.PI/2 }, { x:.42,y:.53,z:.18,heading:-Math.PI/2 },
] as const
export const PASSENGER_COLUMNS = PASSENGER_CALLINGS.length * 6
export function passengerColumn(calling: TravelerTypeId, variant: number) { return Math.max(0,PASSENGER_CALLINGS.indexOf(calling))*6+variant%6 }
export function passengerCartUrl(style:PassengerCart) { return `/textures/transport/${PARTY_TRANSPORT_VERSION}/cart-${style}.png` }
export function passengerUrl(seat:number) { return `/textures/transport/${PARTY_TRANSPORT_VERSION}/passenger-${seat}.png` }
export function seatPoint(seat:number,pose:{x:number;z:number;heading:number},scale:number) {
  const p=PASSENGER_SEATS[seat], unit=RIG_TO_WORLD*scale, sin=Math.sin(pose.heading),cos=Math.cos(pose.heading)
  return {x:pose.x+(p.x*cos+p.z*sin)*unit,z:pose.z+(-p.x*sin+p.z*cos)*unit}
}
export const PARTY_BAKE = { version:PARTY_TRANSPORT_VERSION, cellSize:CART.cellSize, seats:PASSENGER_SEATS, columns:PASSENGER_COLUMNS }
export type PackAnimal = Animal
