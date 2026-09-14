import { makeRng } from "../rng"
import type { BuildingPart } from "./geometry"

/** Low embedded stones and compacted soil: visual relief, never navigation blockers. */
export function groundDetail(width: number, depth: number, seed: number): BuildingPart[] {
  const random = makeRng(seed), parts: BuildingPart[] = []
  const patch = (name: string, x: number, z: number, rx: number, rz: number, top: number, color: string) => {
    x = Math.max(-width/2+rx+.005, Math.min(width/2-rx-.005, x))
    z = Math.max(-depth/2+rz+.005, Math.min(depth/2-rz-.005, z))
    const vertices: number[] = [], sides = 5
    const ring = Array.from({length:sides},(_,i) => {
      const a=i*Math.PI*2/sides, rough=.7+random()*.3
      return [x+Math.cos(a)*rx*rough,z+Math.sin(a)*rz*rough]
    })
    for(let i=0;i<sides;i++) {
      const a=ring[i],b=ring[(i+1)%sides]
      vertices.push(x,top,z,a[0],.012,a[1],b[0],.012,b[1])
    }
    parts.push({name:`ground-${name}`,layer:"base",position:[0,0,0],vertices,color,outline:false,
      maxSceneryDetail:name.startsWith("rubble-") || name.startsWith("damp-earth-") ? 2 : 1})
  }
  for(let i=0;i<Math.ceil((width+depth)*5);i++) {
    const side=i%2 ? -1 : 1, alongX=i%4<2
    const x=alongX ? (random()-.5)*(width-.22) : side*(width/2-.08)
    const z=alongX ? side*(depth/2-.08) : (random()-.5)*(depth-.22)
    const r=.023+random()*.035
    patch(`gravel-${i}`,x,z,r,r*.8,.024+random()*.019,["#6b7068","#919285","#555d57","#a49c83"][i%4])
    if(i%4===0) patch(`damp-earth-${i}`,x,z,Math.min(.13,width*.08),Math.min(.10,depth*.08),.013,["#776951","#887656","#625b48"][i%3])
    if(i%7===0) patch(`rubble-${i}`,x,z,.085,.07,.05,["#777e72","#a2a08b","#59635c"][i%3])
  }
  // A few scattered chips break up broad dirt yards without forming a paved slab.
  for(let i=0;i<Math.ceil(width*depth*3);i++) {
    const x=(random()-.5)*(width-.2),z=(random()-.5)*(depth-.2),r=.016+random()*.02
    patch(`soil-chip-${i}`,x,z,r,r*.7,.02,["#82775e","#a39b83","#5b604e"][i%3])
  }
  return parts
}
