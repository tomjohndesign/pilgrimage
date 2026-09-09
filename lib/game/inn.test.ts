import { describe, expect, it } from "vitest"
import { BUILD_CATALOG, DEFAULT_BALANCE } from "./balance"
import { rotatedFootprint, rotateBuildingPoint, buildingEntry, type BuildingRotation } from "./building-rotation"
import { innPlacementLayout, innPlacementError } from "./inn"
import { placementBuildingLayout, placementRoofRotation, placementClearance } from "./building-placement-layout"
import { structureParts } from "./building-art/structure"
import { tavernStackParts } from "./building-art/stacked"
import { buildingHearth } from "./building-art/furnishings"
import { buildingSupports, characterSupport, placedSupport } from "./character-support"
import { assignBuildingTask, stepBuildingTask, walkWorker, type Worker } from "./construction"
import { unitInterior } from "./building-interior"
import { settlementRoute } from "./settlement-route"
import { createSettlement, jobBuildings, placementError, purchaseStructure } from "./settlement"
import { TILE_HEIGHT } from "./map/terrain"
import { BUILDING_KINDS } from "./buildings"
import { innLayout } from "./inn-layout"
import { captureSettlement, restoreSettlement } from "./save/settlement"
import { settlementSaveSchema } from "./save/schema"
import { tileToWorldX, tileToWorldZ, type BuildingDef, type GameMap } from "./map/types"

const inn=BUILD_CATALOG.find(b=>b.id==="inn")!,tavern=BUILD_CATALOG.find(b=>b.id==="tavern")!
function fixture(rotation:BuildingRotation=0,heated=true) {
  const host:BuildingDef={...tavern,...rotatedFootprint(tavern,rotation),x:8,z:8,rotation,buildType:"tavern",fireplace:heated}
  const size=rotatedFootprint(inn,rotation)
  const candidate:BuildingDef={...inn,...size,x:host.x,z:host.z,rotation,buildType:"inn"}
  const hovel:BuildingDef={...tavern,id:"hovel",buildType:"enclosure",x:3,z:3,w:3,d:3}
  const map:GameMap={width:24,depth:24,tiles:Array(576).fill("grass"),buildings:[hovel,host],
    site:{hovelId:"hovel",door:{x:4,z:6},branch:[{x:4,z:6}],junction:0}}
  const upper={...candidate,...innPlacementLayout(map,candidate)}
  return {map,host,candidate,upper}
}

