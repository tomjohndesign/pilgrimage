import { describe, expect, it } from "vitest"
import * as THREE from "three"
import sharp from "sharp"
import manifest from "../../../public/textures/transport/v30/manifest.json"
import { ANIMAL_PROFILES, ANIMAL_COLUMNS, TRANSPORT, CART, PARTY_TRANSPORT_VERSION, PACK_ANIMAL_VERSION, animalUrl } from "./assets"
import { PASSENGER_CALLINGS, PASSENGER_COLUMNS, PASSENGER_SEATS } from "./party-assets"
import { createBasePersonRig } from "../base-person/rig"
import { personRecipe } from "../base-person/design"
import { populationDesign } from "../base-person/population"
import { poseDriver } from "./driver"
import { createSim, stepSim, GAME_DAY_SECONDS } from "../sim"
import { TRAVELER_TYPES, type Traveler } from "../travelers"
import { BUILD_CATALOG, DEFAULT_BALANCE } from "../balance"
import type { GameMap } from "../map/types"
import { jobBuildings } from "../settlement"
import { partyFormation, partyRoadDelta } from "../travel-parties"
import { BASE_CHARACTER_SCALE } from "../base-person/gait"
import { LINEAR_MOVEMENT } from "../motion"
import { COATS } from "./coats"
import { ensurePartyTransport, movePartyCart, partyLoadout } from "./party"
import { createAnimalRig } from "./animal-rig"
import { animalStride, RIG_TO_WORLD } from "./assets"
import { animalLeg } from "./animal-pose"
import { convoyBuildingsClear } from "./navigation"

function fixture(id = 0, count = 8, direction: 1 | -1 = 1) {
  const map: GameMap = { width: 100, depth: 30, seed: 42, tiles: Array(3000).fill("grass"), buildings: [], road: Array.from({ length: 100 }, (_, x) => ({ x, z: 10 })), shortcuts: [] }
  for (const p of map.road!) map.tiles[p.z * map.width + p.x] = "path"
  const travelers: Traveler[] = Array.from({ length: count }, (_, slot) => ({ id: id + slot, name: `Person ${slot}`, type: TRAVELER_TYPES.peasant, direction, offset: .3, pace: .8,
    party: { id, name: "Village party", slot }, attributes: { happiness: 80, age: 30, gold: 20, status: 0, piety: 100, hunger: 100, thirst: 100, stamina: 100, jobless: false, skills: [] } }))
  const sim = createSim(travelers, map)
  sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 } }
  const run = (seconds: number) => { for (let i = 0; i < seconds * 10; i++) stepSim(sim, travelers, map, 1, .1) }
  return { map, travelers, sim, run, party: sim.parties.get(id)! }
}

