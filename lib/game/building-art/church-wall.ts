import type { BuildingPart, Vec3 } from "./geometry"
import { EARLY_MATERIALS as palette } from "./materials"

export const CHURCH_PLASTER = "#b3aa8e"
const plaster = CHURCH_PLASTER, plasterShade = "#a59d83"
export type ChurchOpening = { centre: number; sill: number; shoulder: number; radius: number }

/** Shared rubble, plaster and open arches for the church and its residential wing. */
export function churchWallBuilder(parts: BuildingPart[]) {
  const box = (name: string, layer: BuildingPart["layer"], position: Vec3, size: Vec3, color: string) =>
    parts.push({ name, layer, position, size, color, outline: false })
  const face = (name: string, layer: BuildingPart["layer"], vertices: number[], color: string) =>
    parts.push({ name, layer, position: [0, 0, 0], vertices, color, outline: false })

  // Build the material around actual holes. Faceted arches retain their shape
  // from all four cameras and have thickness at the sill and curved reveal.
  return function wall(name: string, axis: "x" | "z", edge: number, start: number, end: number,
    bottom: number, top: number, openings: ChurchOpening[], timber = false, layer: BuildingPart["layer"] = "wall") {
    const firstPart = parts.length
    const thickness = timber ? .065 : .11
    const at = (u: number, y: number, v: number): Vec3 => axis === "x" ? [edge + v, y, u] : [u, y, edge + v]
    const panel = (suffix: string, a: number, b: number, lo: number, hi: number) => {
      if (b <= a || hi <= lo) return
      const block = (id: string, u: number, y: number, w: number, h: number, thick: number, color: string) =>
        box(`${name}-${suffix}-${id}`,layer,at(u,y,0),axis === "x" ? [thick,h,w] : [w,h,thick],color)
      if (timber) {
        const count=Math.max(1,Math.ceil((b-a)/.11))
        for(let i=0;i<count;i++) block(`${i}`,a+(i+.5)*(b-a)/count,(lo+hi)/2,(b-a)/count-.006,hi-lo,thickness,i%3?palette.wood:palette.paleWood)
        return
      }
      const noise=(i:number)=>{const n=Math.sin(i*127.1+a*93.7+edge*31.9)*43758.5453;return n-Math.floor(n)}
      const stoneTop=Math.min(.4,hi)
      if(lo<stoneTop) {
        block("mortar",(a+b)/2,(lo+stoneTop)/2,b-a,stoneTop-lo,thickness,"#77796c")
        const rows=Math.ceil((stoneTop-lo)/.105),course=(stoneTop-lo)/rows
        for(let row=0;row<rows;row++) {
          let u=a,index=0
          while(u<b-.005) {
            const span=Math.min(b-u,.13+noise(row*31+index)*.15)
            block(`stone-${row}-${index}`,u+span/2,lo+(row+.5)*course,Math.max(.004,span-.009),course-.008,thickness+.008+noise(index+row)*.018,["#888b7c","#969888","#a2a18f","#7e8478"][Math.floor(noise(index+row*71)*4)])
            u+=span;index++
          }
        }
      }
      const base=Math.max(lo,.4)
      if(hi<=base) return
      block("plaster",(a+b)/2,(base+hi)/2,b-a,hi-base,thickness,plaster)
      const cols=Math.max(1,Math.ceil((b-a)/.21)),rows=Math.max(1,Math.ceil((hi-base)/.17))
      for(let row=0;row<rows;row++) for(let col=0;col<cols;col++) {
        const n=row*cols+col
        if(noise(n+91)>.55) continue
        const u=a+(col+.5)*(b-a)/cols,y=base+(row+.5)*(hi-base)/rows
        const w=(b-a)/cols*(.45+noise(n)*.35),h=(hi-base)/rows*(.35+noise(n+13)*.5)
        for(const side of [-1,1]) {
          const v=side*(thickness/2+.006+noise(n+5)*.008)
          face(`${name}-${suffix}-plaster-patch-${row}-${col}-${side}`,layer,[...at(u-w/2,y-h*.2,v),...at(u-w*.3,y+h/2,v),...at(u+w*.4,y+h*.35,v),...at(u-w/2,y-h*.2,v),...at(u+w*.4,y+h*.35,v),...at(u+w/2,y-h/2,v)],["#aaa289","#bcb297","#aea48a"][n%3])
        }
      }
    }
    let cursor = start
    for (const [index, opening] of openings.entries()) {
      const { centre, sill, shoulder, radius } = opening
      panel(`pier-${index}`, cursor, centre - radius, bottom, top)
      panel(`sill-wall-${index}`, centre - radius, centre + radius, bottom, sill)
      const arch: number[] = [], trim: number[] = []
      const steps = 10, trimWidth = timber ? .022 : .037
      for (let i = 0; i < steps; i++) {
        const a = Math.PI - i * Math.PI / steps, b = Math.PI - (i + 1) * Math.PI / steps
        const u0 = centre + Math.cos(a) * radius, u1 = centre + Math.cos(b) * radius
        const y0 = shoulder + Math.sin(a) * radius, y1 = shoulder + Math.sin(b) * radius
        for (const side of [-1, 1]) {
          const v = side * thickness / 2
          arch.push(...at(u0, y0, v), ...at(u1, y1, v), ...at(u1, top, v), ...at(u0, y0, v), ...at(u1, top, v), ...at(u0, top, v))
          const outer0 = at(centre + Math.cos(a) * (radius + trimWidth), shoulder + Math.sin(a) * (radius + trimWidth), v + side * .004)
          const outer1 = at(centre + Math.cos(b) * (radius + trimWidth), shoulder + Math.sin(b) * (radius + trimWidth), v + side * .004)
          trim.push(...at(u0, y0, v + side * .004), ...at(u1, y1, v + side * .004), ...outer1, ...at(u0, y0, v + side * .004), ...outer1, ...outer0)
        }
        arch.push(...at(u0, y0, -thickness / 2), ...at(u1, y1, -thickness / 2), ...at(u1, y1, thickness / 2),
          ...at(u0, y0, -thickness / 2), ...at(u1, y1, thickness / 2), ...at(u0, y0, thickness / 2))
      }
      face(`${name}-arch-${index}`, layer, arch, timber ? palette.wood : plasterShade)
      face(`${name}-arch-frame-${index}`, layer, trim, palette.darkWood)
      for (const side of [-1, 1]) {
        const size: Vec3 = [trimWidth, shoulder - sill, thickness + .012]
        box(`${name}-jamb-${index}-${side}`, layer, at(centre + side * (radius + trimWidth / 2), (sill + shoulder) / 2, 0), axis === "x" ? [size[2], size[1], size[0]] : size, palette.darkWood)
      }
      if (sill > bottom) box(`${name}-window-sill-${index}`, layer, at(centre, sill, 0), axis === "x" ? [thickness + .04, .035, radius * 2 + .08] : [radius * 2 + .08, .035, thickness + .04], palette.paleWood)
      cursor = centre + radius
    }
    panel("end", cursor, end, bottom, top)
    for(let i=firstPart;i<parts.length;i++) parts[i].cutawaySide=axis === "x" ? [Math.sign(edge),0] : [0,Math.sign(edge)]
  }

}
