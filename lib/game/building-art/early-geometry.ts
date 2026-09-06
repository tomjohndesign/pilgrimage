import { EARLY_MATERIALS as palette } from "./materials"
import type { BuildingPart, Vec3 } from "./geometry"
import type { BuildingRecipe } from "./style"

/** The relic rests on the same slab in the game and in the workshop. */
export const RELIC_TABLE_TOP = 0.44

/** Small early medieval structures built directly in tile units. No plot padding. */
export function earlyBuildingParts(recipe: BuildingRecipe): BuildingPart[] {
  const parts: BuildingPart[] = [], { width, depth, wallHeight: h, roofRise: rise, variant } = recipe
  const w = width / 2, d = depth / 2, floor = variant === "storehouse" ? 0.3 : 0.06
  let n = 0
  const random = () => { const v = Math.sin(++n * 127.1 + recipe.seed * 31.7) * 43758.5453; return v - Math.floor(v) }
  const box = (name: string, layer: BuildingPart["layer"], position: Vec3, size: Vec3, color: string, rotation?: Vec3, outline = true) => parts.push({ name, layer, position, size, color, rotation, outline })
  const face = (name: string, layer: BuildingPart["layer"], vertices: number[], color: string, outline = false) => parts.push({ name, layer, position: [0,0,0], vertices, color, outline })
  // Faceted roundwood. Taper and end grain remain visible without smooth cylinders.
  function pole(name: string, a: Vec3, b: Vec3, radius = 0.035, layer: BuildingPart["layer"] = "wall", color: string = palette.wood) {
    const axis = b.map((v,i) => v-a[i]), length = Math.hypot(...axis), u = axis.map(v => v/length)
    const helper = Math.abs(u[1]) > 0.9 ? [1,0,0] : [0,1,0]
    const cross = (a: number[], b: number[]) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
    const raw = cross(u,helper), v = raw.map(x => x/Math.hypot(...raw)), t = cross(u,v)
    const at = (point: Vec3, i: number, taper: number) => point.map((x,j) => x + radius*taper*(Math.cos(i*Math.PI/3)*v[j]+Math.sin(i*Math.PI/3)*t[j]))
    const vertices: number[] = []
    for(let i=0;i<6;i++) vertices.push(...at(a,i,1),...at(b,i,.85),...at(b,i+1,.85),...at(a,i,1),...at(b,i+1,.85),...at(a,i+1,1),...a,...at(a,i+1,1),...at(a,i,1),...b,...at(b,i,.85),...at(b,i+1,.85))
    face(name,layer,vertices,color)
  }
  // Clipped corners and shallow unequal tops make flags read as rough stone.
  function flag(name: string, x: number, z: number, sx: number, sz: number, y: number, thickness: number, color: string) {
    const c = Math.min(sx,sz)*(.12+random()*.13)
    const ring = [[-sx/2+c,-sz/2],[sx/2-c,-sz/2],[sx/2,-sz/2+c],[sx/2,sz/2-c],[sx/2-c,sz/2],[-sx/2+c,sz/2],[-sx/2,sz/2-c],[-sx/2,-sz/2+c]]
    const vertices: number[] = []
    for(let i=0;i<8;i++) { const a=ring[i],b=ring[(i+1)%8]; vertices.push(x,y+thickness,z,x+a[0],y+thickness,z+a[1],x+b[0],y+thickness,z+b[1], x+a[0],y,z+a[1],x+b[0],y,z+b[1],x+b[0],y+thickness,z+b[1], x+a[0],y,z+a[1],x+b[0],y+thickness,z+b[1],x+a[0],y+thickness,z+a[1]) }
    face(name,"base",vertices,color)
  }
  box("floor","base",[0,variant === "storehouse" ? floor-.025 : floor/2,0],[width-.04,variant === "storehouse" ? .05 : floor,depth-.04],variant === "enclosure" ? "#686857" : "#817052",undefined,false)

  // Screens: woven rods pass either side of stakes, with exposed patches of daub.
  function screen(name: string, a: Vec3, b: Vec3, height: number, daub = false) {
    const dx=b[0]-a[0], dz=b[2]-a[2], length=Math.hypot(dx,dz), steps=Math.max(2,Math.ceil(length/.24))
    if(variant === "storehouse") {
      const count=Math.max(1,Math.ceil(length/.09))
      for(let i=0;i<count;i++) {
        const heightHere=height*(.96+random()*.04)
        box(`${name}-plank-${i}`,"wall",[a[0]+dx*(i+.5)/count,floor+heightHere/2,a[2]+dz*(i+.5)/count],[Math.abs(dx)>.01?length/count-.008:.04,heightHere,Math.abs(dz)>.01?length/count-.008:.04],i%3?palette.wood:palette.paleWood,undefined,false)
      }
      return
    }
    if(daub) box(`${name}-earth`,"wall",[(a[0]+b[0])/2,floor+height*.43,(a[2]+b[2])/2],[Math.abs(dx)>.01?length:.065,height*.85,Math.abs(dz)>.01?length:.065],palette.earth,undefined,false)
    for(let i=0;i<=steps;i++) {const x=a[0]+dx*i/steps,z=a[2]+dz*i/steps;pole(`${name}-stake-${i}`,[x,floor,z],[x,floor+height+.035,z],.021)}
    const rows=Math.max(2,Math.floor(height/.07))
    for(let j=0;j<rows;j++) for(let i=0;i<steps;i++) {
      const bend=(j%2===i%2?1:-1)*.025
      pole(`${name}-weave-${j}-${i}`,[a[0]+dx*i/steps+dz/length*bend,floor+.04+j*.07,a[2]+dz*i/steps-dx/length*bend],[a[0]+dx*(i+1)/steps-dz/length*bend,floor+.04+j*.07+.009,a[2]+dz*(i+1)/steps+dx/length*bend],.009,"wall",j%3?palette.wattle:palette.darkWood)
    }
  }
  function bedding(x: number,z: number,index: number, length: number) {
    box(`straw-bed-${index}`,"base",[x,floor+.035,z],[.32,.07,length],palette.strawDark,undefined,false)
    box(`wool-cover-${index}`,"base",[x,floor+.08,z+.06],[.28,.035,length*.65],index%2?"#817864":"#716e57",undefined,false)
    box(`rolled-blanket-${index}`,"base",[x,floor+.1,z-length*.32],[.3,.11,.12],"#a3987a",undefined,false)
  }
  if(variant === "enclosure") {
    const nx=Math.ceil(width/.36),nz=Math.ceil(depth/.38)
    for(let row=0;row<nz;row++) for(let col=0;col<nx;col++) {
      const sx=(width-.1)/nx,sz=(depth-.1)/nz
      flag(`paving-${row}-${col}`,-w+.05+(col+.5)*sx,-d+.05+(row+.5)*sz,sx-.018-random()*.02,sz-.018-random()*.025,.032,.025+random()*.018,["#8f9083","#a19f90","#838779","#969485"][Math.floor(random()*4)])
    }
    // Four genuine gaps; gate leaves stand open inwards along the jambs.
    const opening=Math.min(.62,Math.min(width,depth)*.58)
    for(let side=0;side<4;side++) {
      const span=side%2?depth:width, edge=(side%2?w:d)-.055
      const point=(along:number, inward:number): Vec3 => side===0?[along,0,edge-inward]:side===1?[edge-inward,0,along]:side===2?[along,0,-edge+inward]:[-edge+inward,0,along]
      for(const sign of [-1,1]) {
        const start=sign*opening/2, end=sign*(span/2-.06), count=Math.max(1,Math.ceil(Math.abs(end-start)/.1))
        for(let i=0;i<count;i++) {const p=point(start+(end-start)*(i+.5)/count,0),height=h*(.85+random()*.23);box(`paling-${side}-${sign}-${i}`,"wall",[p[0],floor+height/2,p[2]],side%2?[.055,height,Math.abs(end-start)/count-.008]:[Math.abs(end-start)/count-.008,height,.055],[palette.wood,palette.paleWood,palette.darkWood][Math.floor(random()*3)],undefined,false)}
        for(const y of [.12,h*.75]) {const a=point(start,0),b=point(end,0);pole(`rail-${side}-${sign}-${y}`,[a[0],floor+y,a[2]],[b[0],floor+y,b[2]],.022)}
        const p=point(start,0);pole(`gatepost-${side}-${sign}`,[p[0],floor,p[2]],[p[0],floor+h+.1,p[2]],.034)
      }
      const cross = point(opening/2, 0)
      box(`gate-cross-upright-${side}`,"wall",[cross[0],floor+h+.15,cross[2]],[.03,.24,.03],palette.paleWood)
      box(`gate-cross-arm-${side}`,"wall",[cross[0],floor+h+.2,cross[2]],side%2?[.03,.03,.15]:[.15,.03,.03],palette.paleWood)
      const gateLength=Math.min(.38,span*.25), leaf=point(-opening/2,gateLength/2)
      box(`open-gate-${side}`,"wall",[leaf[0],floor+h*.43,leaf[2]],side%2?[gateLength,h*.75,.035]:[.035,h*.75,gateLength],palette.paleWood,undefined,false)
      for(const y of [.13,h*.67]) {const a=point(-opening/2,0),b=point(-opening/2,gateLength);pole(`gate-strap-${side}-${y}`,[a[0],floor+y,a[2]],[b[0],floor+y,b[2]],.013,"wall",palette.darkWood)}
    }
    const tableW=Math.min(.72,width*.43),tableD=Math.min(.46,depth*.4)
    for(const s of [-1,1]) flag(`table-trestle-${s}`,s*tableW*.3,0,.13,tableD*.8,floor,RELIC_TABLE_TOP-floor-.09,"#75796e")
    flag("relic-table",0,0,tableW,tableD,RELIC_TABLE_TOP-.09,.09,"#aeaa97")
    if(width>=2&&depth>=2) {
      for(let i=0;i<3;i++) box(`loose-plank-${i}`,"base",[-w+.45+i*.035,.094+i*.018,-d+.5],[.1,.026,.48],i%2?palette.paleWood:palette.wood,[0,.25+i*.27,0],false)
      flag("offcut-stone",w-.38,-d+.4,.18,.13,.06,.1,palette.stone)
      box("folded-cloth","base",[w-.42,.12,d-.42],[.25,.1,.19],"#8b8067",[0,.16,0],false)
      pole("spare-pole",[-w+.32,.1,d-.45],[-w+.78,.12,d-.3],.024,"base")
    }
    return parts
  }

  const x=w-.13,z=d-.13, eave=floor+h
  if(variant === "storehouse") {
    for(const a of [-x,x]) for(const b of [-z,z]) pole(`raised-leg-${a}-${b}`,[a,0,b],[a,eave,b],.045)
    for(let i=0;i<Math.ceil(width/.12);i++) box(`floor-board-${i}`,"base",[-w+.07+i*(width-.14)/Math.max(1,Math.ceil(width/.12)-1),floor+.025,0],[.085,.045,depth-.12],palette.paleWood,undefined,false)
    box("grain-sack","base",[0,floor+.16,-depth*.12],[Math.min(.3,width*.3),.27,Math.min(.25,depth*.3)],"#a29978",undefined,false)
  } else for(const a of [-x,x]) for(const b of [-z,z]) pole(`earthfast-post-${a}-${b}`,[a,0,b],[a,eave+(variant === "wood-shelter" && b < 0 ? rise : 0)+.06,b],.043)

  if(variant === "shepherd-hut" || variant === "storehouse") {
    const door=Math.min(.44,width*.5), left=(width-.26-door)/2
    screen("rear",[-x,0,-z],[x,0,-z],h,true)
    for(const a of [-x,x]) screen(`side-${a}`,[a,0,-z],[a,0,z],h,variant!=="storehouse")
    if(left>0) {screen("front-left",[-x,0,z],[-door/2,0,z],h,true);screen("front-right",[door/2,0,z],[x,0,z],h,true)}
    box("doorway-shadow","wall",[0,floor+h*.45,z-.035],[door,h*.9,.025],"#3f392c",undefined,false)
    for(let i=0;i<4;i++) box(`door-board-${i}`,"wall",[-door*.38+i*door*.24,floor+h*.43,z+.013],[door*.22,h*.86,.025],i%2?palette.wood:palette.paleWood,undefined,false)
    for(const y of [.2,.7]) box(`door-rail-${y}`,"wall",[0,floor+h*y,z+.04],[door,.04,.03],palette.darkWood,undefined,false)
    if(variant === "shepherd-hut") bedding(-width*.2,-depth*.15,0,Math.min(.7,depth*.6))
  } else {
    screen("rear",[-x,0,-z],[x,0,-z],h*.9)
    for(const a of [-x,x]) screen(`windbreak-${a}`,[a,0,-z],[a,0,z*.3],h*.6)
    if(variant === "monk-shelter") {
      const beds=Math.max(1,Math.floor((width-.3)/.55))
      for(let i=0;i<beds;i++) bedding((i-(beds-1)/2)*.5,-depth*.08,i,Math.min(.72,depth*.6))
    } else {
      for(let row=0;row<3;row++) for(let i=0;i<Math.max(2,Math.floor(width/.14)-3-row);i++) {
        const count=Math.max(2,Math.floor(width/.14)-3-row),px=(i-(count-1)/2)*.12
        pole(`firewood-${row}-${i}`,[px,floor+.065+row*.085,-depth*.2],[px+.008,floor+.065+row*.085,depth*.18],.052,"base",i%3?palette.wood:palette.paleWood)
      }
    }
  }
  // Lapped bundles: visibly stepped edges, fine strokes following the fall of straw.
  const lean=variant === "wood-shelter", roofX=w-.05,roofZ=d-.045
  function roofSide(sign: number) {
    const slope=Math.hypot(lean?depth-.09:roofX,rise), bands=Math.max(3,Math.ceil(slope/.23)), bundles=Math.max(3,Math.ceil((lean?width-.1:depth-.09)/.2))
    const at=(t:number,along:number,lift:number): Vec3 => lean?[along,eave+rise*(1-t)+lift,-roofZ+2*roofZ*t]:[sign*roofX*t,eave+rise*(1-t)+lift,along]
    const span=lean?roofX:roofZ
    const grain:number[]=[]
    for(let row=0;row<bands;row++) for(let col=0;col<bundles;col++) {
      const t0=Math.max(0,row/bands-.035),t1=Math.min(.99,(row+1)/bands+.028+random()*.01),a=-span+col*2*span/bundles,b=-span+(col+1)*2*span/bundles-.004
      const lift=.025+(bands-row)*.009+random()*.006
      const A=at(t0,a,lift),B=at(t1,a,lift),C=at(t1,b,lift),D=at(t0,b,lift)
      face(`thatch-bundle-${sign}-${row}-${col}`,"roof",[...A,...B,...C,...A,...C,...D],[palette.straw,"#ae996b","#a59164"][Math.floor(random()*3)])
      for(let i=0;i<3;i++) {const z0=a+(b-a)*(i+.4)/3,start=t0+(t1-t0)*random()*.2,end=t1-.007;grain.push(...at(start,z0,lift+.004),...at(end,z0,lift+.004),...at(end,z0+.004,lift+.004))}
      // Fringed cut end gives each course a physical thickness.
      face(`thatch-fringe-${sign}-${row}-${col}`,"roof",[...B,...at(t1,a,lift-.025),...at(t1,b,lift-.025),...B,...at(t1,b,lift-.025),...C],palette.strawDark)
    }
    face(`thatch-grain-${sign}`,"roof",grain,"#91805b")
  }
  if(lean) roofSide(1); else {roofSide(-1);roofSide(1)}
  for(const side of [-1,1]) {
    pole(`eave-pole-${side}`,[-x,eave,side*z],[x,eave,side*z],.037,"roof")
    if(!lean) {
      pole(`rafter-left-${side}`,[-roofX+.025,eave,side*z],[0,eave+rise+.018,side*z],.036,"roof")
      pole(`rafter-right-${side}`,[roofX-.025,eave,side*z],[0,eave+rise+.018,side*z],.036,"roof")
    }
  }
  if(!lean) {
    if(variant === "monk-shelter") {
      // Plain pegged wooden crosses at both gable ends; no ornament on utility huts.
      for(const end of [-1,1]) {
        box(`shelter-cross-upright-${end}`,"roof",[0,eave+rise+.13,end*z],[.04,.32,.04],palette.paleWood)
        box(`shelter-cross-arm-${end}`,"roof",[0,eave+rise+.2,end*z],[.2,.04,.04],palette.paleWood)
      }
    }
    pole("ridge-pole",[0,eave+rise+.045,-roofZ+.04],[0,eave+rise+.045,roofZ-.04],.045,"roof",palette.darkWood)
    if(variant === "shepherd-hut" || variant === "storehouse") for(const s of [-1,1]) {
      face(`woven-gable-${s}`,"roof",[-x,eave,s*z,x,eave,s*z,0,eave+rise-.045,s*z],palette.wattle)
      pole(`gable-post-${s}`,[0,eave,s*z],[0,eave+rise,s*z],.029,"roof")
    }
  }
  return parts
}
