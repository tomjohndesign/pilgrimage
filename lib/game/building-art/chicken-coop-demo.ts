import { coopLayout } from "../coop-layout"
import { rotatedFootprint } from "../building-rotation"
import { seekCoopEggs } from "../coop-keeper"
import { depositFood } from "../storage"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { coopPoint, syncCoopChickens } from "../chicken-coop"
import { createSim } from "../sim"
import { TRAVELER_TYPES, type Traveler } from "../travelers"
import { makeRng } from "../rng"
import { wildlifeHabitat } from "../wildlife/habitat"
import type { WildlifeWorld } from "../wildlife/simulation"
import type { GameMap } from "../map/types"
import { walkingSurface } from "../map/walking-surface"

export function chickenCoopDemo(map: GameMap, startHarvest = true) {
  const coops=map.buildings.filter(b=>b.buildType==="chicken-coop")
  const people:Traveler[]=coops.map((_,id)=>({id,name:`Coop keeper ${id+1}`,type:TRAVELER_TYPES.peasant,direction:1,pace:1,offset:0,
    attributes:{happiness:80,age:30,gold:0,piety:0,status:0,hunger:100,thirst:100,stamina:100,jobless:false,skills:["farming"]}}))
  const sim=createSim(people,map)
  const world:WildlifeWorld={animals:[],burrows:[],habitat:wildlifeHabitat(map,[]),trees:[],rng:makeRng(7919),canopy:2,treeDisturbances:new Map(),coopFood:sim.foodStores}
  syncCoopChickens(world,map)
  const actors=coops.map((coop,id)=>{
    const {w,d}=rotatedFootprint(coop,coop.rotation),layout=coopLayout(w,d)
    const at=startHarvest ? coopPoint(map,coop,layout.keeper.x,layout.keeper.z) : coopPoint(map,coop,-.5,d/2+1),actor=sim.travelers.get(id)!
    Object.assign(actor,{...at,y:walkingSurface(map,at.x,at.z).height,employer:coop.id,activity:"idle",jobSlot:0,workScale:BASE_CHARACTER_SCALE})
    if (startHarvest) {
      depositFood(sim.foodStores,coop,"eggs",3)
      if (seekCoopEggs(actor,world,map,sim.foodStores)) {
        actor.coopEggs!.route=[]
        actor.coopEggs!.stage="opening"
        actor.coopEggs!.timer=9
      }
    }
    return actor
  })
  return {world,actors,stores:sim.foodStores}
}
