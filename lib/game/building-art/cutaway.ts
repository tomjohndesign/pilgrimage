import { Box3, Euler, Vector3 } from "three"
import type { BuildingPart } from "./geometry"

/** Outward wall direction in model coordinates, retained when details are batched. */
export function wallSide(part: BuildingPart): [number, number] {
  if (part.cutawaySide) return part.cutawaySide
  const bounds = new Box3(), rotation = new Euler(...part.rotation ?? [0, 0, 0])
  const add = (x: number, y: number, z: number) => bounds.expandByPoint(new Vector3(x,y,z).applyEuler(rotation).add(new Vector3(...part.position)))
  if (part.size) {
    for (const x of [-1,1]) for (const y of [-1,1]) for (const z of [-1,1]) add(x*part.size[0]/2,y*part.size[1]/2,z*part.size[2]/2)
  } else for (let i=0;i<(part.vertices?.length ?? 0);i+=3) add(...part.vertices!.slice(i,i+3) as [number,number,number])
  const centre=bounds.getCenter(new Vector3()), size=bounds.getSize(new Vector3())
  if (size.x > size.z*2) return [0,Math.sign(centre.z)]
  if (size.z > size.x*2) return [Math.sign(centre.x),0]
  return Math.abs(centre.x)>Math.abs(centre.z) ? [Math.sign(centre.x),0] : [0,Math.sign(centre.z)]
}
