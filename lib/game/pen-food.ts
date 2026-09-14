import { BASE_CHARACTER_SCALE } from "./base-person/gait"
import { penGatePassage } from "./pen-gate"
import type { WildlifeWorld } from "./wildlife/simulation"
import { isComplete, walkWorker } from "./construction"
import { foldAccessRoute, foldLayout } from "./herding"
import { type GameMap } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import type { SimTraveler } from "./sim"
import { withdrawFood, type FoodStock } from "./storage"

export interface PenFoodVisit {
  penId:string; route:WanderSpot[]; back:WanderSpot; timer:number; returning:boolean; returnRoute:WanderSpot[]
}

/** Public portions come from delivered stock, reached through the fold gate. */
export function seekPenFood(actor:SimTraveler,map:GameMap,stores:ReadonlyMap<string,FoodStock>,scale=BASE_CHARACTER_SCALE):boolean {
  if(actor.hunger>=60 || actor.penFoodVisit || actor.penCare || actor.herding || actor.convoy || actor.roadShortcut || actor.partyId!==undefined || actor.carrying>0)return false
  const pens=map.buildings.filter(b=>b.buildType === "sheep-pen" && isComplete(b) &&
    ((stores.get(b.id)?.milk ?? 0)>0 || (stores.get(b.id)?.meat ?? 0)>0))
  for(const pen of pens) {
    const layout=foldLayout(map,pen,scale)
    if(Math.hypot(actor.x-layout.storageStand.x,actor.z-layout.storageStand.z)>6)continue
    const route=foldAccessRoute(map,pen,actor,layout.storageStand,scale)
    if(!route)continue
    const back={x:actor.x,y:actor.y,z:actor.z}
    actor.penFoodVisit={penId:pen.id,route,back,returnRoute:[back,...route].reverse().slice(1),timer:2,returning:false}
    actor.activity="collectingFood";actor.buildingTask=undefined
    return true
  }
  return false
}

export function stepPenFood(actor:SimTraveler,map:GameMap,stores:Map<string,FoodStock>,speed:number,dt:number,world?:WildlifeWorld|null):boolean {
  const task=actor.penFoodVisit
  if(!task)return false
  if(dt<=0)return true
  const pen=map.buildings.find(b=>b.id===task.penId && isComplete(b))
  if(pen && !penGatePassage(world,map,pen,actor,task.route,dt))return true
  if(task.route.length) {walkWorker(actor,task.route,speed,dt,true);return true}
  if(task.returning) {actor.penFoodVisit=undefined;return false}
  task.timer-=dt
  if(task.timer>0)return true
  if(pen) {
    const stock=stores.get(pen.id),kind=(stock?.milk ?? 0)>0 ? "milk" : "meat"
    const amount=withdrawFood(stores,pen.id,kind,2)
    actor.hunger=Math.min(100,actor.hunger+amount*20)
    if(kind === "milk")actor.thirst=Math.min(100,actor.thirst+amount*10)
  }
  task.returning=true;task.route=task.returnRoute
  return true
}
