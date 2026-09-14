import { GAME_DAY_SECONDS } from "./calendar"
import { isComplete, walkWorker, workerRoute } from "./construction"
import { penGatePassage } from "./pen-gate"
import { foldAccessRoute, foldLayout, foldPastureContains, foldWalkRoute } from "./herding"
import { worldToTileX, worldToTileZ, type BuildingDef, type GameMap } from "./map/types"
import type { WanderSpot } from "./monk-wander"
import type { SimTraveler } from "./sim"
import { depositFood, emptyFoodStock, storedFood, STOREHOUSE_FOOD_CAPACITY, type FoodStock } from "./storage"
import type { WildlifeAnimal, WildlifeWorld } from "./wildlife/simulation"

/** A single animal feeds the store in three large loads, then the flock rests. */
export const MEAT_PER_LOAD = 50
export const MEAT_LOADS_PER_ANIMAL = 3
export const MEAT_PER_ANIMAL = MEAT_PER_LOAD * MEAT_LOADS_PER_ANIMAL
export const SLAUGHTER_INTERVAL = 2 * GAME_DAY_SECONDS

export const MILK_PER_BUCKET = 12
export const MILKING_INTERVAL = GAME_DAY_SECONDS / 2

export type PenChore = "tendingSheep" | "feedingSheep" | "wateringSheep" | "slaughteringSheep" | "deliveringMeat" | "replacingSheep" | "milkingSheep" | "deliveringMilk"
export interface PenCare {
  elapsed:number; feed:number; water:number; lastTend:number; lastSlaughter:number
  caretaker?:number
  tended:number; fed:number; watered:number; slaughtered:number; replaced:number
  milked?:number
  pendingMilk?:{animalId:number;amount:number;point:WanderSpot}
  pendingMeat?:{animalId:number;amount:number;remaining:number;point:WanderSpot}
}
export interface PenCareTask {
  penId:string; chore:PenChore; route:WanderSpot[]; timer:number; heading:number
  animalId?:number; returning?:boolean
  slaughterStage?:"approach"|"leading"|"positioning"|"working"|"delivery"
  carryingMeat?:number
  carryingMilk?:number
}
export function shepherdVisualActivity(actor:Pick<SimTraveler,"activity"|"penCare">) {
  if(actor.penCare?.chore === "deliveringMilk" && !actor.penCare.carryingMilk)return "milkingSheep"
  if(actor.penCare?.chore === "deliveringMeat" && !actor.penCare.carryingMeat)return "slaughteringSheep"
  return actor.penCare?.chore === "slaughteringSheep" && actor.penCare.slaughterStage !== "working" ? "herding" : actor.activity
}
export function penCare(world:WildlifeWorld, penId:string):PenCare {
  world.penCare ??= new Map()
  let care=world.penCare.get(penId)
  if(!care) {care={elapsed:0,feed:.55,water:.55,lastTend:0,lastSlaughter:0,tended:0,fed:0,watered:0,slaughtered:0,replaced:0};world.penCare.set(penId,care)}
  return care
}

/** One shared pen clock, regardless of how many shepherds work here. */
export function stepPenCare(world:WildlifeWorld,map:GameMap,dt:number) {
  for(const pen of map.buildings.filter(b=>b.buildType === "sheep-pen" && isComplete(b))) {
    const care=penCare(world,pen.id),count=world.animals.filter(a=>a.fold?.penId===pen.id && a.fold.arrived && !a.fold.replacing && !a.fold.carcass).length
    care.elapsed+=dt
    care.feed=Math.max(0,care.feed-dt*count/900);care.water=Math.max(0,care.water-dt*count/700)
  }
  for(const id of world.penCare?.keys() ?? []) if(!map.buildings.some(b=>b.id===id && isComplete(b))) world.penCare!.delete(id)
}

export function releasePenCare(actor:SimTraveler,world?:WildlifeWorld|null) {
  const task=actor.penCare
  if(!task)return
  const care=world?.penCare?.get(task.penId)
  if(care?.caretaker===actor.id)care.caretaker=undefined
  const animal=world?.animals.find(a=>a.id===task.animalId)
  if(animal?.fold?.tendedBy===actor.id) {
    animal.fold.tendedBy=undefined
    animal.fold.slaughter=undefined
    if(animal.fold.escort) {animal.fold.escort=undefined;animal.fold.route=[];animal.rest=1}
  }
  actor.penCare=undefined
}

