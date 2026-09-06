import { ISO_PITCH, yawForView } from "../render/iso"
import type { BuildingRecipe } from "./style"
import { buildingDimensions } from "./dimensions"
import { HOVEL_DOOR_HEIGHT, HOVEL_DOOR_WIDTH, PERSON_HEIGHT, PERSON_WIDTH } from "../world-scale"

export const BUILDING_VIEWS = [
  { id: 0, name: "Southeast", faces: "south entrance + east wall", column: 0, row: 0 },
  { id: 1, name: "Northeast", faces: "north rear + east wall", column: 1, row: 0 },
  { id: 2, name: "Northwest", faces: "north rear + west wall", column: 0, row: 1 },
  { id: 3, name: "Southwest", faces: "south entrance + west wall", column: 1, row: 1 },
] as const

/** Shared normalized coordinates, independent of the generated PNG resolution. */
export function projectionLayout(recipe: BuildingRecipe) {
  const diagonal = (recipe.width + recipe.depth) / Math.SQRT2
  const groundHalfHeight = diagonal * Math.sin(ISO_PITCH) / 2
  const height = recipe.wallHeight + recipe.roofRise + 0.3
  const pixelsPerUnit = Math.min(0.78 / diagonal, 0.2 / groundHalfHeight, 0.6 / (height * Math.cos(ISO_PITCH) + groundHalfHeight))
  return { anchor: [0.5, 0.72] as const, pixelsPerUnit, pitchDegrees: ISO_PITCH * 180 / Math.PI }
}

/** Exact projection used by the game's orthographic camera, in one unit square cell. */
export function projectBuildingPoint(recipe: BuildingRecipe, view: number, x: number, y: number, z: number): [number, number] {
  const { anchor, pixelsPerUnit: scale } = projectionLayout(recipe)
  const yaw = yawForView(view)
  return [anchor[0] + (x * Math.cos(yaw) - z * Math.sin(yaw)) * scale,
    anchor[1] + ((x * Math.sin(yaw) + z * Math.cos(yaw)) * Math.sin(ISO_PITCH) - y * Math.cos(ISO_PITCH)) * scale]
}

export function footprintPolygon(recipe: BuildingRecipe, view: number) {
  return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z]) => projectBuildingPoint(recipe,view,x*recipe.width/2,0,z*recipe.depth/2))
}

/** Code-native registration drawing supplied with every generation request. */
export function buildingGuideSvg(recipe: BuildingRecipe): string {
  const cell = 1024
  const panels = BUILDING_VIEWS.map((view) => {
    const point = (x: number,y: number,z: number) => projectBuildingPoint(recipe,view.id,x,y,z).map((n)=>Math.round(n*cell)).join(",")
    const line = (a: number[],b: number[],color="#96a59a", width=2) => `<line x1="${point(...a as [number,number,number]).split(",")[0]}" y1="${point(...a as [number,number,number]).split(",")[1]}" x2="${point(...b as [number,number,number]).split(",")[0]}" y2="${point(...b as [number,number,number]).split(",")[1]}" stroke="${color}" stroke-width="${width}"/>`
    const poly = (points: number[][], fill: string) => `<polygon points="${points.map(([x,y,z])=>point(x,y,z)).join(" ")}" fill="${fill}" stroke="#352b24" stroke-width="3"/>`
    const dimensions = buildingDimensions(recipe)
    const w=dimensions.wallWidth/2,d=dimensions.wallDepth/2,h=dimensions.eaveHeight,r=dimensions.ridgeHeight
    const front=dimensions.front
    const east=view.id<2, south=view.id===0||view.id===3
    const sx=east?1:-1, sz=south?1:-1, wallZ=south?front:-d
    let grid=""
    for(let x=-recipe.width/2;x<=recipe.width/2;x++)grid+=line([x,0,-recipe.depth/2],[x,0,recipe.depth/2])
    for(let z=-recipe.depth/2;z<=recipe.depth/2;z++)grid+=line([-recipe.width/2,0,z],[recipe.width/2,0,z])
    let shell=poly([[-w,0,-d],[w,0,-d],[w,0,d],[-w,0,d]],"#a29c8b")
    shell+=poly([[sx*w,0,-d],[sx*w,0,front],[sx*w,h,front],[sx*w,h,-d]],"#d7cbb0")
    shell+=poly([[-w,0,wallZ],[w,0,wallZ],[w,h,wallZ],[-w,h,wallZ]],"#e7d8b9")
    if(south) shell+=poly([[-HOVEL_DOOR_WIDTH/2,0.08,front],[HOVEL_DOOR_WIDTH/2,0.08,front],[HOVEL_DOOR_WIDTH/2,0.08+HOVEL_DOOR_HEIGHT,front],[-HOVEL_DOOR_WIDTH/2,0.08+HOVEL_DOOR_HEIGHT,front]],"#352b24")
    shell+=poly([[sx*w,h*0.4,-d*0.2-0.3],[sx*w,h*0.4,-d*0.2+0.3],[sx*w,h*0.7,-d*0.2+0.3],[sx*w,h*0.7,-d*0.2-0.3]],"#715139")
    if(recipe.variant === "porch" && south) for(const x of [-w,w]) shell+=line([x,0,d],[x,h,d],"#715139",12)
    const rw=dimensions.width/2-0.05,rd=dimensions.depth/2-0.05
    if(recipe.variant==="hipped") {
      const rz=Math.max(0.15,rd-rw*0.85)
      shell+=poly([[sx*rw,h,-rd],[sx*rw,h,rd],[0,r,rz],[0,r,-rz]],"#c4a05f")
      shell+=poly([[-rw,h,sz*rd],[rw,h,sz*rd],[0,r,sz*rz]],"#d7b774")
    } else {
      shell+=poly([[-sx*rw,h,-rd],[-sx*rw,h,rd],[0,r,rd],[0,r,-rd]],"#d7b774")
      shell+=poly([[-w,h,wallZ],[w,h,wallZ],[0,r,wallZ]],"#e7d8b9")
      shell+=poly([[sx*rw,h,-rd],[sx*rw,h,rd],[0,r,rd],[0,r,-rd]],"#c4a05f")
    }
    const px=-w-0.55,pz=0,ph=PERSON_HEIGHT,pw=PERSON_WIDTH/2
    shell+=poly([[px-pw,0,pz],[px+pw,0,pz],[px+pw,ph,pz],[px-pw,ph,pz]],"#8a7f9e")
    return `<g transform="translate(${view.column*cell},${view.row*cell})"><rect width="1024" height="1024" fill="#f3eddf"/><text x="40" y="55" font-family="sans-serif" font-size="25" fill="#352b24">${view.id}: ${view.name} — ${view.faces}</text>${grid}${shell}<circle cx="512" cy="737.28" r="6" fill="#c23d36"/><text x="40" y="988" font-family="sans-serif" font-size="20" fill="#526c5c">${recipe.width} × ${recipe.depth} plot · person ${PERSON_HEIGHT}, door ${HOVEL_DOOR_HEIGHT} · orthographic 35.264° · red dot = ground centre</text></g>`
  }).join("")
  return `<svg xmlns="http://www.w3.org/2000/svg" width="2048" height="2048" viewBox="0 0 2048 2048">${panels}</svg>`
}
