import { Euler, Matrix4 } from "three"
import { rotatedFootprint } from "../building-rotation"
import { BUILDING_DOOR_HEIGHT } from "./dimensions"
import type { BuildingDef } from "../map/types"
import { buildingPartGeometry } from "./part-geometry"
import type { BuildingPart, Vec3 } from "./geometry"

/** Clip tall chimney courses and posts at the upper floor. */
function clipped(part: BuildingPart, axis: 1 | 2, boundary: number, sign: number): BuildingPart | undefined {
  const original=buildingPartGeometry(part,false)
  const geometry=original.index ? original.toNonIndexed() : original
  geometry.applyMatrix4(new Matrix4().makeRotationFromEuler(new Euler(...part.rotation ?? [0,0,0])))
  geometry.translate(...part.position)
  const positions=geometry.getAttribute("position"),vertices:number[]=[]
  for(let i=0;i<positions.count;i+=3) {
    const triangle:Vec3[]=Array.from({length:3},(_,j)=>[positions.getX(i+j),positions.getY(i+j),positions.getZ(i+j)])
    const polygon:Vec3[]=[]
    for(let j=0;j<3;j++) {
      const a=triangle[j],b=triangle[(j+1)%3],da=(a[axis]-boundary)*sign,db=(b[axis]-boundary)*sign
      if(da>=0) polygon.push(a)
      if((da>=0)!==(db>=0)) {
        const t=da/(da-db)
        polygon.push(a.map((v,k)=>v+(b[k]-v)*t) as Vec3)
      }
    }
    for(let j=1;j<polygon.length-1;j++) vertices.push(...polygon[0],...polygon[j],...polygon[j+1])
  }
  if(geometry!==original) geometry.dispose()
  original.dispose()
  return vertices.length ? {...part,position:[0,0,0],rotation:undefined,size:undefined,vertices} : undefined
}

/** A host keeps its ground-floor identity; each dormitory owns its own deck and ladder. */
export function tavernStackParts(source: BuildingPart[], host: BuildingDef, inns: readonly BuildingDef[]): BuildingPart[] {
  const inn=inns[0]
  if(!inn) return source
  const local=rotatedFootprint(host,host.rotation),floor=inn.floorHeight ?? host.height
  const parts=source.flatMap(p=>p.layer === "roof" ? [] : p.layer === "wall" ? clipped(p,1,floor-.035,-1) ?? [] : [p])
  const box=(name:string,position:Vec3,size:Vec3,color:string,cutawaySide:[number,number])=>
    parts.push({name:`upper-support-${inn.id}-${name}`,layer:"wall",position,size,color,cutawaySide,outline:false})
  for(const side of [-1,1]) {
    box(`plaster-${side}`,[side*(local.w/2-.065),(host.height+floor)/2,0],[.1,floor-host.height,local.d-.12],"#b7ae94",[side,0])
    box(`beam-${side}`,[side*(local.w/2-.065),floor-.055,0],[.13,.11,local.d-.06],"#775c3e",[side,0])
    const head=Math.max(host.height,BUILDING_DOOR_HEIGHT+.08)
    if (floor>head) box(`end-plaster-${side}`,[0,(head+floor)/2,side*(local.d/2-.065)],[local.w-.12,floor-head,.1],"#b7ae94",[0,side])
    box(`end-beam-${side}`,[0,floor-.055,side*(local.d/2-.065)],[local.w-.12,.11,.13],"#775c3e",[0,side])
  }
  return parts
}
