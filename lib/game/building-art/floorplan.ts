import { makeRng } from "../rng"
import { buildingDoorOffset } from "../building-rotation"
import { layoutHand } from "../building-layout"
import type { BuildingPart, Vec3 } from "./geometry"
import { furnitureBounds, insideRoom, overlapsFloor, turnFurniture, type FloorRect } from "./furniture-placement"

interface RoomRecipe { variant: string; width: number; depth: number; layoutSeed?: number }

/** Furnish usable floor area; larger shells gain assemblies, never stretched furniture.
 * Work in authored coordinates before the complete building is mirrored.
 */
export function furnishFloorplan(source: BuildingPart[], recipe: RoomRecipe): BuildingPart[] {
  if (!["house","hall","monk-shelter","shelter","guard-post","workshop"].includes(recipe.variant)) return source
  const {width,depth,variant}=recipe,seed=recipe.layoutSeed ?? 0,random=makeRng(seed)
  let parts=[...source]
  const doorX=buildingDoorOffset(width,variant,seed)*layoutHand(variant,seed)
  const passages:FloorRect[]=[{x:doorX,z:depth*.36,w:.42,d:depth*.28},
    {x:0,z:depth*.08,w:.30,d:depth*.28}]
  // Keep the live timber bays clear even before their inventory is rendered.
  if(variant==="workshop") passages.push({x:width*.27,z:depth*.15,w:width*.4,d:depth*.55})
  const obstacleParts=(omit:Set<BuildingPart>)=>parts.filter(p=>{
    if(omit.has(p) || p.layer==="wall" || p.layer==="roof" || p.surface) return false
    const top=p.size ? p.position[1]+p.size[1]/2 : p.vertices ? Math.max(...p.vertices.filter((_,i)=>i%3===1))+p.position[1] : 0
    return top>.06 && p.position[1]<.55
  })
  const candidates=(rect:FloorRect)=>{
    const x=width/2-.19-rect.w/2,z=depth/2-.19-rect.d/2
    if(x<0 || z<0) return []
    const positions=Array.from({length:Math.max(1,Math.ceil(x*2/.28)+1)},(_,i)=>x===0?0:-x+2*x*i/Math.max(1,Math.ceil(x*2/.28)))
      .flatMap(x=>Array.from({length:Math.max(1,Math.ceil(z*2/.28)+1)},(_,i)=>({x,z:z===0?0:-z+2*z*i/Math.max(1,Math.ceil(z*2/.28)),rank:random()})))
    return positions.sort((a,b)=>a.rank-b.rank)
  }
  const place=(assembly:BuildingPart[],omit:Set<BuildingPart>,keepPosition=false):BuildingPart[]|undefined=>{
    const bounds=furnitureBounds(assembly),obstacles=obstacleParts(omit).map(p=>furnitureBounds([p]))
    for(const point of [...(keepPosition ? [{x:bounds.x,z:bounds.z}] : []),...candidates(bounds)]) {
      const rect={...bounds,...point}
      if(!insideRoom(rect,width,depth) || [...passages,...obstacles].some(p=>overlapsFloor(rect,p))) continue
      return assembly.map(p=>({...p,position:[p.position[0]+point.x-bounds.x,p.position[1],p.position[2]+point.z-bounds.z]}))
    }
  }
  // Rotate the whole bed, including covers and the sleeping anchor. Small rooms
  // retain the existing pose when the alternate footprint cannot fit safely.
  for(const bed of source.filter(p=>p.name.startsWith("straw-bed-"))) {
    const index=Number(bed.name.slice("straw-bed-".length))
    const assembly=parts.filter(p=>["straw-bed-","wool-cover-","rolled-blanket-"].some(prefix=>p.name===`${prefix}${index}`))
    const quarter=Math.floor(seed/4+index)%4
    if(seed<4 || !quarter) continue
    const turned=turnFurniture(assembly,bed.position[0],bed.position[2],quarter*Math.PI/2)
    const placed=place(turned,new Set(assembly),true)
    if(placed) parts=[...parts.filter(p=>!assembly.includes(p)),...placed]
  }
  const table=parts.filter(p=>/^(home-table-|bread-loaf|table-cup-|cup-opening-)/.test(p.name))
  if(table.length && Math.floor(seed/4)%2) {
    const bounds=furnitureBounds(table),placed=place(turnFurniture(table,bounds.x,bounds.z,Math.PI/2),new Set(table),true)
    if(placed) parts=[...parts.filter(p=>!table.includes(p)),...placed]
  }
  const count=Math.min(9,Math.floor(Math.max(0,width*depth-4)/2.5))
  for(let i=0;i<count;i++) {
    const kind=variant==="workshop" ? "chest" : i%3===0 ? "table" : i%3===1 ? "chest" : "stool"
    const kit=extraFurniture(kind,`floorplan-${i}`,Math.floor(random()*4)*Math.PI/2)
    const placed=place(kit,new Set())
    if(placed) parts.push(...placed)
  }
  return parts
}

function extraFurniture(kind:"table"|"chest"|"stool",prefix:string,yaw:number):BuildingPart[] {
  const parts:BuildingPart[]=[]
  const box=(name:string,position:Vec3,size:Vec3,color="#8e7652")=>parts.push({name:`${prefix}-${name}`,position,size,color,layer:"interior",outline:false})
  if(kind==="table") {
    for(const x of [-.24,.24]) for(const z of [-.14,.14]) box(`leg-${x}-${z}`,[x,.16,z],[.035,.32,.035])
    box("table-top",[0,.34,0],[.64,.05,.43],"#af9368")
    box("clay-bowl",[-.14,.40,0],[.14,.08,.14],"#a17859")
    box("bowl-inside",[-.14,.442,0],[.095,.008,.095],"#5e4934")
    box("bread",[.15,.40,.03],[.17,.065,.11],"#b18f5c")
  } else if(kind==="chest") {
    box("chest",[0,.12,0],[.42,.24,.29])
    box("chest-lid",[0,.255,0],[.44,.035,.31],"#a08a62")
    for(const x of [-.13,.13]) box(`chest-strap-${x}`,[x,.277,0],[.027,.012,.32],"#665741")
  } else {
    for(const x of [-.085,.085]) for(const z of [-.075,.075]) box(`stool-leg-${x}-${z}`,[x,.1,z],[.028,.20,.028])
    box("stool-seat",[0,.225,0],[.25,.05,.23],"#ae946c")
    // Decorative stools are not added to the house's bed/residency contract.
  }
  return turnFurniture(parts,0,0,yaw)
}