const pastureRoute=(actor:SimTraveler,map:GameMap,pen:BuildingDef,goal:WanderSpot,scale:number)=>foldAccessRoute(map,pen,actor,goal,scale)

/** Carry each load to the two-tile platform inside the opposite front corner. */
function foodRoute(actor:SimTraveler,map:GameMap,pen:BuildingDef,scale:number):WanderSpot[]|null {
  return foldAccessRoute(map,pen,actor,foldLayout(map,pen,scale).storageStand,scale)
}

export function seekPenCare(actor:SimTraveler,world:WildlifeWorld|null|undefined,map:GameMap,scale:number,stores:Map<string,FoodStock>):boolean {
  if(!world || actor.herding || actor.penCare)return false
  const pen=map.buildings.find(b=>b.id===actor.employer && b.buildType === "sheep-pen" && isComplete(b))
  if(!pen)return false
  const care=penCare(world,pen.id)
  if(care.caretaker!==undefined)return false
  const flock=world.animals.filter(a=>a.fold?.penId===pen.id && a.fold.arrived)
  if(!flock.length)return false
  const layout=foldLayout(map,pen,scale)
  const dairy=flock.filter(a=>!a.fold!.replacing && !a.fold!.carcass &&
    care.elapsed-(a.fold!.lastMilked ?? 20-MILKING_INTERVAL)>=MILKING_INTERVAL)
    .sort((a,b)=>(a.fold!.lastMilked ?? -1)-(b.fold!.lastMilked ?? -1) || a.id-b.id)
  let animal:WildlifeAnimal|undefined=care.pendingMilk ? flock.find(a=>a.id===care.pendingMilk!.animalId) : care.pendingMeat ? flock.find(a=>a.id===care.pendingMeat!.animalId) : flock.find(a=>a.fold!.replacing)
  const chore:PenChore|undefined=care.pendingMilk ? "deliveringMilk" : care.pendingMeat ? "deliveringMeat" : animal ? "replacingSheep" : care.feed<.65 ? "feedingSheep" : care.water<.65 ? "wateringSheep"
    : care.elapsed-care.lastSlaughter>=SLAUGHTER_INTERVAL && flock.length>=2 && storedFood(stores.get(pen.id) ?? emptyFoodStock())<=STOREHOUSE_FOOD_CAPACITY-MEAT_PER_ANIMAL ? "slaughteringSheep"
    : dairy.length && storedFood(stores.get(pen.id) ?? emptyFoodStock())<=STOREHOUSE_FOOD_CAPACITY-MILK_PER_BUCKET ? "milkingSheep"
    : care.elapsed-care.lastTend>=12 ? "tendingSheep" : undefined
  if(!chore)return false
  let goal=chore === "feedingSheep" ? layout.feed : layout.water,heading=0,route:WanderSpot[]|null=null
  if(chore === "deliveringMeat" || chore === "deliveringMilk") {
    const point=(chore === "deliveringMeat" ? care.pendingMeat! : care.pendingMilk!).point
    route=foldPastureContains(map,pen,scale)(point) ? pastureRoute(actor,map,pen,point,scale)
      : workerRoute(map,actor,{x:worldToTileX(map,point.x),z:worldToTileZ(map,point.z)})
    if(route)route.push({...point})
  } else if(chore === "replacingSheep") {
    const approach=pastureRoute(actor,map,pen,layout.inside,scale)
    if(approach)route=[...approach,layout.outside,layout.doorstep,layout.room]
  } else {
    if(chore === "tendingSheep" || chore === "slaughteringSheep" || chore === "milkingSheep") {
      animal=chore === "milkingSheep" ? dairy[0] : flock.filter(a=>!a.fold!.replacing && !a.fold!.carcass).sort((a,b)=>Math.hypot(a.x-actor.x,a.z-actor.z)-Math.hypot(b.x-actor.x,b.z-actor.z))[0]
      if(!animal)return false
      const contains=foldPastureContains(map,pen,scale)
      const spot=[[-.4,0],[.4,0],[0,.4],[0,-.4]].map(([x,z])=>({x:animal!.x+x,y:animal!.y,z:animal!.z+z})).find(contains)
      if(!spot)return false
      goal=spot;heading=Math.atan2(animal.x-goal.x,animal.z-goal.z)
    } else {
      const target=layout.point(0,0)
      // Both racks face inward from the rear fence in every rotation.
      const back=layout.point(0,-1)
      heading=Math.atan2(back.x-target.x,back.z-target.z)
    }
    route=pastureRoute(actor,map,pen,goal,scale)
  }
  if(!route)return false
  care.caretaker=actor.id
  if(animal && chore!=="replacingSheep") {animal.fold!.tendedBy=actor.id;animal.fold!.route=[];animal.fold!.resting=false}
  actor.buildingTask=undefined
  actor.penCare={penId:pen.id,chore,route,timer:chore === "slaughteringSheep" ? 6 : 4,heading,animalId:animal?.id,
    slaughterStage:chore === "slaughteringSheep" ? "approach" : undefined}
  actor.activity=chore
  return true
}

