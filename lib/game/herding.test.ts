import { seekPenFood, stepPenFood } from "./pen-food"
import { buildingFoodEntry, buildingApproaches } from "./building-rotation"
import { workerRoute } from "./construction"
import { emptyFoodStock } from "./storage"
import { sheepPenDemo } from "./building-art/sheep-pen-demo"
import { buildingPreviewMap } from "./building-art/map-preview"
import { earlyBuildingRecipe } from "./building-art/style"
import { describe, expect, it } from "vitest"
import { buildingFoldEntry, rotateBuildingPoint, rotatedFootprint, type BuildingRotation } from "./building-rotation"
import { buildingStepAllowed } from "./building-navigation"
import { layoutHand } from "./building-layout"
import { gaitSpeed, gaitStride } from "./wildlife/gait"
import { sheepPenLayout } from "./workshop-layout"
import { MILK_PER_BUCKET, MILKING_INTERVAL, MEAT_PER_LOAD, MEAT_PER_ANIMAL, SLAUGHTER_INTERVAL, penCare, releasePenCare, seekPenCare, stepShepherdCare } from "./sheep-husbandry"
import { penGate, penGatePassage, stepPenGates } from "./pen-gate"
import { buildingCentre, BUILDING_KINDS } from "./buildings"
import { foldLayout, foldPastureContains, releaseSheep, seekSheep, stepShepherd, stepFoldSheep } from "./herding"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import { createSim, stepSim } from "./sim"
import { TRAVELER_TYPES, type Traveler } from "./travelers"
import { createWildlife, stepWildlife } from "./wildlife/simulation"

function fixture(rotation: BuildingRotation = 0, mixed = false, layoutSeed = 0) {
  const map: GameMap = { width: 32, depth: 32, seed: 124, tiles: Array(32 * 32).fill("grass"), buildings: [],
    road: Array.from({ length: 32 }, (_, x) => ({ x, z: 1 })) }
  const def = BUILDING_KINDS["sheep-pen"]
  const pen = { ...def, ...rotatedFootprint(def, rotation), id: "pen", buildType: "sheep-pen", kind: "sheep-pen" as const, x: 16, z: 16, rotation, layoutSeed }
  map.buildings.push(pen)
  const people: Traveler[] = [0, 1].map(id => ({ id, name: `Shepherd ${id}`, type: TRAVELER_TYPES.peasant, direction: 1, pace: 1, offset: .1,
    attributes: { happiness: 80, age: 30, gold: 0, piety: 0, status: 0, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: ["herding"] } }))
  const world = createWildlife(map, [], 1.5), sheep = world.animals.filter(a => a.kind === "sheep").slice(0, mixed ? 2 : 4)
  if (mixed) sheep.push(...world.animals.filter(a => a.kind === "goat").slice(0, 2))
  for (const a of world.animals) if (!sheep.includes(a)) { a.reserve = true; a.concealed = true }
  sheep.forEach((a, i) => Object.assign(a, { x: -4 + i, z: 4, home: { x: -4 + i, z: 4 }, leader: a.id, rest: 10000, target: null }))
  const sim = createSim(people, map)
  sim.wildlife = world; sim.buildings = [pen]
  sim.balance = { ...sim.balance, rules: { ...sim.balance.rules, staminaDecay: 0, hungerDecay: 0, thirstDecay: 0 } }
  const layout = foldLayout(map, pen, 1.5)
  for (const actor of sim.travelers.values()) Object.assign(actor, { ...layout.outside, employer: pen.id, jobSlot: actor.id, activity: "idle" })
  const tick = () => {
    stepSim(sim, people, map, 1.5, .1)
    stepWildlife(world, map, .1, 1.5)
  }
  return { map, pen, people, world, sheep, sim, tick }
}

