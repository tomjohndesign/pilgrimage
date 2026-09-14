import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { foldLayout } from "../herding"
import { penCare, SLAUGHTER_INTERVAL } from "../sheep-husbandry"
import type { GameMap } from "../map/types"
import { walkingSurface } from "../map/walking-surface"
import { makeRng } from "../rng"
import { createSim } from "../sim"
import { TRAVELER_TYPES, type Traveler } from "../travelers"
import { wildlifeHabitat } from "../wildlife/habitat"
import type { WildlifeAnimal, WildlifeWorld } from "../wildlife/simulation"

/** A small, repeatable flock uses the normal herding routes and editable animal rigs. */
export function sheepPenDemo(map: GameMap, slaughterDemo=false, milkingDemo=false) {
  const pen = map.buildings.find(b => b.buildType === "sheep-pen")!
  const layout = foldLayout(map, pen, BASE_CHARACTER_SCALE), outside=layout.outside
  const animals: WildlifeAnimal[] = Array.from({length:8}, (_, id) => {
    const x = outside.x + (id-2)*.85, z = outside.z + 1.2 + (id%2)*.8
    return {id,kind:id<3 || id===5 || id===7 ? "sheep" : "goat",group:id<3 ? 0 : 1,leader:id,x,z,y:walkingSurface(map,x,z).height,
      heading:Math.PI,phase:id*.17,age:id,rest:10000,grazing:1,gait:"walk",speed:0,drive:0,action:"graze",lying:0,actionAge:0,
      burrow:null,burrowState:"outside",shelter:0,outsideTime:0,reserve:false,moving:false,distance:0,target:null,home:{x,z},
      perch:null,flight:null,frightened:0,concealed:false,transient:false,roamTime:-10000,regrouping:false}
  })
  // Three residents demonstrate the sleeping bays while five newcomers are fetched.
  animals.slice(5).forEach((animal,i)=>{
    const bed=layout.beds[i] ?? layout.slots[i+5]
    if(!bed)return
    Object.assign(animal,bed,{lying:1,action:"lie",rest:10+i*3,home:{x:bed.x,z:bed.z},grazing:0,
      fold:{penId:pen.id,slot:i+5,shepherd:null,arrived:true,route:[],guide:outside,travelled:0,resting:true,bed:i}})
  })
  const world: WildlifeWorld = {animals,burrows:[],habitat:wildlifeHabitat(map,[]),trees:[],rng:makeRng(7919),canopy:2,treeDisturbances:new Map()}
  if(slaughterDemo || milkingDemo) {
    animals.forEach((animal,i)=>{
      const spot=layout.slots[i]
      if(!spot)return
      Object.assign(animal,spot,{lying:0,action:"graze",rest:2+i,grazing:1,home:{x:spot.x,z:spot.z},
        fold:{penId:pen.id,slot:i,shepherd:null,arrived:true,route:[],guide:outside,travelled:0}})
    })
    Object.assign(penCare(world,pen.id),{elapsed:slaughterDemo ? SLAUGHTER_INTERVAL : 20,feed:1,water:1})
  }
  const people: Traveler[] = [0,1,2].map(id => ({id,name:`Shepherd ${id+1}`,type:TRAVELER_TYPES.peasant,direction:1,pace:1,offset:0,
    attributes:{happiness:80,age:30,gold:0,piety:0,status:0,hunger:100,thirst:100,stamina:100,jobless:false,skills:["herding"]}}))
  const sim = createSim(people,map)
  const actors = [...sim.travelers.values()].slice(0,2)
  const visitor=sim.travelers.get(2)!
  Object.assign(visitor,layout.storageEntry,{x:layout.storageEntry.x-1.4,z:layout.storageEntry.z+1.1,hunger:30,thirst:80,activity:"posted",employer:null})
  actors.forEach((actor,i)=>Object.assign(actor,{...outside,x:outside.x+(i ? .35 : -.35),employer:pen.id,jobSlot:i,activity:"idle"}))
  return {world,actors,visitor,stores:sim.foodStores}
}
