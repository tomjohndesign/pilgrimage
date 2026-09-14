import { buildingCentre } from "./buildings"
import { layoutHand } from "./building-layout"
import { rotateBuildingPoint, rotatedFootprint } from "./building-rotation"
import type { BuildingDef, GameMap } from "./map/types"
import { sheepPenLayout } from "./workshop-layout"
import type { Point } from "./wildlife/habitat"
import type { WildlifeWorld } from "./wildlife/simulation"

export interface PenGateState { open:number; clock:number; holdUntil:number }
export function penGate(world:WildlifeWorld,id:string):PenGateState {
  world.penGates ??= new Map()
  let gate=world.penGates.get(id)
  if(!gate) {gate={open:0,clock:0,holdUntil:0};world.penGates.set(id,gate)}
  return gate
}
export function stepPenGates(world:WildlifeWorld,map:GameMap,dt:number) {
  if(dt<=0)return
  for(const [id,gate] of world.penGates ?? []) {
    if(!map.buildings.some(b=>b.id===id)) {world.penGates!.delete(id);continue}
    gate.clock+=dt
    gate.open=Math.max(0,Math.min(1,gate.open+(gate.clock<gate.holdUntil ? 1 : -1)*dt/0.8))
  }
}

/** Open on approach, wait for clearance, and keep the leaf open for following traffic. */
export function penGatePassage(world:WildlifeWorld|null|undefined,map:GameMap,pen:BuildingDef,from:Point,route:readonly Point[],dt:number):boolean {
  if(!world || dt<=0 || !route.length)return true
  const centre=buildingCentre(map,pen),{w,d}=rotatedFootprint(pen,pen.rotation),layout=sheepPenLayout(w,d)
  const local=(p:Point)=>{
    const at=rotateBuildingPoint(p.x-centre.x,p.z-centre.z,-(pen.rotation??0))
    return {x:at.x*layoutHand(pen.buildType,pen.layoutSeed),z:at.z}
  }
  const start=local(from),gateX=layout.penLeft+layout.gateWidth/2,gateZ=d/2-.13
  if(Math.hypot(start.x-gateX,start.z-gateZ)>1.6)return true
  let a=start,walked=0
  for(const next of route) {
    const b=local(next),length=Math.hypot(b.x-a.x,b.z-a.z)
    if((a.z-gateZ)*(b.z-gateZ)<=0 && Math.abs(b.z-a.z)>1e-8) {
      const t=(gateZ-a.z)/(b.z-a.z),x=a.x+(b.x-a.x)*t
      if(Math.abs(x-gateX)<layout.gateWidth/2+.1 && walked+length*t<1.6) {
        const gate=penGate(world,pen.id)
        gate.holdUntil=gate.clock+1.5
        return Math.hypot(start.x-gateX,start.z-gateZ)>.7 || gate.open>=.95
      }
    }
    walked+=length
    if(walked>1.6)break
    a=b
  }
  return true
}
