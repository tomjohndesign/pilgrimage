import type { BuildingPart, Vec3 } from "./geometry"

/** Turn a complete furniture assembly, retaining its sleeping/seating contacts. */
export function turnFurniture(parts: BuildingPart[], x: number, z: number, yaw: number): BuildingPart[] {
  const c = Math.cos(yaw), s = Math.sin(yaw)
  const vector = (x: number, y: number, z: number): Vec3 => [x*c+z*s, y, z*c-x*s]
  return parts.map(part => {
    const p = vector(part.position[0]-x, part.position[1], part.position[2]-z)
    return { ...part, position: [p[0]+x,p[1],p[2]+z],
      vertices: part.vertices?.flatMap((_, i, a) => i%3 === 0 ? vector(a[i],a[i+1],a[i+2]) : []),
      rotation: part.vertices ? part.rotation : [part.rotation?.[0] ?? 0, (part.rotation?.[1] ?? 0)+yaw, part.rotation?.[2] ?? 0] }
  })
}

export interface FloorRect { x: number; z: number; w: number; d: number }
export function overlapsFloor(a: FloorRect, b: FloorRect, gap = .04): boolean {
  return Math.abs(a.x-b.x) < (a.w+b.w)/2+gap && Math.abs(a.z-b.z) < (a.d+b.d)/2+gap
}

/** Axis-aligned occupancy after a quarter turn, also usable without Three.js. */
export function furnitureBounds(parts: BuildingPart[]): FloorRect {
  let left=Infinity, right=-Infinity, back=Infinity, front=-Infinity
  for(const part of parts) {
    const yaw=part.rotation?.[1] ?? 0,c=Math.abs(Math.cos(yaw)),s=Math.abs(Math.sin(yaw))
    if(part.size) {
      const w=part.size[0]*c+part.size[2]*s,d=part.size[0]*s+part.size[2]*c
      left=Math.min(left,part.position[0]-w/2);right=Math.max(right,part.position[0]+w/2)
      back=Math.min(back,part.position[2]-d/2);front=Math.max(front,part.position[2]+d/2)
    } else if(part.vertices) for(let i=0;i<part.vertices.length;i+=3) {
      const x=part.position[0]+part.vertices[i],z=part.position[2]+part.vertices[i+2]
      left=Math.min(left,x);right=Math.max(right,x);back=Math.min(back,z);front=Math.max(front,z)
    }
  }
  return {x:(left+right)/2,z:(back+front)/2,w:right-left,d:front-back}
}

export function insideRoom(rect: FloorRect, width: number, depth: number, margin = .18) {
  return Math.abs(rect.x)+rect.w/2 <= width/2-margin && Math.abs(rect.z)+rect.d/2 <= depth/2-margin
}