export function stepShepherdCare(actor:SimTraveler,world:WildlifeWorld|null|undefined,map:GameMap,speed:number,dt:number,scale:number,stores:Map<string,FoodStock>):boolean {
  const task=actor.penCare,pen=map.buildings.find(b=>b.id===task?.penId && b.id===actor.employer && isComplete(b))
  if(!world||!task||!pen) {releasePenCare(actor,world);return false}
  if(dt<=0)return true
  if(!penGatePassage(world,map,pen,actor,task.route,dt))return true
  const animal=world.animals.find(a=>a.id===task.animalId)
  const care=penCare(world,pen.id)
  if(task.slaughterStage === "leading" && !animal?.fold?.route.length) {
    const spot=foldLayout(map,pen,scale).slaughter
    if(!animal || Math.hypot(animal.x-spot.x,animal.z-spot.z)>.05) {releasePenCare(actor,world);return false}
  }
  if(task.route.length) {
    const before={x:actor.x,z:actor.z}
    const escort=animal?.fold?.escort
    const lead=escort ? escort.leadDistance-escort.followed : 0
    walkWorker(actor,task.route,lead>1.25*scale ? 0 : speed,dt,true)
    if(task.carryingMilk && care.pendingMilk)care.pendingMilk.point={x:actor.x,y:actor.y,z:actor.z}
    if(task.carryingMeat && care.pendingMeat)care.pendingMeat.point={x:actor.x,y:actor.y,z:actor.z}
    if(escort)escort.leadDistance+=Math.hypot(actor.x-before.x,actor.z-before.z)
    return true
  }
  if(task.slaughterStage === "approach" && animal?.fold) {
    const layout=foldLayout(map,pen,scale),contains=foldPastureContains(map,pen,scale)
    const route=contains(layout.slaughterHandler) && foldWalkRoute(map,pen,actor,layout.slaughter,scale)
    const approach=foldWalkRoute(map,pen,animal,actor,scale)
    if(!route || !approach) {releasePenCare(actor,world);return false}
    animal.fold.route=[...approach,...route.map(p=>({...p}))]
    animal.fold.escort={guide:actor,leadDistance:approach.reduce((sum,p,i)=>sum+Math.hypot(p.x-(i?approach[i-1]:animal).x,p.z-(i?approach[i-1]:animal).z),0),followed:0}
    animal.fold.resting=false;animal.rest=0
    task.route=[...route,layout.slaughterHandler];task.slaughterStage="leading"
    task.heading=Math.atan2(layout.slaughter.x-layout.slaughterHandler.x,layout.slaughter.z-layout.slaughterHandler.z)
    return true
  }
  if(task.slaughterStage === "leading") {
    if(animal?.fold?.route.length)return true
    const spot=foldLayout(map,pen,scale).slaughter
    if(!animal || Math.hypot(animal.x-spot.x,animal.z-spot.z)>.05) {releasePenCare(actor,world);return false}
    if(animal?.fold)animal.fold.escort=undefined
    const layout=foldLayout(map,pen,scale)
    task.route=[{x:spot.x+(layout.slaughterHandler.x-spot.x)*.43,y:spot.y,z:spot.z+(layout.slaughterHandler.z-spot.z)*.43}]
    task.slaughterStage="positioning"
    return true
  }
  if(task.slaughterStage === "positioning") {
    task.slaughterStage="working"
    if(animal?.fold)animal.fold.slaughter=0
  }
  if(task.slaughterStage === "working" && animal?.fold)animal.fold.slaughter=Math.min(1,1-task.timer/6)
  if(task.chore === "deliveringMilk" && !task.carryingMilk && care.pendingMilk) {
    const route=foodRoute(actor,map,pen,scale)
    if(!route) {releasePenCare(actor,world);return false}
    task.carryingMilk=care.pendingMilk.amount;task.route=route;task.timer=1
    return true
  }
  if(task.chore === "deliveringMeat" && !task.carryingMeat && care.pendingMeat) {
    task.timer-=dt
    if(task.timer>0)return true
    const route=foodRoute(actor,map,pen,scale)
    if(!route) {releasePenCare(actor,world);return false}
    task.carryingMeat=care.pendingMeat.amount;task.route=route;task.timer=1;task.slaughterStage="delivery"
    return true
  }
  task.timer-=dt
  if(task.timer>0)return true
  if(task.chore === "replacingSheep" && animal?.fold && !task.returning) {
    const layout=foldLayout(map,pen,scale),bed=layout.beds[animal.fold.slot%layout.beds.length] ?? layout.slots[animal.fold.slot]
    const route=bed && foldWalkRoute(map,pen,layout.inside,bed,scale)
    if(!route) {releasePenCare(actor,world);return false}
    task.returning=true;task.timer=1;task.route=[layout.doorstep,layout.outside,layout.inside,...route]
    return true
  }
  if(task.chore === "feedingSheep") {care.feed=1;care.fed++}
  if(task.chore === "wateringSheep") {care.water=1;care.watered++}
  if(task.chore === "tendingSheep") {care.lastTend=care.elapsed;care.tended++}
  if(task.chore === "milkingSheep" && animal?.fold) {
    const route=foodRoute(actor,map,pen,scale)
    if(!route) {releasePenCare(actor,world);return false}
    animal.fold.lastMilked=care.elapsed;animal.fold.tendedBy=undefined
    care.milked=(care.milked ?? 0)+1
    care.pendingMilk={animalId:animal.id,amount:MILK_PER_BUCKET,point:{x:actor.x,y:actor.y,z:actor.z}}
    task.chore="deliveringMilk";actor.activity="deliveringMilk";task.carryingMilk=MILK_PER_BUCKET;task.route=route;task.timer=1
    return true
  }
  if(task.chore === "deliveringMilk" && task.carryingMilk && care.pendingMilk) {
    care.pendingMilk.amount-=depositFood(stores,pen,"milk",task.carryingMilk)
    if(care.pendingMilk.amount<=0)care.pendingMilk=undefined
  }
  if(task.chore === "slaughteringSheep" && animal?.fold) {
    const route=foodRoute(actor,map,pen,scale)
    if(!route) {releasePenCare(actor,world);return false}
    animal.fold.carcass=true;animal.fold.slaughter=1;animal.moving=false;animal.distance=0
    care.lastSlaughter=care.elapsed;care.slaughtered++
    care.pendingMeat={animalId:animal.id,amount:MEAT_PER_LOAD,remaining:MEAT_PER_ANIMAL-MEAT_PER_LOAD,point:{x:actor.x,y:actor.y,z:actor.z}}
    task.chore="deliveringMeat";actor.activity="deliveringMeat";task.slaughterStage="delivery"
    task.carryingMeat=MEAT_PER_LOAD;task.route=route;task.timer=1
    return true
  }
  if(task.chore === "deliveringMeat" && task.carryingMeat && care.pendingMeat) {
    const accepted=depositFood(stores,pen,"meat",task.carryingMeat)
    care.pendingMeat.amount-=accepted
    if(care.pendingMeat.amount<=0) {
      if(care.pendingMeat.remaining>0 && animal?.fold) {
        const amount=Math.min(MEAT_PER_LOAD,care.pendingMeat.remaining),layout=foldLayout(map,pen,scale),spot=layout.slaughter
        care.pendingMeat={animalId:animal.id,amount,remaining:care.pendingMeat.remaining-amount,
          point:{x:spot.x+(layout.slaughterHandler.x-spot.x)*.43,y:spot.y,z:spot.z+(layout.slaughterHandler.z-spot.z)*.43}}
      } else {
        if(animal?.fold) {animal.fold.carcass=false;animal.fold.replacing=true;animal.concealed=true}
        care.pendingMeat=undefined
        care.lastSlaughter=care.elapsed
      }
    }
  }
  if(task.chore === "replacingSheep" && animal?.fold) {
    // Reuse the renderer's reserved animal record; reveal its replacement only
    // after the shepherd has visited the room and returned beneath the shelter.
    Object.assign(animal,{x:actor.x,y:actor.y,z:actor.z,home:{x:actor.x,z:actor.z},concealed:false,lying:0,grazing:0,rest:2,age:0})
    Object.assign(animal.fold,{replacing:false,carcass:false,slaughter:undefined,lastMilked:care.elapsed,resting:false,bed:undefined,route:[],tendedBy:undefined})
    care.replaced++
  }
  releasePenCare(actor,world)
  return false
}