describe("party transport", () => {
  it.each((["donkey", "horse", "ox"] as const).flatMap(animal =>
    ([1, -1] as const).flatMap(direction => [.1, 1.25].flatMap(dt => [false, true].map(stopped => ({ animal, direction, dt, stopped }))))))(
    "takes the whole company past an inside bend with $animal, direction $direction, dt $dt, already stopped $stopped", ({ animal, direction, dt, stopped }) => {
    const id = Array.from({ length: 100 }, (_, id) => id).find(id => partyLoadout(id, 4).cart?.animal === animal)!
    const { map, travelers } = fixture(id, 4, direction)
    map.road = [
      ...Array.from({ length: 41 }, (_, x) => ({ x, z: 10 })),
      ...Array.from({ length: 10 }, (_, z) => ({ x: 40, z: z + 11 })),
      ...Array.from({ length: 59 }, (_, x) => ({ x: x + 41, z: 20 })),
    ]
    for (const p of map.road) map.tiles[p.z * map.width + p.x] = "path"
    map.buildings = [{ id: "tavern", buildType: "tavern", label: "Tavern", x: 37, z: 11, w: 3, d: 3,
      height: 1, color: "tan", roofColor: "brown" }]
    for (const t of travelers) t.offset = (direction === 1 ? 30 : 49) / (map.road.length - 1)
    const sim = createSim(travelers, map)
    sim.balance = { ...DEFAULT_BALANCE, rules: { ...DEFAULT_BALANCE.rules, hungerDecay: 0, thirstDecay: 0, staminaDecay: 0 } }
    const party = sim.parties.get(id)!
    if (stopped) {
      // Resume a wagon already stranded by the old road-only movement.
      ensurePartyTransport(party, [...sim.travelers.values()], map, BASE_CHARACTER_SCALE)
      let blocked = false
      for (let tick = 0; tick < 500 && !blocked; tick++) {
        blocked = !movePartyCart(party, map, BASE_CHARACTER_SCALE, 1, .1)
      }
      expect(blocked).toBe(true)
      party.progress = party.transport!.progress
      party.formed = false
    }
    let diverted = false, passed = false
    for (let tick = 0; tick < Math.ceil(100 / dt); tick++) {
      stepSim(sim, travelers, map, 1, dt)
      const cart = party.transport!
      expect(cart).toBeDefined()
      expect(convoyBuildingsClear(map, cart.pose, animal, BASE_CHARACTER_SCALE)).toBe(true)
      diverted ||= !!party.diversion
      passed = travelers.every(t => direction * (sim.travelers.get(t.id)!.progress - 40) > 8)
      if (passed && !party.diversion) break
    }
    expect(passed, party.reason).toBe(true)
    expect(diverted).toBe(true)
    expect(party.diversion).toBeUndefined()
  })

  it("keeps riders separate, moves the cart and leaves room for walkers", () => {
    const { sim, run, party } = fixture()
    run(.1)
    const start = party.transport!.progress
    run(30)
    expect(party.transport!.progress).toBeGreaterThan(start + 2)
    expect(sim.travelers.size).toBe(8)
    expect([...sim.travelers.values()].filter(s => s.partyRiding).length).toBe(party.transport!.seats.length)
  })
  it.each([1,-1] as const)("waits for a slow walker instead of stretching the convoy (%i)", direction => {
    const { sim, party, map, travelers }=fixture(0,8,direction)
    travelers[7].pace=.12
    for(let tick=0;tick<1800;tick++) {
      const cart=party.transport, previous=cart?.progress
      const walkers=cart?travelers.filter(t=>!cart.seats.includes(t.id)).map(t=>sim.travelers.get(t.id)!):[]
      const slots=cart?partyFormation(party,[cart.seats[0],...walkers.map(s=>s.id)],99,sim.time*GAME_DAY_SECONDS,BASE_CHARACTER_SCALE):[]
      const spread=cart?Math.max(...walkers.map((s,i)=>direction*partyRoadDelta(cart.progress,s.progress,99)-slots[i+1].behind)):0
      stepSim(sim,travelers,map,1,.1,{...LINEAR_MOVEMENT,acceleration:3})
      if(cart && spread>.18*BASE_CHARACTER_SCALE)expect(Math.abs(partyRoadDelta(cart.progress,previous!,99))).toBeLessThan(.0001)
    }
    const cart=party.transport!, walkers=travelers.filter(t=>!cart.seats.includes(t.id)).map(t=>sim.travelers.get(t.id)!)
    const slots=partyFormation(party,[cart.seats[0],...walkers.map(s=>s.id)],99,sim.time*GAME_DAY_SECONDS,BASE_CHARACTER_SCALE)
    for(const [i,s] of walkers.entries())expect(direction*partyRoadDelta(cart.progress,s.progress,99)-slots[i+1].behind).toBeLessThan(.2*BASE_CHARACTER_SCALE)
  })
  it.each([1,-1] as const)("crosses the map edge with its riders in direction %i", direction => {
    const { party, run, sim }=fixture(0,4,direction)
    run(1)
    let wrapped=false, previous=party.transport!.progress
    for(let i=0;i<4500&&!wrapped;i++) {
      run(.1);const next=party.transport!.progress
      wrapped=Math.abs(next-previous)>50;previous=next
    }
    expect(wrapped).toBe(true)
    expect(party.transport!.seats.every(id=>sim.travelers.get(id)!.progress===party.transport!.progress)).toBe(true)
  })
  it("assigns a remaining passenger to drive when an individual visitor stays", () => {
    const { sim, run, party, map } = fixture()
    sim.shrineRenown = 10000
    map.site = { hovelId: "shrine", door: { x: 35, z: 14 }, junction: 35, branch: Array.from({length:5},(_,i)=>({x:35,z:10+i})) }
    map.buildings.push({ id: "shrine", label: "Shrine", x: 34, z: 15, w: 3, d: 3, height: 1, color: "tan", roofColor: "brown" })
    let visited = false
    for (let tick = 0; tick < 4500; tick++) {
      run(.1); visited ||= party.stage === "visiting"
      if (visited && party.stage === "traveling") break
    }
    expect(sim.visits).toBe(8)
    // Recruitment is covered by the visit tests; exercise the transport handoff.
    const driver = sim.travelers.get(party.transport!.seats[0])!
    Object.assign(driver, { home: "house", employer: "tavern", activity: "idle" })
    for (let tick = 0; tick < 4500 && party.transport!.phase !== "road"; tick++) run(.1)
    expect(party.transport!.seats).not.toContain(driver.id)
    expect(party.members).not.toContain(driver.id)
    expect(party.transport!.phase).toBe("road")
    expect(sim.travelers.get(party.transport!.seats[0])!.partyRiding).toBe(true)
  })
  it("moves mules, horses and oxen as interchangeable packs without changing their gait", () => {
    for (const [index, kind] of (["donkey", "horse", "ox"] as const).entries()) {
      const id = Array.from({length:100},(_,i)=>i).find(id=>id%3===index&&partyLoadout(id,8).packs)!
      const { party, run } = fixture(id)
      run(1)
      expect(party.packs![0].kind).toBe(kind)
      const start=party.packs![0].progress
      run(30)
      expect(party.packs![0].progress).toBeGreaterThan(start)
      const bare=createAnimalRig(kind), loaded=createAnimalRig(kind,"common",undefined,false,true)
      expect(loaded.root.getObjectByName("long-cloth-roll")).toBeDefined()
      expect(loaded.root.getObjectByName("slumped-wool-bundle")).toBeDefined()
      if (kind === "ox") expect(loaded.root.getObjectByName("pack-halter")).toBeDefined()
      try {for(let frame=0;frame<20;frame++) {
        bare.pose(frame/20,true);loaded.pose(frame/20,true)
        expect(loaded.joints()).toEqual(bare.joints())
      }}finally{bare.dispose();loaded.dispose()}
    }
  })
  it("varies cart size, draft animals, and packs without requiring large crowds", () => {
    const samples = Array.from({length:100},(_,id)=>partyLoadout(id,10))
    expect(new Set(samples.flatMap(s=>s.cart?[s.cart.animal]:[]))).toEqual(new Set(["horse","donkey","ox"]))
    expect(new Set(samples.flatMap(s=>s.cart?[s.cart.style]:[]))).toEqual(new Set(["bench","rear"]))
    expect(samples.some(s=>s.packs===2)).toBe(true)
    expect(partyLoadout(0,2).cart).toBeUndefined()
  })
  it("places the ox hind hoof in the preceding fore hoof track", () => {
    const front=animalLeg("ox","left",false,0,true), hind=animalLeg("ox","left",true,.75,true)
    expect(hind.ankle[0]).toBe(front.ankle[0])
    expect(hind.ankle[2]*RIG_TO_WORLD+animalStride("ox",1)*.75).toBeCloseTo(front.ankle[2]*RIG_TO_WORLD,9)
  })
  it("keeps both ox claws flat in stance and clear of the floor in swing", () => {
    const rig = createAnimalRig("ox")
    try { for (let frame=0;frame<=100;frame++) {
      const phase=frame/100;rig.pose(phase,true);rig.root.updateMatrixWorld(true)
      for(const side of ["left","right"] as const)for(const rear of [false,true]) {
        const hoof=rig.root.getObjectByName(`${side}-${rear?"hind":"fore"}-hoof`)!
        let floor=Infinity
        hoof.traverse(object=>{if(object instanceof THREE.Mesh){const vertices=object.geometry.attributes.position;for(let i=0;i<vertices.count;i++)floor=Math.min(floor,new THREE.Vector3().fromBufferAttribute(vertices,i).applyMatrix4(object.matrixWorld).y)}})
        expect(floor).toBeGreaterThanOrEqual(-1e-6)
        if(animalLeg("ox",side,rear,phase,true).planted){expect(hoof.rotation.x).toBe(0);expect(floor).toBeCloseTo(0,6)}
      }
    }}finally{rig.dispose()}
  })
})


