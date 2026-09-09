import type { BuildingPart, Vec3 } from "./geometry"
import { EARLY_MATERIALS as palette } from "./materials"

/** Broad, uneven straw bundles suggest long stalks without subpixel hatching. */
export function thatchSurface(highLeft: Vec3, highRight: Vec3, lowLeft: Vec3, lowRight: Vec3,
  seed: number, name = "1", edges: { left: boolean; right: boolean; low: boolean } = { left: true, right: true, low: true }): BuildingPart[] {
  const parts: BuildingPart[] = []
  let serial = 0
  const random = () => { const n = Math.sin(++serial*127.1+seed*31.7)*43758.5453; return n-Math.floor(n) }
  const mix = (a: Vec3,b: Vec3,t: number): Vec3 => a.map((v,i) => v+(b[i]-v)*t) as Vec3
  const length = Math.hypot(...highLeft.map((v,i) => v-lowLeft[i]))
  const width = Math.max(Math.hypot(...highLeft.map((v,i) => v-highRight[i])),Math.hypot(...lowLeft.map((v,i) => v-lowRight[i])))
  const at = (t: number,u: number,lift: number): Vec3 => {
    u=Math.max(0,Math.min(1,u))
    // Small inward scallops soften the outline without entering neighbouring tiles.
    const edgeT=Math.max(0,(t-.8)/.2)**2
    const sharedEdge = (!edges.left ? (1-u)**8 : 0) + (!edges.right ? u**8 : 0)
    const trimT=edges.low ? Math.min(.08,(.025+.012*Math.sin(u*23+seed)) / length) * (1-sharedEdge) : 0
    const trimU=(u<.5 ? edges.left : edges.right) ? Math.min(.12,(.022+.012*Math.sin(t*19+seed)) / width) : 0
    const pt=t-edgeT*trimT, pu=u+(1-2*u)*Math.abs(2*u-1)**8*trimU
    const p = mix(mix(highLeft,lowLeft,pt),mix(highRight,lowRight,pt),pu)
    const seamLift = lift >= .1 ? lift + (.16-lift)*sharedEdge : lift
    return [p[0],p[1]+seamLift*.55,p[2]]
  }
  const face = (suffix: string,vertices: number[],color: string) => parts.push({
    name: `thatch-${suffix}-${name}`, layer: "roof", position: [0,0,0], vertices, color, outline: false,
  })
  const quad = (a: Vec3,b: Vec3,c: Vec3,d: Vec3) => [...a,...b,...c,...a,...c,...d]
  const courses = Math.max(1,Math.ceil(length/.95)), bundles = Math.max(2,Math.ceil(width/.6))
  // Keep the perimeter aligned for adjoining modules; variation stays inside it.
  const underlay: number[] = [], eave: number[] = []
  const edgeSteps=Math.max(3,Math.ceil(width/.22))
  for(let i=0;i<edgeSteps;i++) {
    const a=i/edgeSteps,b=(i+1)/edgeSteps
    underlay.push(...quad(at(0,a,.045),at(1,a,.045),at(1,b,.045),at(0,b,.045)))
    eave.push(...quad(at(1,a,.14),at(1,b,.14),at(1,b,.015),at(1,a,.015)))
  }
  face("underlay",underlay,palette.strawDark)
  if (edges.low) face("eave",eave,"#917d57")
  const verges = [edges.left ? 0 : -1, edges.right ? 1 : -1].filter(u=>u>=0)
  for(const u of verges) {
    const verge:number[]=[],steps=Math.max(3,Math.ceil(length/.25))
    for(let i=0;i<steps;i++) {
      const a=i/steps,b=(i+1)/steps
      verge.push(...quad(at(a,u,.16-.03*a),at(b,u,.16-.03*b),at(b,u,.015),at(a,u,.015)))
    }
    face(`verge-${u}`,verge,"#97835c")
  }
  // Broken end grain on the thick mattress, sized to the existing world pixel grid.
  const edgeGrain: number[] = [], exposed: number[] = []
  for(let i=0;i<(edges.low ? Math.ceil(width*9) : 0);i++) {
    const u=random()*.97, du=Math.min(.025/width,1-u), top=.085+random()*.05
    edgeGrain.push(...quad(at(1,u,top),at(1,u,.025+random()*.035),at(1,u+du,.035),at(1,u+du,top)))
  }
  for(const u of verges) for(let i=0;i<Math.ceil(length*5);i++) {
    const t=random()*.97, dt=Math.min(.05/length,1-t), y=.065+random()*.04
    edgeGrain.push(...quad(at(t,u,y),at(t+dt,u,y-.012),at(t+dt,u,y+.02),at(t,u,y+.025)))
  }
  face("edge-grain",edgeGrain,"#af986a")
  const grain: number[] = []
  for(let row=0;row<courses;row++) {
    const edges = Array.from({length: bundles+1},(_,i) => i === 0 ? 0 : i === bundles ? 1 : (i+(random()-.5)*.45)/bundles)
    for(let col=0;col<bundles;col++) {
      const t0 = Math.max(0,(row-.28)/courses)
      const t1 = row === courses-1 ? 1 : (row+1+(random()-.5)*.26)/courses
      const u0 = edges[col], u1 = edges[col+1], lift = .13+.04*(1-row/courses)
      face(`bundle-${row}-${col}`,quad(at(t0,u0,lift),at(t1,u0,lift),at(t1,u1,lift),at(t0,u1,lift)),["#ae986b","#b29c6f","#b09a6d"][Math.floor(random()*3)])
      // Short, staggered lips replace the dark ruler-straight seams.
      face(`fringe-${row}-${col}`,quad(at(t1,u0,lift),at(t1,u0,lift-.035),at(t1,u1,lift-.035),at(t1,u1,lift)),"#a18b60")
      // One broad tapered tuft per bundle, with generous quiet areas between tufts.
      const u = u0+(u1-u0)*(.15+random()*.45), tuftWidth = Math.min((u1-u0)*.25,.085/width)
      const start = t0+(t1-t0)*(.04+random()*.12), end = t1-(t1-t0)*random()*.12
      grain.push(...quad(at(start,u,lift+.002),at(end,u-tuftWidth*.2,lift+.002),at(end,u+tuftWidth,lift+.002),at(start,u+tuftWidth*.4,lift+.002)))
      if(col%3 === row%3) {
        // Expose just a few stalk-group edges running back up the pitch.
        const top=start+(end-start)*.35,edgeWidth=Math.min(.018/width,(u1-u0)*.12)
        exposed.push(...quad(at(top,u,lift+.004),at(end,u-tuftWidth*.2,lift+.004),at(end,u-tuftWidth*.2+edgeWidth,lift+.004),at(top,u+edgeWidth,lift+.004)))
      }
    }
  }
  face("grain",grain,"#b9a477")
  if(exposed.length) face("uphill-edges",exposed,"#9f885e")
  return parts
}
