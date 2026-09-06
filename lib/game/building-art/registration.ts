import type { BuildingRecipe } from "./style"
import { projectBuildingPoint, projectionLayout } from "./projection"
import { buildingDimensions } from "./dimensions"
import { ISO_PITCH } from "../render/iso"

export type Point = [number, number]
/** Left, nearest and right ground corners, then the eave above the nearest corner.
 * Legacy three-point measurements fit the ground only. */
export type Registration = [Point, Point, Point, Point?]
export type Registrations = Array<Registration | null>
export type Matrix = [number, number, number, number, number, number]

export function foundationCorners(recipe: BuildingRecipe, view: number): [Point, Point, Point] {
  const { wallWidth, wallDepth } = buildingDimensions(recipe)
  const points=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,z])=>projectBuildingPoint(recipe,view,x*wallWidth/2,0,z*wallDepth/2))
  return [points.reduce((a,b)=>a[0]<b[0]?a:b),points.reduce((a,b)=>a[1]>b[1]?a:b),points.reduce((a,b)=>a[0]>b[0]?a:b)]
}

/** Fit the two visible faces while preserving verticals and one shared height scale.
 * The two transforms meet continuously on the nearest vertical corner.
 */
export function registrationTransforms(recipe: BuildingRecipe, view: number, source: Registration) {
  const target=foundationCorners(recipe,view)
  const [left,front,right]=source
  if(source.some(p=>p?.some(n=>!Number.isFinite(n)||n<0||n>1)) || front[0]-left[0]<0.03 || right[0]-front[0]<0.03 || front[1]-(left[1]+right[1])/2<0.02) throw new Error("Choose the left, nearest and right ground corners, in that order.")
  const eave = source[3]
  if (eave && (front[1] - eave[1] < 0.03 || Math.abs(front[0] - eave[0]) > 0.08)) throw new Error("Choose the eave directly above the nearest ground corner.")
  const heightScale = eave
    ? buildingDimensions(recipe).eaveHeight * Math.cos(ISO_PITCH) * projectionLayout(recipe).pixelsPerUnit / (front[1] - eave[1])
    : (target[1][1]-(target[0][1]+target[2][1])/2)/(front[1]-(left[1]+right[1])/2)
  const face = (index: 0|2): Matrix => {
    const s=source[index],t=target[index],sf=source[1],tf=target[1]
    const a=(tf[0]-t[0])/(sf[0]-s[0])
    const b=(tf[1]-t[1]-heightScale*(sf[1]-s[1]))/(sf[0]-s[0])
    return [a,b,0,heightScale,tf[0]-a*sf[0],tf[1]-b*sf[0]-heightScale*sf[1]]
  }
  return { left:face(0),right:face(2),split:target[1][0] }
}

/** Human-scale v4 studies measured at 1254px atlas resolution (627px per cell). */
const measured: Partial<Record<BuildingRecipe["variant"], number[][][]>> = {
  gable: [[[136,482],[286,548],[461,455],[286,450]],[[168,456],[343,548],[492,476],[343,452]],[[127,384],[277,452],[455,366],[277,353]],[[164,364],[341,452],[493,383],[341,353]]],
  hipped: [[[127,459],[331,547],[549,449],[331,439]],[[82,452],[300,549],[506,448],[300,441]],[[114,377],[331,474],[548,382],[331,368]],[[83,378],[300,473],[508,384],[300,370]]],
  porch: [[[86,461],[300,561],[551,439],[300,424]],[[92,446],[320,557],[544,459],[320,417]],[[92,407],[301,505],[528,395],[301,364]],[[77,398],[317,513],[543,409],[317,370]]],
}
export function studyRegistrations(variant: BuildingRecipe["variant"]): Registrations {
  return (measured[variant] ?? []).map(points=>points.map(([x,y])=>[x/627,y/627]) as Registration)
}