describe("party sprite contract", () => {
  it("keeps every seated calling and body variant on the shared human leg rig", () => {
    for(const calling of PASSENGER_CALLINGS)for(let variant=0;variant<6;variant++) {
      const design=populationDesign(TRAVELER_TYPES[calling],variant), recipe=personRecipe(design), rig=createBasePersonRig(recipe)
      try {for(const driving of [false,true]) {
        rig.pose(0,"idle");poseDriver(rig,design,driving)
        const joints=rig.joints()
        for(const side of ["left","right"] as const) {
          const hip=new THREE.Vector3(...joints[`${side}Hip`]!),knee=new THREE.Vector3(...joints[`${side}Knee`]!),foot=new THREE.Vector3(...joints[`${side}Foot`]!)
          expect(hip.distanceTo(knee)).toBeCloseTo(recipe.body.thighLength,9)
          expect(knee.distanceTo(foot)).toBeCloseTo(recipe.body.shinLength,9)
          expect(knee.y).toBeLessThan(hip.y);expect(foot.y).toBeLessThan(knee.y)
        }
      }}finally{rig.dispose()}
    }
  })
  it("ships complete color and depth sheets on the existing pixel grid", async () => {
    expect(manifest.version).toBe(PARTY_TRANSPORT_VERSION)
    expect(manifest.animalProfiles).toEqual(ANIMAL_PROFILES)
    expect(manifest.seats).toEqual(PASSENGER_SEATS)
    expect(manifest.safePadding).toBeGreaterThanOrEqual(4)
    const sheets: Array<[string,number,number,number]> = [
      ...["bench","rear"].map(style=>[`cart-${style}`,24,16,CART.cellSize] as [string,number,number,number]),
      ...PASSENGER_SEATS.map((_,i)=>[`passenger-${i}`,PASSENGER_COLUMNS,16,CART.cellSize] as [string,number,number,number]),
      ...(["ox","donkey","horse"] as const).flatMap(kind=>COATS[kind].flatMap(coat=>["","-hitched"].map(suffix=>[`${kind}-${coat.id}${suffix}`,ANIMAL_COLUMNS,kind==="horse"?16:8,TRANSPORT.cellSize] as [string,number,number,number]))),
      ...PASSENGER_CALLINGS.flatMap(calling=>["walk","wearyWalk","idle"].map(clip=>[`handler-${calling}-${clip}`,clip==="idle"?1:20,48,64] as [string,number,number,number])),
      ...["donkey-grey-pack","horse-bay-pack"].map(name=>[name,ANIMAL_COLUMNS,8,TRANSPORT.cellSize] as [string,number,number,number]),
    ]
    const activePacks = (["donkey", "horse", "ox"] as const).map(kind => {
      const url = animalUrl(kind, COATS[kind][0].id, false, true)
      expect(url).toContain(`/transport/${PACK_ANIMAL_VERSION}/`)
      return [url.slice(1, -4), ANIMAL_COLUMNS, 8, TRANSPORT.cellSize] as [string,number,number,number]
    })
    for(const [name,columns,rows,size] of [...sheets.map(([name,...layout])=>[`textures/transport/${PARTY_TRANSPORT_VERSION}/${name}`,...layout] as [string,number,number,number]),...activePacks]) {
      const color=await sharp(`public/${name}.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true})
      const depth=await sharp(`public/${name.replace(/([^/]+)$/, "depth-$1")}.png`).metadata()
      expect([color.info.width,color.info.height]).toEqual([columns*size,rows*size])
      expect([depth.width,depth.height]).toEqual([color.info.width,color.info.height])
      const occupied=new Set<number>();let invalid=0,cropped=0
      for(let y=0;y<color.info.height;y++)for(let x=0;x<color.info.width;x++) {
        const alpha=color.data[(y*color.info.width+x)*4+3]
        if(alpha!==0&&alpha!==255)invalid++
        if(!alpha)continue
        occupied.add(Math.floor(y/size)*columns+Math.floor(x/size))
        if(Math.min(x%size,y%size,size-1-x%size,size-1-y%size)<4)cropped++
      }
      expect({name,invalid,cropped,frames:occupied.size}).toEqual({name,invalid:0,cropped:0,frames:columns*rows})
    }
  },60000)
})
