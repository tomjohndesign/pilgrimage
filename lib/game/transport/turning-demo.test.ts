import { describe, expect, it } from "vitest"
import { TURNING_SCENARIOS, turningDemo, turningMap } from "./turning-demo"
import { BASE_CHARACTER_SCALE, personWalkStride } from "../base-person/gait"
import { cartOffset, merchantWalkSpeed, pullingDesign } from "./assets"
import { cartRoute, cartRoutePoint, SHORT_BRIDGE_TURN_RADIUS, type CartRouteNode } from "./route"
import { walkingSurface } from "../map/walking-surface"
import { bridgeLayout, BRIDGE_RISE } from "../map/bridges"
import { TILE_HEIGHT } from "../map/terrain"
import { roadLanePoint } from "../map/road-lane"
import { createSim, stepSim } from "../sim"
import { generateTravelers, TRAVELER_TYPES } from "../travelers"

/** Measure along the route, including corners crossed within a frame. The
 * endpoint chord is shorter than travelled distance at an unsmoothed elbow. */
function routeDistance(route: CartRouteNode[], p: {x: number; z: number}) {
  let nearest = Infinity, distance = 0
  for (let i = 1; i < route.length; i++) {
    const a = route[i-1], b = route[i], dx = b.x-a.x, dz = b.z-a.z
    const t = Math.max(0, Math.min(1, ((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)))
    const error = Math.hypot(p.x-a.x-t*dx, p.z-a.z-t*dz)
    if (error < nearest) { nearest = error; distance = a.distance+t*(b.distance-a.distance) }
  }
  return distance
}

describe("cart-only turning simulations", () => {
  it.each(["horse", "donkey", "hand"] as const)("uses the rig's speed, bridge assistance and ordinary rolling physics for %s", puller => {
    const wheelbase=-cartOffset(puller)*BASE_CHARACTER_SCALE
    const speed=merchantWalkSpeed(puller,BASE_CHARACTER_SCALE,personWalkStride(pullingDesign(0))*BASE_CHARACTER_SCALE)
    for(const scenario of TURNING_SCENARIOS){
      const demo=turningDemo(scenario.id,puller), route=cartRoute(demo.map)
      expect(demo.frames.length).toBeGreaterThan(10)
      for(let i=1;i<demo.frames.length;i++){
        const before=demo.frames[i-1],f=demo.frames[i],pose=f.cartPose,p=before.cartPose
        if(!pose.bridgeGuided) expect(Math.hypot(pose.hitch.x-pose.x,pose.hitch.z-pose.z)).toBeCloseTo(wheelbase,9)
        if(f.reversing!==before.reversing)continue
        const travel=Math.hypot(pose.hitch.x-p.hitch.x,pose.hitch.z-p.hitch.z)
        expect(travel/demo.step, scenario.id).toBeLessThanOrEqual(speed + 1e-6)
        expect(Math.abs(routeDistance(route, pose.hitch)-routeDistance(route, p.hitch))/demo.step, scenario.id).toBeCloseTo(speed, 6)
        const heading=p.heading+Math.atan2(Math.sin(pose.heading-p.heading),Math.cos(pose.heading-p.heading))/2
        if(!pose.bridgeGuided&&!p.bridgeGuided) expect(Math.abs((pose.x-p.x)*Math.cos(heading)-(pose.z-p.z)*Math.sin(heading))).toBeLessThan(1e-5)
      }
    }
  })
  it("changes only the cart's turning radius, preserving terrain and walking lanes", () => {
    const map=turningMap("right"),original=structuredClone(map)
    const pedestrian=Array.from({length:100},(_,i)=>roadLanePoint(map,map.road!,i/100*(map.road!.length-1),0.24))
    const tight=cartRoutePoint(map,10,0.4),wide=cartRoutePoint(map,10,3)
    expect(Math.hypot(tight.x-wide.x,tight.z-wide.z)).toBeGreaterThan(0.5)
    expect(map).toEqual(original)
    expect(Array.from({length:100},(_,i)=>roadLanePoint(map,map.road!,i/100*(map.road!.length-1),0.24))).toEqual(pedestrian)
    expect(cartRoute(map,3).every((p,i,a)=>!i||p.progress>a[i-1].progress&&p.distance>a[i-1].distance)).toBe(true)
  })
  it("takes a later, tighter turn on a short bridge at every preview radius", () => {
    const map=turningMap("short_bridge"), corner=10
    for(const requested of [0.4,1.5,3]) {
      const p=cartRoutePoint(map,corner,requested)
      const inset=SHORT_BRIDGE_TURN_RADIUS*(1-Math.SQRT1_2)
      expect(p.x).toBeCloseTo(3-inset,5)
      expect(p.z).toBeCloseTo(-3+inset,5)
      const before=cartRoutePoint(map,corner-SHORT_BRIDGE_TURN_RADIUS,requested)
      const after=cartRoutePoint(map,corner+SHORT_BRIDGE_TURN_RADIUS,requested)
      expect(before.z).toBeCloseTo(-3,6)
      expect(after.x).toBeCloseTo(3,6)
    }
  })
  it("backs through the recorded poses without rotating the animal", () => {
    const demo=turningDemo("reverse","horse"),backing=demo.frames.filter(f=>f.reversing)
    expect(backing.length).toBeGreaterThan(100)
    for(let i=1;i<backing.length;i++){
      expect(backing[i].merchant.heading).toBeCloseTo(Math.PI/2)
      expect(backing[i].merchant.x).toBeLessThan(backing[i-1].merchant.x)
    }
    expect(turningDemo("reverse","horse")).toEqual(demo)
  })
  it("keeps the bridge corner supported while the live cart continues across", () => {
    const demo=turningDemo("bridge","horse")
    expect(demo.frames.every(f => f.clearance)).toBe(true)
    const map=demo.map,t=generateTravelers(1,1)[0]
    t.id=8;t.type=TRAVELER_TYPES.vendor;t.offset=3/(map.road!.length-1);t.direction=1
    const sim=createSim([t],map),s=sim.travelers.get(8)!
    Object.assign(s,{timer:10000,piety:0,visitCooldown:10000,hunger:100,thirst:100,stamina:100})
    for(let i=0;i<2000&&s.progress<map.road!.length-3;i++)stepSim(sim,[t],map,1,0.05)
    expect(s.activity).toBe("walking")
    expect(s.progress).toBeGreaterThan(map.road!.length-3)
  })
  it.each([1,-1] as const)("keeps live walkers on staggered bridge decks and ramps in direction %i", direction => {
    const map=turningMap("compound_bridge"),road=map.road!,layout=bridgeLayout(map)
    const travelers=generateTravelers(81,3)
    travelers.forEach((t,i)=>{t.id=i;t.type=[TRAVELER_TYPES.knight,TRAVELER_TYPES.pilgrim,TRAVELER_TYPES.peasant][i];t.direction=direction;t.offset=(direction===1?0.1:road.length-1.1)/(road.length-1)})
    const sim=createSim(travelers,map)
    for(const s of sim.travelers.values()) Object.assign(s,{timer:10000,piety:0,visitCooldown:10000,hunger:100,thirst:100,stamina:100})
    let deckSamples=0,rampSamples=0
    for(let tick=0;tick<2200;tick++) {
      const before=new Map([...sim.travelers].map(([id,s])=>[id,{x:s.x,y:s.y,z:s.z,progress:s.progress}]))
      stepSim(sim,travelers,map,1,0.05)
      for(const s of sim.travelers.values()) {
        const previous=before.get(s.id)!
        if(Math.abs(s.progress-previous.progress)>1) continue // map wrapping
        const tile=road[Math.max(0,Math.min(road.length-1,Math.round(s.progress)))]
        const rise=layout.rise[tile.z*map.width+tile.x]
        if(!rise) continue
        expect(s.y).toBeCloseTo(walkingSurface(map,s.x,s.z).height,6)
        expect(Math.abs(s.y-previous.y)).toBeLessThan(0.03)
        expect(Math.hypot(s.x-previous.x,s.z-previous.z)).toBeLessThan(0.06)
        if(rise>BRIDGE_RISE*0.75) {deckSamples++;expect(s.y).toBeCloseTo(TILE_HEIGHT+BRIDGE_RISE,6)}
        else rampSamples++
      }
    }
    expect(deckSamples).toBeGreaterThan(100)
    expect(rampSamples).toBeGreaterThan(20)
  })
  it.each(["hairpin", "chicane", "wooded_corner", "short_bridge", "bridge_exit", "reverse_bend", "compound_bridge"] as const)("keeps %s finite and repeatable at both radius limits", scenario => {
    for (const puller of ["hand", "donkey", "horse"] as const) for (const radius of [0.4, 3]) {
      const demo = turningDemo(scenario, puller, "common", radius), route = cartRoute(demo.map, radius)
      expect(route.every((p, i) => !i || p.distance > route[i-1].distance && p.progress > route[i-1].progress)).toBe(true)
      expect(demo.frames.every(f => [f.time, f.cartPose.x, f.cartPose.z, f.cartPose.heading, f.merchant.heading].every(Number.isFinite))).toBe(true)
      expect(demo.frames.length).toBeGreaterThan(100)
      expect(demo.frames.at(-1)!.time).toBeCloseTo(demo.duration-demo.step)
      expect(demo.frames.at(-1)!.stage).toBe(scenario === "reverse_bend" ? "Backing" : "Exit")
    }
  })
  it("exposes genuine edge contacts in constrained fixtures", () => {
    for (const scenario of ["wooded_corner"] as const) {
      const demo = turningDemo(scenario, "horse")
      expect(demo.frames.some(f => !f.clearance), scenario).toBe(true)
      expect(demo.frames.some(f => f.clearance), scenario).toBe(true)
    }
    for(const scenario of ["short_bridge","compound_bridge","bridge_exit"] as const)
      for(const puller of ["hand","donkey","horse"] as const)
        expect(turningDemo(scenario,puller).frames.every(f=>f.clearance),`${scenario} ${puller}`).toBe(true)
  })
  it("backs around the same bend with the original animal facing and cart pose", () => {
    const demo = turningDemo("reverse_bend", "horse"), forward = demo.frames.filter(f => !f.reversing), backward = demo.frames.filter(f => f.reversing)
    expect(backward.length).toBe(forward.length)
    expect(new Set(backward.map(f => f.merchant.heading.toFixed(2))).size).toBeGreaterThan(20)
    for (let i = 0; i < backward.length; i++) {
      const original = forward[forward.length-1-i]
      expect(backward[i].cartPose).toEqual(original.cartPose)
      expect(backward[i].merchant.heading).toBe(original.merchant.heading)
    }
  })

})
