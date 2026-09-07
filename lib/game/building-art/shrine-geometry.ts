import { buildingParts, type BuildingPart, type Vec3 } from "./geometry"
import { DEFAULT_RECIPE, earlyBuildingRecipe } from "./style"
import { shrineAltarZ, shrineKneelers, KNEELER_PAD_TOP } from "../shrine-layout"
import { EARLY_MATERIALS as palette } from "./materials"

/** A plastered shrine with one door, arched openings and a timber upper nave. */
export function shrineStructureParts(width: number, depth: number): BuildingPart[] {
  const altarZ = shrineAltarZ(depth)
  const parts = buildingParts({ ...DEFAULT_RECIPE, width, depth })
    .filter(p => p.name === "floor" || p.name.startsWith("paving-") || p.name === "relic-table" || p.name.startsWith("table-trestle-"))
  for (const p of parts) if (p.name === "relic-table" || p.name.startsWith("table-trestle-")) p.position = [0, 0, altarZ]
  const box = (name: string, layer: BuildingPart["layer"], position: Vec3, size: Vec3, color: string = palette.wood) =>
    parts.push({ name, layer, position, size, color, outline: false })
  const face = (name: string, layer: BuildingPart["layer"], vertices: number[], color: string) =>
    parts.push({ name, layer, position: [0, 0, 0], vertices, color, outline: false })

  const wallX = width / 2 - .13, wallZ = depth / 2 - .13
  const eave = 1.18, naveBase = 1.59, naveEave = 2.04, upperRise = .4
  const naveWidth = width * .48, naveX = naveWidth / 2 - .13
  const plaster = "#b3aa8e", plasterShade = "#a59d83"
  type Opening = { centre: number; sill: number; shoulder: number; radius: number }

  // Build the material around actual holes. Faceted arches retain their shape
  // from all four cameras and have thickness at the sill and curved reveal.
  function wall(name: string, axis: "x" | "z", edge: number, start: number, end: number,
    bottom: number, top: number, openings: Opening[], timber = false, layer: BuildingPart["layer"] = "wall") {
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

  const windowCount = Math.max(1, Math.floor(depth / 1.4))
  const windows: Opening[] = Array.from({ length: windowCount }, (_, i) => ({ centre: (i - (windowCount - 1) / 2) * depth * .3, sill: .4, shoulder: .72, radius: .17 }))
  for (const side of [-1, 1]) {
    wall(`side-wall-${side}`, "x", side * wallX, -wallZ, wallZ, 0, eave, windows)
    wall(`upper-timber-${side}`, "x", side * naveX, -wallZ, wallZ, naveBase, naveEave,
      windows.map(w => ({ ...w, sill: naveBase + .09, shoulder: naveBase + .24, radius: .095 })), true, "wall")
    box(`nave-bottom-beam-${side}`, "roof", [side * naveX, naveBase, 0], [.09, .065, wallZ * 2], palette.darkWood)
    box(`nave-top-beam-${side}`, "roof", [side * naveX, naveEave, 0], [.09, .065, wallZ * 2], palette.darkWood)
    box(`side-sill-${side}`, "wall", [side * wallX, .045, 0], [.12, .09, wallZ * 2], palette.stone)
    for (const end of [-1, 1]) box(`corner-post-${side}-${end}`, "wall", [side * wallX, eave / 2, end * wallZ], [.09, eave, .09])
  }
  wall("entrance", "z", wallZ, -wallX, wallX, 0, eave, [{ centre: 0, sill: 0, shoulder: .83, radius: .31 }])
  wall("rear-wall", "z", -wallZ, -wallX, wallX, 0, eave, [{ centre: 0, sill: .4, shoulder: .77, radius: .17 }])
  for (const end of [-1, 1]) {
    // The front and rear of the raised volume rise directly from the lower walls.
    wall(`nave-end-${end}`, "z", end * wallZ, -naveX, naveX, eave, naveBase, [])
    wall(`upper-timber-end-${end}`, "z", end * wallZ, -naveX, naveX, naveBase, naveEave, [], true, "wall")
    face(`upper-gable-${end}`, "wall", [-naveX, naveEave, end * wallZ, naveX, naveEave, end * wallZ, 0, naveEave + upperRise, end * wallZ], palette.paleWood)
    // Close the triangular wall below each lower lean-to, with no extra doors.
    for (const side of [-1, 1]) face(`aisle-gable-${end}-${side}`, "wall", [side * naveX, eave, end * wallZ, side * wallX, eave, end * wallZ, side * naveX, naveBase, end * wallZ], plaster)
  }

  // The two lower roof slopes stop at the timber nave, leaving the middle open.
  const roofX = width / 2 - .05
  const lower = buildingParts({ ...earlyBuildingRecipe("monk-shelter"), width, depth, wallHeight: eave, roofRise: .65 })
    .filter(p => p.name.startsWith("thatch-"))
    .map(p => ({ ...p, name: `lower-${p.name}`, vertices: p.vertices!.map((v, i) => i % 3 === 0
      ? (v < 0 || v === 0 && p.name.includes("--1") ? -1 : 1) * (naveX + Math.abs(v) / roofX * (roofX - naveX))
      : i % 3 === 1 ? eave + (v - eave) * (naveBase - eave) / .65 : v) }))
  const raised = buildingParts({ ...earlyBuildingRecipe("monk-shelter"), width: naveWidth, depth, wallHeight: naveEave, roofRise: upperRise })
    .filter(p => p.layer === "roof" && !p.name.startsWith("shelter-cross-"))
    .map(p => ({ ...p, name: `raised-nave-${p.name}` }))
  box("roof-cross-upright", "roof", [0, naveEave + upperRise + .21, wallZ], [.07, .5, .065], palette.paleWood)
  box("roof-cross-arm", "roof", [0, naveEave + upperRise + .3, wallZ], [.3, .065, .065], palette.paleWood)

  const steepleZ=-wallZ+.3, ridge=naveEave+upperRise
  box("steeple-foot", "roof", [0,ridge+.09,steepleZ], [.4,.18,.4],palette.darkWood)
  for(const x of [-.14,.14]) for(const z of [-.14,.14]) box(`steeple-post-${x}-${z}`,"roof",[x,ridge+.32,steepleZ+z],[.055,.35,.055],palette.paleWood)
  const cap: number[]=[]
  for(const [ax,az,bx,bz] of [[-.24,-.24,.24,-.24],[.24,-.24,.24,.24],[.24,.24,-.24,.24],[-.24,.24,-.24,-.24]]) cap.push(ax,ridge+.49,steepleZ+az,bx,ridge+.49,steepleZ+bz,0,ridge+.75,steepleZ)
  face("steeple-cap","roof",cap,palette.darkWood)
  box("steeple-cross-upright","roof",[0,ridge+1.02,steepleZ],[.085,.75,.08],palette.paleWood)
  box("steeple-cross-arm","roof",[0,ridge+1.15,steepleZ],[.47,.085,.08],palette.paleWood)

  for (const kneeler of shrineKneelers(width,depth)) {
    const {x,z,length,id}=kneeler
    box(`${id}-pad`, "interior", [x, KNEELER_PAD_TOP-.003, z-.07], [length, .006, .2], "#9d8865")
    parts[parts.length - 1].support = { clips: ["praying"], anchorOffset: [0, .07], heading: Math.PI }
    for (const end of [-1, 1]) {
      box(`${id}-foot-${end}`, "interior", [x+end*length*.36,.004,z-.1], [.075,.008,.46], palette.darkWood)
      box(`${id}-post-${end}`, "interior", [x+end*length*.42,.18,z-.27], [.045,.36,.045])
    }
    box(`${id}-prayer-rail`, "interior", [x,.36,z-.27], [length+.04,.045,.13], palette.paleWood)
  }
  for(const side of [-1,1]) {
    const x=side*.73,z=altarZ+.08
    box(`candle-stand-foot-${side}`,"interior",[x,.035,z],[.24,.07,.24],palette.darkWood)
    box(`candle-stand-stem-${side}`,"interior",[x,.31,z],[.055,.55,.055],"#777568")
    box(`candle-stand-tray-${side}`,"interior",[x,.6,z],[.29,.04,.13],"#96865c")
    for(let i=0;i<3;i++) {
      const px=x+(i-1)*.09,height=.1+i*.035
      box(`candle-${side}-${i}`,"interior",[px,.62+height/2,z],[.045,height,.045],"#e1c995")
      box(`candle-flame-${side}-${i}`,"interior",[px,.65+height,z],[.028,.06,.028],"#ffcf65")
    }
  }
  return [...parts, ...lower, ...raised]
}