describe("shepherds gathering sheep", () => {
  it.each(["sheep","goat"] as const)("harvests the %s in three platform deliveries, preserving the body and undelivered meat",kind=>{
    const {map,pen,world,sheep,sim}=fixture(0,true),actor=[...sim.travelers.values()][0],layout=foldLayout(map,pen,1.5)
    world.animals=sheep.slice(0,2).map((a,i)=>({...a,...layout.slots[i],kind,rest:10000,
      fold:{penId:pen.id,slot:i,shepherd:null,arrived:true,route:[],guide:actor,travelled:0}}))
    Object.assign(actor,layout.inside)
    const care=penCare(world,pen.id)
    Object.assign(care,{feed:1,water:1,elapsed:SLAUGHTER_INTERVAL})
    let lowered=false,carried=false,led=false,interrupted=false,stored=0
    const deliveries:number[]=[]
    for(let tick=0;tick<4500 && stored<MEAT_PER_ANIMAL;tick++) {
      if(!actor.penCare)seekPenCare(actor,world,map,1.5,sim.foodStores)
      stepShepherdCare(actor,world,map,.5,.1,1.5,sim.foodStores)
      stepWildlife(world,map,.1,1.5)
      if(actor.penCare?.slaughterStage === "leading")led=true
      if(world.animals.some(a=>a.fold?.slaughter!==undefined && a.lying>.95 && !a.moving && !a.concealed))lowered=true
      const meat=sim.foodStores.get(pen.id)?.meat ?? 0
      if(meat!==stored) {
        expect(Math.hypot(actor.x-layout.storageStand.x,actor.z-layout.storageStand.z)).toBeLessThan(.01)
        expect(meat-stored).toBe(MEAT_PER_LOAD)
        deliveries.push(meat);stored=meat
      }
      if(actor.penCare?.carryingMeat) {
        carried=true
        expect(world.animals.some(a=>a.fold?.carcass && !a.concealed && !a.moving)).toBe(true)
        // Interrupt once: the undelivered load remains available for pickup.
        if(!interrupted) {releasePenCare(actor,world);interrupted=true}
      }
      if(care.pendingMeat)expect(stored+care.pendingMeat.amount+care.pendingMeat.remaining).toBe(MEAT_PER_ANIMAL)
    }
    expect(led && lowered && carried).toBe(true)
    expect(deliveries).toEqual([MEAT_PER_LOAD,2*MEAT_PER_LOAD,MEAT_PER_ANIMAL])
    expect(care.slaughtered).toBe(1)
    expect(care.pendingMeat).toBeUndefined()
    expect(world.animals.some(a=>a.fold?.replacing && a.concealed && !a.fold.carcass)).toBe(true)
    // Even with the store emptied, the next animal is protected by the cooldown.
    sim.foodStores.clear()
    world.animals.forEach(a=>{a.fold!.lastMilked=Infinity})
    const replacement=world.animals.find(a=>a.fold?.replacing)!
    replacement.fold!.replacing=false;replacement.concealed=false
    Object.assign(care,{elapsed:care.lastSlaughter+SLAUGHTER_INTERVAL-.1,feed:1,water:1,lastTend:care.lastSlaughter+SLAUGHTER_INTERVAL})
    expect(seekPenCare(actor,world,map,1.5,sim.foodStores)).toBe(false)
    care.elapsed+=.2
    expect(seekPenCare(actor,world,map,1.5,sim.foodStores)).toBe(true)
    expect(actor.penCare?.chore).toBe("slaughteringSheep")
  })
  it("keeps milking the demo flock rather than stalling at a sheltered animal",()=>{
    const map=buildingPreviewMap(earlyBuildingRecipe("sheep-pen")),demo=sheepPenDemo(map,false,true),pen=map.buildings.find(b=>b.buildType === "sheep-pen")!
    for(let i=0;i<5000 && demo.world.animals.some(a=>a.fold?.lastMilked===undefined);i++) {
      for(const actor of demo.actors) {
        if(!actor.penCare)seekPenCare(actor,demo.world,map,1.5,demo.stores)
        stepShepherdCare(actor,demo.world,map,.5,.1,1.5,demo.stores)
      }
      stepWildlife(demo.world,map,.1,1.5)
    }
    expect(demo.world.animals.filter(a=>a.fold?.lastMilked!==undefined).length,JSON.stringify({care:penCare(demo.world,pen.id),actors:demo.actors.map(a=>({task:a.penCare,x:a.x,z:a.z}))})).toBe(8)
  })
  it("lets an ordinary hungry NPC collect platform food through the main simulation",()=>{
    const {map,pen,sim,tick}=fixture(),actor=[...sim.travelers.values()][0],layout=foldLayout(map,pen,1.5)
    Object.assign(actor,layout.storageEntry,{hunger:30,thirst:90,employer:null,home:null,activity:"idle"})
    sim.foodStores.set(pen.id,{...emptyFoodStock(),milk:12})
    let collecting=false
    for(let i=0;i<800;i++) {
      tick()
      if(actor.activity === "collectingFood")collecting=true
      if(collecting && !actor.penFoodVisit)break
    }
    expect(collecting).toBe(true);expect(actor.penFoodVisit).toBeUndefined()
    expect(sim.foodStores.get(pen.id)?.milk).toBe(10)
    expect(actor.hunger).toBeGreaterThanOrEqual(70)
  })
  it.each(["sheep","goat"] as const)("milks the %s and preserves an interrupted bucket until platform delivery",kind=>{
    const {map,pen,world,sheep,sim}=fixture(),actor=[...sim.travelers.values()][0],layout=foldLayout(map,pen,1.5)
    const animal=sheep[0]
    Object.assign(animal,layout.slots[0],{kind,rest:10000,fold:{penId:pen.id,slot:0,shepherd:null,arrived:true,route:[],guide:actor,travelled:0}})
    world.animals=[animal]
    const care=penCare(world,pen.id)
    Object.assign(care,{elapsed:20,feed:1,water:1})
    let milked=false,carried=false,interrupted=false
    for(let i=0;i<2500 && !(sim.foodStores.get(pen.id)?.milk);i++) {
      if(!actor.penCare)seekPenCare(actor,world,map,1.5,sim.foodStores)
      stepShepherdCare(actor,world,map,.5,.1,1.5,sim.foodStores);stepWildlife(world,map,.1,1.5)
      if(actor.penCare?.chore === "milkingSheep" && !actor.penCare.route.length)milked=true
      if(actor.penCare?.carryingMilk) {
        carried=true;expect(sim.foodStores.get(pen.id)?.milk ?? 0).toBe(0)
        expect(animal.concealed || animal.fold?.carcass).toBeFalsy()
        if(!interrupted) {releasePenCare(actor,world);interrupted=true}
      }
    }
    expect(milked && carried).toBe(true)
    expect(care.milked).toBe(1);expect(care.slaughtered).toBe(0)
    expect(sim.foodStores.get(pen.id)?.milk).toBe(MILK_PER_BUCKET)
    expect(Math.hypot(actor.x-layout.storageStand.x,actor.z-layout.storageStand.z)).toBeLessThan(.01)
    expect(care.pendingMilk).toBeUndefined()
    Object.assign(care,{elapsed:animal.fold!.lastMilked!+MILKING_INTERVAL-.1,lastTend:Infinity,feed:1,water:1})
    expect(seekPenCare(actor,world,map,1.5,sim.foodStores)).toBe(false)
    care.elapsed+=.2
    expect(seekPenCare(actor,world,map,1.5,sim.foodStores)).toBe(true)
    expect(actor.penCare?.chore).toBe("milkingSheep")
  })
  for(const rotation of [0,1,2,3] as const) for(const layoutSeed of [0,1]) it(`reaches the interior platform through the gate (${rotation}, layout ${layoutSeed})`,()=>{
    const {map,pen,sim,world}=fixture(rotation,true,layoutSeed),actor=[...sim.travelers.values()][0],layout=foldLayout(map,pen,1.5)
    Object.assign(actor,layout.outside,{x:layout.outside.x+(layout.outside.x-layout.inside.x)*2,z:layout.outside.z+(layout.outside.z-layout.inside.z)*2,hunger:30,thirst:50,employer:null})
    const origin={x:actor.x,z:actor.z}
    sim.foodStores.set(pen.id,{...emptyFoodStock(),milk:12,meat:50})
    expect(buildingApproaches(map,pen)).toContainEqual(buildingFoodEntry(pen))
    expect(buildingApproaches(map,pen)).toHaveLength(2)
    expect(foldPastureContains(map,pen,1.5)(layout.storage)).toBe(false)
    expect(foldPastureContains(map,pen,1.5)(layout.storageStand)).toBe(true)
    expect(workerRoute(map,actor,buildingFoodEntry(pen))).not.toBeNull()
    expect(seekPenFood(actor,map,sim.foodStores)).toBe(true)
    let consumed=false,opened=false
    for(let i=0;i<1800 && actor.penFoodVisit;i++) {
      stepPenFood(actor,map,sim.foodStores,.5,.1,world)
      stepPenGates(world,map,.1)
      if(penGate(world,pen.id).open>.95)opened=true
      if(sim.foodStores.get(pen.id)!.milk<12 && !consumed) {
        consumed=true
        expect(Math.hypot(actor.x-layout.storageStand.x,actor.z-layout.storageStand.z)).toBeLessThan(.01)
      }
    }
    expect(opened).toBe(true)
    for(let i=0;i<30;i++)stepPenGates(world,map,.1)
    expect(penGate(world,pen.id).open).toBe(0)
    expect(consumed).toBe(true);expect(actor.penFoodVisit).toBeUndefined()
    expect(sim.foodStores.get(pen.id)).toMatchObject({milk:10,meat:50})
    expect(actor.hunger).toBe(70)
    expect(Math.hypot(actor.x-origin.x,actor.z-origin.z)).toBeLessThan(.01)
  })
  for(const rotation of [0,1,2,3] as const) for(const layoutSeed of [0,1]) it(`opens for both gate directions and closes after traffic (${rotation}, layout ${layoutSeed})`,()=>{
    const {map,pen,world}=fixture(rotation,true,layoutSeed),layout=foldLayout(map,pen,1.5)
    for(const [from,to] of [[layout.outside,layout.inside],[layout.inside,layout.outside]]) {
      const gate=penGate(world,pen.id)
      expect(gate.open).toBe(0)
      expect(penGatePassage(world,map,pen,from,[to],.1)).toBe(false)
      for(let i=0;i<10;i++) {
        penGatePassage(world,map,pen,from,[to],.1)
        stepPenGates(world,map,.1)
      }
      expect(penGatePassage(world,map,pen,from,[to],.1)).toBe(true)
      expect(gate.open).toBe(1)
      // A following animal renews the hold, even as the shepherd leaves.
      for(let i=0;i<20;i++) {penGatePassage(world,map,pen,from,[to],.1);stepPenGates(world,map,.1)}
      expect(gate.open).toBe(1)
      const snapshot={...gate}
      stepPenGates(world,map,0);penGatePassage(world,map,pen,from,[to],0)
      expect(gate).toEqual(snapshot)
      for(let i=0;i<30;i++)stepPenGates(world,map,.1)
      expect(gate.open).toBe(0)
    }
  })
  for(const rotation of [0,1,2,3] as const) for(const layoutSeed of [0,1]) it(`cares for and replenishes a resting flock (${rotation}, layout ${layoutSeed})`, () => {
    const {map,pen,world,sheep,sim,tick}=fixture(rotation,true,layoutSeed)
    const care=penCare(world,pen.id), activities=new Set<string>(), sleeping=new Set<string>()
    let hidden=false,visitedRoom=false,led=false,restocked=false
    care.elapsed=SLAUGHTER_INTERVAL
    for(let i=0;i<7000 && !(care.replaced>=2 && care.tended>0 && sleeping.size===2 && sheep.every(a=>a.fold?.arrived && !a.concealed));i++) {
      tick()
      if(care.replaced===1 && !restocked) {sim.foodStores.clear();care.elapsed+=SLAUGHTER_INTERVAL;restocked=true}
      for(const actor of sim.travelers.values()) {
        activities.add(actor.activity)
        if(actor.penCare?.slaughterStage === "leading")led=true
        if(actor.penCare?.slaughterStage === "working") {
          const animal=world.animals.find(a=>a.id===actor.penCare!.animalId)!,spot=foldLayout(map,pen,1.5).slaughter
          expect(Math.hypot(animal.x-spot.x,animal.z-spot.z)).toBeLessThan(.05)
        }
        if(actor.penCare?.chore === "replacingSheep" && !actor.penCare.route.length && !actor.penCare.returning)visitedRoom=true
      }
      for(const a of sheep) {
        if(a.concealed && a.fold?.replacing)hidden=true
        if(a.lying>.9 && !a.concealed && a.fold?.slaughter===undefined && !a.fold?.carcass) {
          sleeping.add(a.kind)
          const beds=foldLayout(map,pen,1.5).beds
          expect(beds.some(b=>Math.hypot(b.x-a.x,b.z-a.z)<.05)).toBe(true)
        }
      }
      expect(world.animals.filter(a=>a.fold?.penId===pen.id).length).toBeLessThanOrEqual(8)
    }
    for(const chore of ["feedingSheep","wateringSheep","tendingSheep","slaughteringSheep","replacingSheep"])expect(activities.has(chore),chore).toBe(true)
    expect(care.fed).toBeGreaterThan(0);expect(care.watered).toBeGreaterThan(0);expect(care.tended).toBeGreaterThan(0)
    expect(care.replaced,JSON.stringify({care,actors:[...sim.travelers.values()].map(a=>({x:a.x,z:a.z,activity:a.activity,task:a.penCare})),animals:sheep.map(a=>({id:a.id,x:a.x,z:a.z,escort:a.fold?.escort,route:a.fold?.route}))})).toBeGreaterThanOrEqual(2)
    expect(led).toBe(true)
    expect(sim.foodStores.get(pen.id)?.meat).toBe((care.slaughtered-1)*MEAT_PER_ANIMAL)
    expect(sleeping).toEqual(new Set(["sheep","goat"]))
    expect(hidden && visitedRoom).toBe(true)
    expect(sheep.filter(a=>a.fold?.arrived && !a.concealed)).toHaveLength(4)
  })

  it("reserves chores for one shepherd and releases them when interrupted",()=>{
    const {map,pen,world,sheep,sim}=fixture(0,true)
    const layout=foldLayout(map,pen,1.5),[a,b]=[...sim.travelers.values()]
    Object.assign(sheep[0],layout.slots[0],{fold:{penId:pen.id,slot:0,shepherd:null,arrived:true,route:[],guide:a,travelled:0}})
    expect(seekPenCare(a,world,map,1.5,sim.foodStores)).toBe(true)
    expect(seekPenCare(b,world,map,1.5,sim.foodStores)).toBe(false)
    const before={x:a.x,z:a.z,timer:a.penCare!.timer}
    stepShepherdCare(a,world,map,.4,0,1.5,sim.foodStores)
    expect({x:a.x,z:a.z,timer:a.penCare!.timer}).toEqual(before)
    releasePenCare(a,world)
    expect(seekPenCare(b,world,map,1.5,sim.foodStores)).toBe(true)
  })

  it("shares eight places between sheep and goats, including animals still being fetched",()=>{
    const {map,pen,world,sheep,sim}=fixture(0,true)
    const layout=foldLayout(map,pen,1.5),actor=[...sim.travelers.values()][0]
    expect(layout.slots).toHaveLength(8)
    const source=sheep[0]
    world.animals=Array.from({length:9},(_,id)=>({...source,id,kind:id%2?"goat":"sheep",fold:id<8?{penId:pen.id,slot:id,shepherd:actor.id,arrived:id<7,route:[],guide:actor,travelled:0}:undefined}))
    expect(seekSheep(actor,world,map,1.5)).toBe(false)
    expect(world.animals[8].fold).toBeUndefined()
  })
  for (const rotation of [0, 1, 2, 3] as const) it(`fetches sheep and keeps them in a pen rotated ${rotation} quarter turns`, () => {
    const { map, pen, sheep, sim, tick } = fixture(rotation, true)
    const slots = foldLayout(map, pen, 1.5).slots
    expect(slots.length).toBeGreaterThanOrEqual(2)
    const activities = new Set<string>()
    for (let i = 0; i < 7000 && !sheep.every(a => a.fold?.arrived); i++) {
      tick()
      for (const actor of sim.travelers.values()) activities.add(actor.activity)
    }
    expect(activities).toContain("toSheep")
    expect(activities).toContain("herding")
    expect(sheep.every(a => a.fold?.arrived)).toBe(true)
    expect(new Set(sheep.map(a => a.fold!.slot)).size).toBe(sheep.length)
    const travelled = new Map<number,number>(), grazing = new Set<number>()
    const contains = foldPastureContains(map,pen,1.5)
    for (let i = 0; i < 500; i++) {
      tick()
      for (const a of sheep) {
        expect(contains(a),JSON.stringify({id:a.id,x:a.x,z:a.z})).toBe(true)
        travelled.set(a.id,(travelled.get(a.id) ?? 0)+a.distance)
        if(a.grazing === 1 && !a.moving) grazing.add(a.id)
      }
    }
    for (const a of sheep) {
      expect(travelled.get(a.id)).toBeGreaterThan(.25)
      expect(grazing.has(a.id)).toBe(true)
      expect(a.fold!.arrived).toBe(true)
      expect(a.phase).toBeGreaterThan(0)
    }
  })

  for (const rotation of [0, 1, 2, 3] as const) for (const layoutSeed of [0, 1]) {
    it(`herds a mixed flock from behind around the hut (${rotation}, layout ${layoutSeed})`, () => {
      const { map, pen, world, sheep, sim } = fixture(rotation, true, layoutSeed)
      expect(new Set(sheep.map(a => a.kind))).toEqual(new Set(["sheep", "goat"]))
      const actor = [...sim.travelers.values()][0], layout = foldLayout(map, pen, 1.5)
      const centre = buildingCentre(map, pen), hut = sheepPenLayout(5, 4)
      const local = (at: { x: number; z: number }) => {
        const p = rotateBuildingPoint(at.x - centre.x, at.z - centre.z, -rotation)
        return { x: p.x * layoutHand(pen.buildType, layoutSeed), z: p.z }
      }
      // Fill every slot, exercising the side yard and the lane around the back.
      const source = sheep[0]
      world.animals = layout.slots.map((_, id) => ({ ...source, id, kind: id % 2 ? "goat" as const : "sheep" as const,
        x: -4, z: 4, fold: undefined }))
      let followingSamples = 0
      for (let tick = 0; tick < 40000 && !world.animals.every(a => a.fold?.arrived); tick++) {
        stepPenGates(world,map,.1)
        if (!actor.herding) seekSheep(actor, world, map, 1.5)
        stepShepherd(actor, world, map, .5, .1, 1.5)
        for (const animal of world.animals) {
          stepFoldSheep(animal, map, .1, 1.5)
          if (!animal.fold?.route.length && !animal.fold?.arrived) continue
          const p = local(animal)
          if (Math.abs(p.x) < 2.5 && Math.abs(p.z) < 2) {
            expect(Math.abs(p.x - hut.coreX) < hut.coreWidth / 2 && Math.abs(p.z - hut.coreZ) < hut.coreDepth / 2).toBe(false)
          }
          if (actor.herding?.animalId === animal.id && animal.fold && !animal.fold.arrived && actor.herding.followed > actor.herding.approach) {
            // Route distance stays behind even when a corner changes the facing direction.
            expect(animal.fold.travelled - (actor.herding.followed - actor.herding.approach)).toBeGreaterThanOrEqual(.75 - 1e-7)
            followingSamples++
          }
        }
      }
      expect(followingSamples).toBeGreaterThan(0)
      expect(world.animals.filter(a => a.fold?.arrived)).toHaveLength(layout.slots.length)
      expect(new Set(world.animals.map(a => a.fold!.slot)).size).toBe(layout.slots.length)
      expect(seekSheep([...sim.travelers.values()][1], world, map, 1.5)).toBe(false)
    })
  }

  it.each(["sheep", "goat"] as const)("herds %s at twice its edited walking cadence while preserving stride", kind => {
    const { map, world, sim } = fixture(0, true)
    const animal = world.animals.find(a => a.kind === kind && !a.reserve)!
    const actor = [...sim.travelers.values()][0]
    animal.fold = { penId: "pen", slot: 0, shepherd: actor.id, arrived: false,
      route: [{ x: animal.x, y: animal.y, z: animal.z + 2 }], guide: { x: animal.x, z: animal.z - 1 }, travelled: 0 }
    animal.heading = 0; animal.lying = 0; animal.phase = 0
    const edits = { version: 1 as const, clips: { walk: { cadence: .5 } } }
    stepFoldSheep(animal, map, .1, 1.5, edits)
    expect(animal.distance).toBeCloseTo(gaitSpeed(kind, "walk", 1.5, edits) * 2 * .1)
    expect(animal.phase).toBeCloseTo(animal.distance / gaitStride(kind, "walk", 1.5))
  })

  it("brings the Buildings demo's nearby sheep and goats into the pen", () => {
    const map=buildingPreviewMap(earlyBuildingRecipe("sheep-pen")),{world,actors}=sheepPenDemo(map)
    expect(world.animals.map(a=>a.kind)).toEqual(["sheep","sheep","sheep","goat","goat","sheep","goat","sheep"])
    const gate=foldLayout(map,map.buildings[0],1.5).outside
    expect(world.animals.filter(a=>!a.fold).every(a=>Math.hypot(a.x-gate.x,a.z-gate.z)<3)).toBe(true)
    expect(world.animals.filter(a=>a.fold?.resting && a.lying===1)).toHaveLength(3)
    for(let tick=0;tick<6000 && !world.animals.every(a=>a.fold?.arrived);tick++) {
      for(const actor of actors) {
        if(!actor.herding) seekSheep(actor,world,map,1.5)
        stepShepherd(actor,world,map,.4,.1,1.5)
      }
      stepWildlife(world,map,.1,1.5)
    }
    expect(world.animals.every(a=>a.fold?.arrived)).toBe(true)
  })

  it("reserves different sheep and releases a sheep when its shepherd needs rest", () => {
    const { sim, world, map, tick } = fixture()
    const [a, b] = [...sim.travelers.values()]
    expect(seekSheep(a, world, map, 1.5)).toBe(true)
    expect(seekSheep(b, world, map, 1.5)).toBe(true)
    expect(a.herding!.animalId).not.toBe(b.herding!.animalId)
    const target = world.animals.find(s => s.id === a.herding!.animalId)!
    a.stamina = 10; tick()
    expect(a.herding).toBeUndefined()
    expect(target.fold).toBeUndefined()
    expect(a.activity).toBe("idle")
  })

  it("takes the direct route across clear pasture to the gate", () => {
    const {sim,world,map,pen}=fixture()
    const outside=foldLayout(map,pen,1.5).outside
    for(const animal of world.animals.filter(a=>!a.reserve)) Object.assign(animal,{x:outside.x-1,z:outside.z+1})
    const actor=[...sim.travelers.values()][0]
    expect(seekSheep(actor,world,map,1.5)).toBe(true)
    const animal=world.animals.find(a=>a.id===actor.herding!.animalId)!
    Object.assign(actor,{x:animal.x,y:animal.y,z:animal.z})
    stepShepherd(actor,world,map,.4,.1,1.5)
    expect(animal.fold!.route[0]).toEqual(foldLayout(map,pen,1.5).outside)
  })

  it("does not fetch unreachable sheep across a river", () => {
    const { sim, world, map, sheep } = fixture()
    for (let z = 0; z < map.depth; z++) map.tiles[z * map.width + 14] = "water"
    for (const a of sheep) { a.x = tileToWorldX(map, 10); a.z = tileToWorldZ(map, 20) }
    expect(seekSheep([...sim.travelers.values()][0], world, map, 1.5)).toBe(false)
    expect(sheep.every(a => !a.fold)).toBe(true)
  })

  it("abandons a removed pen and frees reservations", () => {
    const { sim, map, sheep, tick } = fixture()
    tick()
    expect(sheep.some(a => a.fold)).toBe(true)
    map.buildings = []; sim.buildings = []
    tick()
    expect(sheep.every(a => !a.fold)).toBe(true)
    expect([...sim.travelers.values()].every(a => !a.herding)).toBe(true)
  })

  it("does not move or assign work while paused", () => {
    const { sim, world, map, people, sheep } = fixture()
    const before = sheep.map(a => ({ x: a.x, z: a.z }))
    stepSim(sim, people, map, 1.5, 0)
    stepWildlife(world, map, 0, 1.5)
    expect(sheep.map(a => ({ x: a.x, z: a.z }))).toEqual(before)
    expect(sheep.every(a => !a.fold)).toBe(true)
  })

  it("uses the fold gate in every orientation", () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const { map, pen, sim, world } = fixture(rotation)
      const outside = buildingFoldEntry(pen), inside = buildingFoldEntry(pen, true)
      expect(buildingStepAllowed(map, [pen], outside, inside, true)).toBe(true)
      const actor = [...sim.travelers.values()][0]
      seekSheep(actor, world, map, 1.5); releaseSheep(actor, world)
      expect(actor.herding).toBeUndefined()
    }
  })
})
