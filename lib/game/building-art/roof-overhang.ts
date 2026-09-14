import type { BuildingPart } from "./geometry"

/** Extra projection beyond the occupied tiles; ground footprints stay unchanged. */
export const ROOF_OVERHANG = .1
interface Join { side: number; from: number; to: number }

/** Extend coverings and their edge timbers, leaving chimneys, walls and contacts
 * fixed. Shared roof seams and church attachment edges retain their exact joins. */
export function roofOverhang(parts: BuildingPart[], width: number, depth: number, joins: readonly Join[] = [], attachedFront = false): BuildingPart[] {
  const point = (x:number,z:number): [number,number] => {
    const shared = joins.some(j=>Math.sign(x)===j.side && z>=j.from-.001 && z<=j.to+.001)
    const atSeam = shared && Math.abs(x)>=width/2-.25
    return [x+(shared ? 0 : x/(width/2)*ROOF_OVERHANG),
      z+(atSeam || attachedFront && z>0 ? 0 : z/(depth/2)*ROOF_OVERHANG)]
  }
  return parts.map(part=>{
    if(part.layer!=="roof" || /chimney|steeple|cross|gable|market-cloth/.test(part.name)) return part
    if(part.vertices) {
      const vertices=[...part.vertices]
      for(let i=0;i<vertices.length;i+=3) {
        const [x,z]=point(vertices[i]+part.position[0],vertices[i+2]+part.position[2])
        vertices[i]=x-part.position[0];vertices[i+2]=z-part.position[2]
      }
      return {...part,vertices}
    }
    const [x,z]=point(part.position[0],part.position[2])
    return {...part,position:[x,part.position[1],z] as [number,number,number],
      ...(part.size ? {size:[part.size[0]*(1+ROOF_OVERHANG/(width/2)),part.size[1],part.size[2]*(1+ROOF_OVERHANG/(depth/2))] as [number,number,number]} : {})}
  })
}