describe("inn upper floors",()=> {
  it.each([0,1,2,3] as const)("provides four distinct reachable jobs on either floor at rotation %i",rotation=> {
    const {map,upper,candidate}=fixture(rotation,false)
    for(const building of [upper,{...candidate,fireplace:true}]) {
      const world={...map,buildings:building.supportId ? [...map.buildings,building] : [map.buildings[0],building]}
      const employer=jobBuildings(world).find(b=>b.id===building.id)!
      expect(BUILDING_KINDS[employer.kind].jobs).toBe(4)
      const posts=new Set<string>()
      for(let slot=0;slot<4;slot++) {
        const actor:Worker={x:tileToWorldX(world,4),z:tileToWorldZ(world,6),y:.18,workSlot:slot}
        expect(assignBuildingTask(actor,world,"work",building.id)).toBe(true)
        const target=actor.buildingTask!.destination
        posts.add(`${target.x},${target.z}`)
        expect(target.y).toBeCloseTo(TILE_HEIGHT+(building.floorHeight ?? 0))
        for(let step=0;step<1000;step++) if(stepBuildingTask(actor,world,1,.1)==="posted") break
        expect(actor.x).toBeCloseTo(target.x)
        expect(actor.y).toBeCloseTo(target.y)
        expect(actor.z).toBeCloseTo(target.z)
      }
      expect(posts.size).toBe(4)
    }
  })
  it("fits a full middle bed row upstairs and keeps the ladder hatch in the aisle",()=> {
    const {upper}=fixture(0,false),layout=innLayout(3,4,true)
    const beds=buildingSupports(upper).filter(b=>b.clips.includes("sleeping"))
    expect(beds).toHaveLength(16)
    expect(beds.filter(b=>b.x===0)).toHaveLength(4)
    for(const bed of beds) expect(Math.abs(bed.x-layout.hatch.x)>bed.width/2+.24 || Math.abs(bed.z-layout.hatch.z)>bed.depth/2+.24).toBe(true)
    const parts=structureParts(upper)
    const deck=parts.filter(p=>p.name.startsWith("inn-deck-"))
    for(const p of deck) expect(Math.abs(p.position[0]-layout.hatch.x)>=p.size![0]/2+.239 || Math.abs(p.position[2]-layout.hatch.z)>=p.size![2]/2+.239).toBe(true)
  })
  it("routes to every sleeping place around the other beds",()=> {
    const {map,upper,candidate}=fixture(0,false)
    for(const building of [upper,candidate]) {
      const world={...map,buildings:building.supportId ? [...map.buildings,building] : [map.buildings[0],building]}
      const beds=buildingSupports(building).filter(b=>b.clips.includes("sleeping"))
      const cx=tileToWorldX(world,building.x)+(building.w-1)/2,cz=tileToWorldZ(world,building.z)+(building.d-1)/2
      const floor=TILE_HEIGHT+(building.floorHeight ?? 0)
      for(const [slot,bed] of beds.entries()) {
        const actor:Worker={x:tileToWorldX(world,4),z:tileToWorldZ(world,6),y:.18,workSlot:slot}
        expect(assignBuildingTask(actor,world,"rest",building.id)).toBe(true)
        const route=actor.buildingTask!.route
        for(let i=1;i<route.length;i++) {
          const a=route[i-1],b=route[i]
          if(a.y<floor-.01 || b.y<floor-.01) continue
          const length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.max(1,Math.ceil(length/.04))
          for(let t=0;t<=steps;t++) {
            const x=a.x+(b.x-a.x)*t/steps-cx,z=a.z+(b.z-a.z)*t/steps-cz
            for(const other of beds) {
              if(other.x===bed.x && other.z===bed.z) continue
              expect(Math.abs(x-other.x)>=other.width/2+.06 || Math.abs(z-other.z)>=other.depth/2+.06,`${bed.id} route crosses ${other.id}`).toBe(true)
            }
          }
        }
      }
    }
  })
  it.each([0,1,2,3] as const)("places the full footprint at tavern rotation %i without occupying ground-floor access",rotation=> {
      const {map,host,candidate,upper}=fixture(rotation)
      expect(placementRoofRotation(map,inn,candidate,0)).toBe(rotation)
      expect(placementError(map,inn,candidate,DEFAULT_BALANCE,rotation)).toBeNull()
      expect(placementClearance(map,candidate)).toBeNull()
      expect(placementBuildingLayout(map,candidate)).toMatchObject({supportId:host.id,fireplace:false})
      const before=settlementRoute(map,map.buildings,buildingEntry(host),buildingEntry(host,true),false,true)
      expect(before).not.toBeNull()
      const stacked={...map,buildings:[...map.buildings,upper]}
      expect(settlementRoute(stacked,stacked.buildings,buildingEntry(host),buildingEntry(host,true),false,true)).toEqual(before)
      expect(innPlacementError(stacked,candidate)).toMatch(/already/)
  })
  it("rejects partial overlaps, unsupported buildings, independent taverns and unfinished hosts",()=> {
    const {map,host,candidate}=fixture()
    expect(innPlacementError(map,{...candidate,x:candidate.x+1})).toMatch(/full footprint/)
    for(const patch of [{buildType:"house"},{owner:"independent" as const},{construction:{work:0,required:10}}]) {
      expect(innPlacementError({...map,buildings:[{...host,...patch}]},candidate)).toBeTypeOf("string")
    }
  })
  it("gives standalone inns a hearth and carries only the tavern flue through an upper floor",()=> {
    for(const heated of [false,true]) {
      const {map,candidate}=fixture(0,heated)
      expect(innPlacementLayout(map,candidate).fireplace).toBe(false)
      expect(!!innPlacementLayout(map,candidate).tavernFlue).toBe(heated)
      expect(innPlacementLayout(map,{...candidate,x:18}).fireplace).toBe(true)
      const parts=structureParts({...candidate,...innPlacementLayout(map,candidate)})
      expect(parts.some(p=>p.name==="hearth-slab")).toBe(false)
      expect(parts.some(p=>p.name==="inn-flue-base")).toBe(heated)
      expect(parts.some(p=>p.name==="inn-front-door" || p.name==="inn-reception-counter")).toBe(false)
      expect(parts.some(p=>p.name.startsWith("inn-ladder-rung-"))).toBe(true)
      expect(parts.some(p=>p.name==="floor")).toBe(false)
    }
  })
  it("buys an independent upper structure and round-trips the support and hearth without levelling again",()=> {
    const {map,candidate}=fixture()
    const balance={...DEFAULT_BALANCE,buildings:{...DEFAULT_BALANCE.buildings,inn:{...DEFAULT_BALANCE.buildings.inn,requiredRenown:0}}}
    const settlement={...createSettlement(balance),resources:{gold:1000,wood:1000}}
    const bought=purchaseStructure(settlement,map,[],[],"inn",candidate,balance)
    expect(bought.error).toBeNull()
    expect(bought.settlement.resources).toEqual({gold:900,wood:915})
    expect(bought.settlement.elevation).toBe(settlement.elevation)
    const saved=settlementSaveSchema.parse(JSON.parse(JSON.stringify(captureSettlement(bought.settlement))))
    expect(restoreSettlement(map,saved).structures).toEqual(bought.settlement.structures)
    const upper=bought.settlement.structures[0]
    const actor:Worker={x:tileToWorldX(map,4),z:tileToWorldZ(map,6),y:.18}
    expect(assignBuildingTask(actor,{...map,buildings:[...map.buildings,upper]},"build",upper.id)).toBe(true)
  })
  it("distinguishes floors and keeps sleeping contacts on the correct bunk",()=> {
    const {map,upper}=fixture()
    const stacked={...map,buildings:[...map.buildings,upper]}
    const beds=buildingSupports(upper).filter(b=>b.clips.includes("sleeping"))
    expect(beds).toHaveLength(14)
    for(const bed of beds) {
      const placed=placedSupport(stacked,upper,bed)
      expect(characterSupport(stacked,placed.x,placed.z,"sleeping",placed.height)?.id).toBe(bed.id)
      expect(unitInterior(stacked,{x:placed.x,z:placed.z,y:placed.height})).toBe(upper.id)
    }
  })
  it("routes rest through the ladder and spends time climbing vertically",()=> {
    const {map,upper}=fixture(0,false)
    const stacked={...map,buildings:[...map.buildings,upper]}
    const actor:Worker={x:tileToWorldX(map,4),z:tileToWorldZ(map,6),y:.18,workSlot:0}
    expect(assignBuildingTask(actor,stacked,"rest",upper.id)).toBe(true)
    const route=actor.buildingTask!.route
    expect(route.some((p,i)=>i>0 && p.x===route[i-1].x && p.z===route[i-1].z && Math.abs(p.y-route[i-1].y)>1)).toBe(true)
    for(let step=0;step<1000;step++) if(stepBuildingTask(actor,stacked,1,.1)==="sleeping") break
    expect(actor.y).toBeGreaterThan(upper.floorHeight!)
    const climbing={x:0,y:0,z:0},ladder=[{x:0,y:2,z:0}]
    expect(walkWorker(climbing,ladder,1,.25)).toBe(false)
    expect(climbing.y).toBeCloseTo(.25)
  })
  it("replaces the whole tavern roof with an independently selectable floor",()=> {
    const {host,upper}=fixture()
    const parts=tavernStackParts(structureParts(host),host,[upper])
    expect(parts.some(p=>p.layer==="roof")).toBe(false)
    expect(parts.some(p=>p.name.startsWith("upper-support-"))).toBe(true)
  })
  it("closes the upstairs facade and adds crossed timber panels with a supported overhang",()=> {
    const {upper}=fixture()
    const parts=structureParts(upper)
    expect(parts.some(p=>p.name.startsWith("inn-cross-a-"))).toBe(true)
    expect(parts.some(p=>p.name.startsWith("inn-cross-b-"))).toBe(true)
    expect(parts.some(p=>p.name.startsWith("inn-jetty-bracket-"))).toBe(true)
    const front=parts.find(p=>p.name==="inn-plaster-x-1-1")!
    expect(front.size![1]).toBe(upper.height)
    const ground=structureParts({...inn,buildType:"inn"}).find(p=>p.name==="inn-plaster-x-1-1")!
    expect(ground.size![1]).toBeLessThan(upper.height)
    expect(front.position[2]).toBeGreaterThan(upper.d/2)
    const {map,candidate,host}=fixture()
    const neighbor={...host,id:"neighbor",x:host.x+host.w}
    expect(innPlacementError({...map,buildings:[...map.buildings,neighbor]},candidate)).toMatch(/overhanging/)
  })
  it("runs the upper roof perpendicular to the tavern, with its ridge along Z",()=> {
    const {upper}=fixture()
    const parts=structureParts(upper)
    const ridge=parts.find(p=>p.name==="inn-ridge")!
    expect(ridge.size![2]).toBeGreaterThan(ridge.size![0])
    const shingle=parts.find(p=>p.name.startsWith("inn-shingle-"))!
    expect(shingle.rotation![0]).toBe(0)
    expect(-shingle.rotation![2]).toBeGreaterThan(35*Math.PI/180)
    expect(-shingle.rotation![2]).toBeLessThan(50*Math.PI/180)
    const ground=structureParts({...inn,buildType:"inn"})
    const groundRidge=ground.find(p=>p.name==="inn-ridge")!
    expect(groundRidge.size![0]).toBeGreaterThan(groundRidge.size![2])
    const groundShingle=ground.find(p=>p.name.startsWith("inn-shingle-"))!
    expect(groundShingle.rotation![0]).toBeCloseTo(Math.atan(.32))
    expect(groundShingle.rotation![2]).toBe(0)
  })
  it("projects the upstairs roof beyond all four walls and keeps the chimney mouth clear",()=> {
    const {upper}=fixture()
    const parts=structureParts(upper)
    const facade=parts.find(p=>p.name==="inn-plaster-x-1-1")!
    const side=parts.find(p=>p.name==="inn-plaster-z-1-1")!
    const ridge=parts.find(p=>p.name==="inn-ridge")!
    const eave=parts.find(p=>p.name==="inn-eave-1")!
    expect(ridge.size![2]/2-facade.position[2]).toBeGreaterThan(.25)
    expect(eave.position[0]-side.position[0]).toBeGreaterThan(.25)
    expect(parts.filter(p=>p.name.startsWith("inn-roof-verge-"))).toHaveLength(4)
    const mouth=parts.find(p=>p.name==="chimney-mouth")!
    const shingle=parts.find(p=>p.name.startsWith("inn-shingle-"))!
    const pitch=Math.tan(-shingle.rotation![2])
    const roofAtCap=ridge.position[1]-.04-(Math.abs(mouth.position[0])-.195)*pitch+.1
    expect(mouth.position[1]-roofAtCap).toBeGreaterThan(.15)
    expect(mouth.position[0]).toBe(upper.tavernFlue!.x)
    expect(mouth.position[2]).toBe(upper.tavernFlue!.z)
  })
  it("keeps a front reception area and hearth beside thirteen beds in the standalone inn",()=> {
    const parts=structureParts({...inn,buildType:"inn"})
    expect(parts.filter(p=>p.support?.clips.includes("sleeping"))).toHaveLength(13)
    expect(parts.some(p=>p.name==="inn-front-door")).toBe(true)
    expect(parts.some(p=>p.name==="inn-reception-counter")).toBe(true)
    expect(parts.some(p=>p.name.startsWith("inn-shingle-"))).toBe(true)
    expect(parts.some(p=>p.name.startsWith("thatch-bundle-"))).toBe(true)
    expect(parts.some(p=>p.name==="hearth-slab")).toBe(true)
    const mouth=parts.find(p=>p.name==="chimney-mouth")!,effects=buildingHearth("inn",inn.w,inn.d,inn.height,0)
    expect(mouth.position).toEqual([effects.x,effects.chimneyTop-.04,effects.z])
    expect(parts.some(p=>/partition|room-wall/.test(p.name))).toBe(false)
  })
})
