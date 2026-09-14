import type { BuildingPart, Vec3 } from "./geometry"
import { makeRng } from "../rng"

/** Closely laid roundwood runs the full slope, with exposed ends and no tile courses. */
export function poleRoofSurface(highLeft: Vec3, highRight: Vec3, lowLeft: Vec3, lowRight: Vec3,
  seed: number, name = "1", edges = { left: true, right: true, low: true }): BuildingPart[] {
  const parts: BuildingPart[] = [], random = makeRng(seed)
  const at = (t: number, u: number, lift: number): Vec3 => highLeft.map((v, i) =>
    (v + (lowLeft[i] - v) * t) * (1 - u) + (highRight[i] + (lowRight[i] - highRight[i]) * t) * u + (i === 1 ? lift : 0)) as Vec3
  const quad = (a: Vec3,b: Vec3,c: Vec3,d: Vec3) => [...a,...b,...c,...a,...c,...d]
  const face = (suffix: string, vertices: number[], color: string, accent = false) => parts.push({
    name: `pole-roof-${suffix}-${name}`, layer: "roof", position: [0,0,0], vertices, color, outline: false, playerAccent: accent,
  })
  face("underlay",quad(at(0,0,.02),at(1,0,.02),at(1,1,.02),at(0,1,.02)),"#78684e")
  const span = Math.hypot(...highLeft.map((v,i)=>v-highRight[i])), count = Math.max(2,Math.ceil(span/.105))
  for(let i=0;i<count;i++) {
    const a=i/count,b=(i+1)/count, crown=.055+random()*.012
    for(let facet=0;facet<3;facet++) {
      const u=a+(b-a)*facet/3,v=a+(b-a)*(facet+1)/3
      const lift=(f:number)=>.025+Math.sin(f*Math.PI/3)*crown
      face(`stick-${i}-${facet}`,quad(at(0,u,lift(facet)),at(1,u,lift(facet)),at(1,v,lift(facet+1)),at(0,v,lift(facet+1))),
        ["#8a775a","#ab9270","#968060"][facet])
    }
    if(edges.low) face(`end-${i}`,quad(at(1,a,.025),at(1,b,.025),at(1,b-(b-a)/3,crown+.025),at(1,a+(b-a)/3,crown+.025)),"#bba17c")
  }
  if(edges.low) face("fascia",quad(at(1,0,.015),at(1,1,.015),at(1,1,-.065),at(1,0,-.065)),"#897957",true)
  return parts
}
