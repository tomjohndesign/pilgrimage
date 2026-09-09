import { tavernLayout } from "../tavern-layout"
import { marketLayout } from "../market-layout"
import { EARLY_MATERIALS as palette } from "./materials"
import type { BuildingPart, Vec3 } from "./geometry"
import type { BuildingRecipe } from "./style"
import { furnishingParts, hearthParts, shelterHearth, hasDomesticHearth } from "./furnishings"
import { hasDirtFloor } from "./dirt-floor"
import { buildingDoorOffset } from "../building-rotation"
import { workshopLayout, sheepPenLayout } from "../workshop-layout"
import { BUILDING_FLOOR_TOP, BUILDING_DOOR_HEIGHT, roofProfile, hasFrontAwning } from "./dimensions"
import { thatchSurface } from "./thatch"
import { marketCanopyParts } from "./cloth"
import { buildingWeathering } from "./weathering"

/** The relic rests on the same slab in the game and in the workshop. */
export const RELIC_TABLE_TOP = 0.44

/** A house sleeps this many settlers; the beds themselves decide the residency. */
export const HOUSE_BEDS = 2

export type SettlementBuildingType = "shelter" | "workshop" | "hall" | "garden" | "cross" | "lumberCamp" | "market" | "guard-post" | "sheep-pen"
type ConstructionRecipe = Omit<BuildingRecipe, "variant"> & {
  /** "signpost" is scenery the generator places, not anything the player builds. */
  variant: BuildingRecipe["variant"] | SettlementBuildingType | "signpost"
  /** The shrine's raised nave retains its bespoke gabled construction. */
  roofForm?: "single-plane" | "gable"
}

/** Small early medieval structures built directly in tile units. No plot padding. */
export function earlyBuildingParts(recipe: ConstructionRecipe): BuildingPart[] {
  const parts: BuildingPart[] = [], { width, depth, variant } = recipe
  if (variant === "market" && depth > 2) {
    const layout = marketLayout(width, depth)
    const stall = earlyBuildingParts({ ...recipe, depth: layout.stallDepth }).map(part => ({
      ...part, position: [part.position[0], part.position[1], part.position[2] + layout.stallZ] as Vec3,
    }))
    // Open sides let the wagon pull through. The low rear rail marks the bay
    // without enclosing the horse under the cloth or obstructing its shafts.
    const box = (name: string, position: Vec3, size: Vec3, color: string): BuildingPart =>
      ({ name, layer: "base", position, size, color, outline: false })
    return [...stall,
      { ...box("cart-yard", [0, BUILDING_FLOOR_TOP - .025, layout.yardZ], [width - .04, .05, layout.yardDepth - .04], "#ffffff"), surface: "trail" },
      ...[-1, 1].map(side => box(`hitching-post-${side}`, [side * (width / 2 - .2), .28, -depth / 2 + .12], [.09, .56, .09], palette.wood)),
      box("hitching-rail", [0, .42, -depth / 2 + .12], [width - .3, .075, .075], palette.wood),
    ]
  }
  const floor = variant === "storehouse" ? 0.3 : 0
  const h=recipe.wallHeight, rise=recipe.roofRise
  const w = width / 2, d = depth / 2, rampStart = depth / 2 - Math.min(.65, depth * .43)
  const lean = recipe.roofForm !== "gable", eave = floor + h
  const awning = lean && hasFrontAwning(variant)
  const closed = lean && (variant === "house" || variant === "hall" || variant === "tavern")
  const profile = roofProfile(depth,rise,awning)
  const roofY = (_x: number, z = 0) => eave + (variant === "market" ? .48 : profile.height(z))
  function roofRectangle(name: string, left: number, right: number, back: number, front: number) {
    const breaks=[back,...profile.breaks.filter(z=>z>back && z<front),front]
    for(let i=0;i<breaks.length-1;i++) {
      const a=breaks[i], b=breaks[i+1], high=roofY(0,a)>roofY(0,b)?a:b, low=high===a?b:a
      parts.push(...thatchSurface([left,roofY(left,high),high],[right,roofY(right,high),high],
        [left,roofY(left,low),low],[right,roofY(right,low),low],recipe.seed,breaks.length===2?name:`${name}-${i}`))
    }
  }
  const doorX=buildingDoorOffset(width,variant)
  const doorHead = Math.max(BUILDING_DOOR_HEIGHT,h*.9)
  const browHalf = Math.min(w-Math.abs(doorX)-.045,variant === "tavern" ? .68 : variant === "hall" ? .58 : .48), browDepth = Math.min(depth*(variant === "tavern" ? .45 : .7),1.05)
  const browY = (x: number,z: number,end = 1) => {
    const v=d-z, arch=Math.sqrt(Math.max(0,1-((x-doorX)/browHalf)**2))
    return roofY(x,end*z)+.095+Math.max(0,doorHead+(variant === "tavern" && end===1 ? .78 : .26)-(eave+.095))*arch*Math.max(0,1-v/browDepth)**2
  }
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
  // A wayside marker, not a building: no floor slab and no tile-square footing.
  // The board points along local +X; the map turns it onto the shrine's bearing.
  if (variant === "signpost") {
    const board = { back: -.055, tip: .4, nose: .12, low: h - .31, high: h - .12, half: .024 }
    const packing = [[-.085,-.055,.11,.1],[.075,.05,.1,.085],[.015,-.09,.085,.08],[-.06,.075,.08,.075]]
    packing.forEach(([x,z,sx,sz],i) => flag(`signpost-stone-${i}`,x,z,sx,sz,-.012,.035+random()*.018,palette.stone))
    pole("signpost-post",[0,0,0],[0,h,0],.056)
    // Riven board: a five-sided profile in X/Y extruded through its thickness,
    // so the far end comes to a real point rather than a sawn-off plank end.
    const profile = [[board.back,board.low],[board.tip-board.nose,board.low],[board.tip,(board.low+board.high)/2],[board.tip-board.nose,board.high],[board.back,board.high]]
    const vertices: number[] = []
    for (let i=1;i<profile.length-1;i++) {
      const a=profile[0],b=profile[i],c=profile[i+1]
      vertices.push(a[0],a[1],board.half,b[0],b[1],board.half,c[0],c[1],board.half,
        a[0],a[1],-board.half,c[0],c[1],-board.half,b[0],b[1],-board.half)
    }
    for (let i=0;i<profile.length;i++) {
      const a=profile[i],b=profile[(i+1)%profile.length]
      vertices.push(a[0],a[1],-board.half,b[0],b[1],-board.half,b[0],b[1],board.half,
        a[0],a[1],-board.half,b[0],b[1],board.half,a[0],a[1],board.half)
    }
    face("signpost-board","wall",vertices,palette.paleWood,true)
    box("signpost-peg","wall",[0,(board.low+board.high)/2,board.half+.013],[.03,.03,.026],palette.darkWood,undefined,false)
    // The cross says whose road this is; the board says which way along it. Its
    // arms lie across the board, so whichever of the two the camera foreshortens
    // the other stands broadside and the marker never reads as a bare stake.
    const head = "#a58c66"
    box("signpost-cross-upright","wall",[0,h+.11,0],[.052,.24,.06],head)
    box("signpost-cross-arm","wall",[0,h+.155,0],[.052,.058,.26],head)
    box("signpost-cross-peg","wall",[.031,h+.155,0],[.022,.03,.03],palette.darkWood,undefined,false)
    for (const side of [-1,1]) pole(`signpost-grain-${side}`,[side*.014,.1,.044],[side*.011,h-.05,.038],.004,"wall",palette.darkWood)
    return parts
  }
  // Bury slab thickness below the walking plane; inset the store platform for its ramp.
  box("floor","base",[0,(variant === "storehouse" ? floor : BUILDING_FLOOR_TOP)-.025,variant === "storehouse" ? (rampStart-d+.02)/2 : 0],[width-.04,.05,variant === "storehouse" ? rampStart+d-.02 : depth-.04],variant === "enclosure" ? "#686857" : "#817052",undefined,false)
  if (hasDirtFloor(variant)) {
    parts[0].surface = "trail"
    parts[0].color = "#ffffff"
  }

  // Screens: woven rods pass either side of stakes, with exposed patches of daub.
  function screen(name: string, a: Vec3, b: Vec3, height: number, daub = false) {
    const dx=b[0]-a[0], dz=b[2]-a[2], length=Math.hypot(dx,dz), steps=Math.max(2,Math.ceil(length/.24))
    if(daub) box(`${name}-earth`,"wall",[(a[0]+b[0])/2,floor+height*.43,(a[2]+b[2])/2],[Math.abs(dx)>.01?length:.065,height*.85,Math.abs(dz)>.01?length:.065],palette.earth,undefined,false)
    for(let i=0;i<=steps;i++) {const x=a[0]+dx*i/steps,z=a[2]+dz*i/steps;pole(`${name}-stake-${i}`,[x,floor,z],[x,floor+height+.035,z],.021)}
    const rows=Math.max(2,Math.floor(height/.07))
    for(let j=0;j<rows;j++) for(let i=0;i<steps;i++) {
      const bend=(j%2===i%2?1:-1)*.025
      pole(`${name}-weave-${j}-${i}`,[a[0]+dx*i/steps+dz/length*bend,floor+.04+j*.07,a[2]+dz*i/steps-dx/length*bend],[a[0]+dx*(i+1)/steps-dz/length*bend,floor+.04+j*.07+.009,a[2]+dz*(i+1)/steps+dx/length*bend],.009,"wall",j%3?palette.wattle:palette.darkWood)
    }
  }
  function logWall(name: string, a: Vec3, b: Vec3, height: number) {
    const rows = Math.max(2,Math.ceil(height/.115)), course = height/rows
    const alongX=a[2]===b[2],length=Math.hypot(b[0]-a[0],b[2]-a[2])
    box(`${name}-log-core`,"wall",[(a[0]+b[0])/2,floor+height/2,(a[2]+b[2])/2],alongX ? [length,height,.08] : [.08,height,length],palette.wood,undefined,false)
    parts[parts.length-1].cutawaySide=alongX ? [0,Math.sign(a[2])] : [Math.sign(a[0]),0]
    for(let row=0;row<rows;row++) {
      if(row%4!==1) continue
      const y = floor+(row+.5)*course
      pole(`${name}-log-${row}`,[a[0],y,a[2]],[b[0],y,b[2]],course*(row%4===1 ? .54 : .575),"wall",row%5===1 ? "#927b58" : palette.wood)
      parts[parts.length-1].cutawaySide = a[0] === b[0] ? [Math.sign(a[0]),0] : [0,Math.sign(a[2])]
    }
  }
  function masonryWall(name: string, a: Vec3, b: Vec3, height: number) {
    const alongX = a[2] === b[2], length = Math.hypot(b[0]-a[0],b[2]-a[2])
    const base = Math.min(.25,height*.35), cx=(a[0]+b[0])/2, cz=(a[2]+b[2])/2
    box(`${name}-plaster`,"wall",[cx,floor+(base+height)/2,cz],alongX ? [length,height-base,.105] : [.105,height-base,length],"#b7ae94",undefined,false)
    const count = Math.max(1,Math.ceil(length/.18))
    for(let row=0;row<2;row++) for(let col=0;col<count;col++) {
      const t = (col+.5)/count, span = length/count-.009
      box(`${name}-rubble-${row}-${col}`,"wall",[a[0]+(b[0]-a[0])*t,floor+(row+.5)*base/2,a[2]+(b[2]-a[2])*t],alongX ? [span,base/2-.008,.12] : [.12,base/2-.008,span],["#8e9081","#a0a08d","#7f8577"][(row+col)%3],undefined,false)
    }
  }
  function closedWall(name: string, a: Vec3, b: Vec3) {
    const solid = (suffix: string,start: Vec3,end: Vec3,bottom: number,height: number,stone: boolean) => {
      if(height<=.001 || Math.hypot(end[0]-start[0],end[2]-start[2])<.01) return
      const first=parts.length
      if(stone) masonryWall(suffix,start,end,height); else logWall(suffix,start,end,height)
      for(const part of parts.slice(first)) {
        part.position[1]+=bottom
        part.cutawaySide = a[0] === b[0] ? [Math.sign(a[0]),0] : [0,Math.sign(a[2])]
      }
    }
    const panel = (suffix: string,start: Vec3,end: Vec3,stone: boolean) => {
      const length=Math.hypot(end[0]-start[0],end[2]-start[2])
      if(name.startsWith("front") || length<.6) {solid(suffix,start,end,0,h,stone);return}
      const opening=Math.min(.30,length*.35),sill=Math.min(.22,h*.4),head=Math.min(h-.035,sill+.23)
      const at=(t:number):Vec3=>[start[0]+(end[0]-start[0])*t,0,start[2]+(end[2]-start[2])*t]
      const left=at(.5-opening/length/2),right=at(.5+opening/length/2)
      solid(`${suffix}-left`,start,left,0,h,stone)
      solid(`${suffix}-right`,right,end,0,h,stone)
      solid(`${suffix}-below`,left,right,0,sill,stone)
      solid(`${suffix}-above`,left,right,head,h-head,stone)
      const normal:Vec3 = a[0]===b[0] ? [Math.sign(a[0])*.055,0,0] : [0,0,Math.sign(a[2])*.055]
      for(const [i,point] of [left,right].entries()) pole(`window-${suffix}-jamb-${i}`,[point[0]+normal[0],sill,point[2]+normal[2]],[point[0]+normal[0],head,point[2]+normal[2]],.022)
      for(const y of [sill,head]) pole(`window-${suffix}-rail-${y}`,[left[0]+normal[0],y,left[2]+normal[2]],[right[0]+normal[0],y,right[2]+normal[2]],.024,"wall",palette.paleWood)
    }
    if(variant === "house") {panel(name,a,b,false);return}
    if(a[2]<0 && b[2]>0) {
      const middle:Vec3=[a[0],0,0]
      panel(`${name}-rear`,a,middle,false)
      panel(`${name}-front`,middle,b,true)
    } else panel(name,a,b,(a[2]+b[2])/2>=0)
  }
  function bedding(x: number,z: number,index: number, length: number) {
    box(`straw-bed-${index}`,"base",[x,floor+.035,z],[.38,.07,length],palette.strawDark,undefined,false)
    box(`wool-cover-${index}`,"base",[x,floor+.08,z+.06],[.34,.035,length*.65],index%2?"#817864":"#716e57",undefined,false)
    parts[parts.length - 1].support = { clips: ["sleeping"], anchorOffset: [0, -.06], heading: 0 }
    box(`rolled-blanket-${index}`,"base",[x,floor+.1,z-length*.32],[.3,.11,.12],"#a3987a",undefined,false)
  }
  /** `facing` is the heading a seated person takes; omit it for a counter nobody sits on. */
  function bench(name: string, x: number, z: number, length: number, top = .3, facing?: number) {
    for (const end of [-1, 1]) pole(`${name}-leg-${end}`, [x+end*length*.35,floor,z], [x+end*length*.35,floor+top,z], .035, "interior")
    box(`${name}-seat`, "interior", [x,floor+top,z], [length,.045,.18], palette.paleWood, undefined, false)
    if (facing !== undefined) parts[parts.length-1].support = { clips: ["sitting", "seatedMeal", "seatedDrink"], heading: facing }
  }
  if (variant === "garden") {
    // Two herb beds leave a narrow flagstone walk between them.
    for (const side of [-1, 1]) {
      const cx = side*width*.26, bedWidth = width*.36, bedDepth = depth-.2
      box(`herb-bed-${side}`, "base", [cx,floor+.025,0], [bedWidth,.05,bedDepth], "#655640", undefined, false)
      for (const edge of [-1, 1]) {
        pole(`bed-edge-long-${side}-${edge}`, [cx+edge*bedWidth/2,floor+.055,-bedDepth/2], [cx+edge*bedWidth/2,floor+.055,bedDepth/2], .025, "base")
        pole(`bed-edge-short-${side}-${edge}`, [cx-bedWidth/2,floor+.055,edge*bedDepth/2], [cx+bedWidth/2,floor+.055,edge*bedDepth/2], .025, "base")
      }
      const rows = Math.max(2,Math.floor(bedDepth/.2)), cols = Math.max(2,Math.floor(bedWidth/.2))
      for (let row=0;row<rows;row++) for (let col=0;col<cols;col++) {
        const px=cx+(col-(cols-1)/2)*bedWidth/cols, pz=(row-(rows-1)/2)*bedDepth/rows, y=floor+.09+random()*.04
        for (let leaf=0;leaf<3;leaf++) box(`herb-${side}-${row}-${col}-${leaf}`, "base", [px,y+leaf*.015,pz], [.12,.035,.045], ["#657451","#7c8960","#92966b"][leaf], [0,leaf*Math.PI/3,.15], false)
      }
    }
    const stones = Math.max(2,Math.ceil(depth/.23))
    for (let i=0;i<stones;i++) flag(`garden-path-${i}`,0,-d+(i+.5)*depth/stones,width*.12,depth/stones-.025,-.023,.025,palette.stone)
    return parts
  }
  if (variant === "cross") {
    flag("cross-footing",0,0,Math.min(.55,width*.7),Math.min(.45,depth*.7),floor,.1,palette.stone)
    box("cross-upright","wall",[0,floor+h/2,0],[.105,h,.095],palette.wood)
    box("cross-arm","wall",[0,floor+h*.73,0],[Math.min(.65,width*.8),.095,.095],palette.paleWood)
    box("cross-peg","wall",[0,floor+h*.73,.055],[.035,.035,.025],palette.darkWood,undefined,false)
    for (const side of [-1,1]) pole(`cross-grain-${side}`,[side*.025,floor+.2,.049],[side*.02,floor+h-.055,.049],.004,"wall",palette.darkWood)
    return parts
  }
  if (variant === "lumberCamp") {
    // Keep the yard open: its four timber stacks are live simulation objects.
    const edgeX=w-.1, edgeZ=d-.1
    for (const x of [-edgeX,edgeX]) for (const z of [-edgeZ,edgeZ]) pole(`yard-post-${x}-${z}`,[x,floor,z],[x,.32,z],.045)
    for (const x of [-edgeX,edgeX]) pole(`yard-side-${x}`,[x,.2,-edgeZ],[x,.2,edgeZ],.025)
    pole("yard-back",[-edgeX,.2,-edgeZ],[edgeX,.2,-edgeZ],.025)
    for (let i=0;i<3;i++) box(`yard-offcut-${i}`,"base",[-w+.16+i*.06,.09,-d+.19],[.04,.035,.25],palette.paleWood,[0,.25,0],false)
    return parts
  }
  if(variant === "enclosure") {
    // Keep stone tops only 0.002–0.003 above terrain, including their unevenness.
    const nx=Math.ceil(width/.36),nz=Math.ceil(depth/.38)
    for(let row=0;row<nz;row++) for(let col=0;col<nx;col++) {
      const sx=(width-.1)/nx,sz=(depth-.1)/nz
      flag(`paving-${row}-${col}`,-w+.05+(col+.5)*sx,-d+.05+(row+.5)*sz,sx-.018-random()*.02,sz-.018-random()*.025,-.03,.032+random()*.001,["#8f9083","#a19f90","#838779","#969485"][Math.floor(random()*4)])
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
      for(let i=0;i<3;i++) box(`loose-plank-${i}`,"base",[-w+.45+i*.035,.034+i*.018,-d+.5],[.1,.026,.48],i%2?palette.paleWood:palette.wood,[0,.25+i*.27,0],false)
      flag("offcut-stone",w-.38,-d+.4,.18,.13,0,.1,palette.stone)
      box("folded-cloth","base",[w-.42,.06,d-.42],[.25,.1,.19],"#8b8067",[0,.16,0],false)
      pole("spare-pole",[-w+.32,.04,d-.45],[-w+.78,.06,d-.3],.024,"base")
    }
    return parts
  }

  if (variant === "workshop") {
    const layout = workshopLayout(width, depth)
    const { coreWidth, coreX, storageX, bayDepth } = layout
    const props = furnishingParts("workshop", coreWidth, depth, h, rise)
    for (const part of props) part.position[0] += coreX
    parts.push(...props)
    bench("workbench", coreX, -depth*.3, coreWidth*.65, .38)
    pole("axe-handle", [coreX-.2,.42,-depth*.3], [coreX+.2,.43,-depth*.3], .014, "interior", palette.darkWood)
    box("axe-head", "interior", [coreX+.17,.46,-depth*.3], [.08,.08,.035], "#787970", undefined, false)
    screen("rear", [-w+.13,0,-d+.13], [w-.13,0,-d+.13], h*.9)
    screen("side-windbreak", [-w+.13,0,-d+.13], [-w+.13,0,d-.13], h*.6)
    // Two square bays: low roundwood sleepers keep harvested logs off the earth.
    for (let bay=0;bay<2;bay++) {
      const z=(bay-.5)*bayDepth, half=layout.bayWidth/2-.08
      for (const side of [-1,1]) {
        pole(`wood-bay-${bay}-sleeper-${side}`, [storageX-half,.045,z+side*bayDepth*.2], [storageX+half,.045,z+side*bayDepth*.2], .035, "interior")
        pole(`wood-bay-${bay}-rail-${side}`, [storageX+side*half,.085,z-bayDepth*.42], [storageX+side*half,.085,z+bayDepth*.42], .022, "interior")
      }
    }
    // An L covers the rear workbench and right-hand timber bays; the left yard stays open.
    const roofs = [
      {name:"rear",left:-w,right:storageX-layout.bayWidth/2,back:-d,front:-depth*.16},
      {name:"wood",left:storageX-layout.bayWidth/2,right:w,back:-d,front:d},
    ]
    for (const roof of roofs) {
      roofRectangle(roof.name,roof.left,roof.right,roof.back,roof.front)
      for (const side of [roof.left+.055,roof.right-.055]) {
        const breaks=[roof.back+.045,...profile.breaks.filter(z=>z>roof.back+.045 && z<roof.front-.045),roof.front-.045]
        for(let i=0;i<breaks.length-1;i++) pole(`roof-beam-${roof.name}-${side}-${i}`, [side,roofY(side,breaks[i]),breaks[i]], [side,roofY(side,breaks[i+1]),breaks[i+1]], .035, "roof")
      }
      for (const z of [roof.back+.09,roof.front-.09]) {
        pole(`roof-rafter-${roof.name}-${z}`, [roof.left+.055,roofY(roof.left+.055,z),z], [roof.right-.055,roofY(roof.right-.055,z),z], .035, "roof")
        for (const x of [roof.left+.09,roof.right-.09]) pole(`hut-post-${roof.name}-${x}-${z}`, [x,0,z], [x,roofY(x,z)+.21,z], .045)
      }
    }
    parts.push(...buildingWeathering(width,depth,h,variant,recipe.seed))
    return parts
  }

  if (variant === "sheep-pen") {
    // Half a house — an open doorway and a hearth — beside an open railed fold. No roof
    // over the pen, and none of the woodcutter's timber bays or firewood.
    const { coreWidth, coreX, penLeft } = sheepPenLayout(width)
    const hearth = hearthParts(coreWidth,depth,h,rise)
    for (const part of hearth) { part.position[0] += coreX; part.position[2] += depth*.06 }
    parts.push(...hearth)
    const cx=w-.13, cz=d-.13, coreRight=penLeft
    logWall("hut-rear",[-cx,0,-cz],[coreRight,0,-cz],h)
    logWall("hut-side",[-cx,0,-cz],[-cx,0,cz],h)
    logWall("hut-divider",[coreRight,0,-cz],[coreRight,0,cz],h)
    const door=Math.min(.44,coreWidth*.62), doorHeight=Math.max(BUILDING_DOOR_HEIGHT,h*.9)
    logWall("hut-front-left",[-cx,0,cz],[doorX-door/2,0,cz],h)
    logWall("hut-front-right",[doorX+door/2,0,cz],[coreRight,0,cz],h)
    const first=parts.length
    box("doorway-shadow","wall",[doorX,floor+doorHeight/2,cz-.035],[door,doorHeight,.025],"#3f392c",undefined,false)
    pole("door-lintel",[doorX-door/2-.05,floor+doorHeight+.03,cz+.045],[doorX+door/2+.05,floor+doorHeight+.03,cz+.045],.04)
    for(const part of parts.slice(first)) part.cutawaySide=[0,1]
    // The hut keeps its own thatch; the fold stays open to the sky.
    roofRectangle("hut",-w,penLeft,-d,d)
    // Close the wedge between the low walls and the sloping roof above them.
    face("hut-rear-infill","roof",[-cx,eave,-cz,coreRight,eave,-cz,coreRight,roofY(coreRight,-cz),-cz,
      -cx,eave,-cz,coreRight,roofY(coreRight,-cz),-cz,-cx,roofY(-cx,-cz),-cz],palette.wood)
    for(const px of [-cx,coreRight]) face(`hut-side-infill-${px}`,"roof",
      [px,eave,-cz,px,eave,cz,px,roofY(px,cz),cz,px,eave,-cz,px,roofY(px,cz),cz,px,roofY(px,-cz),-cz],"#b3aa8e")
    for(const side of [-cx,coreRight]) {
      const breaks=[-cz,...profile.breaks.filter(v=>v>-cz && v<cz),cz]
      for(let i=0;i<breaks.length-1;i++) pole(`hut-eave-${side}-${i}`,[side,roofY(side,breaks[i]),breaks[i]],[side,roofY(side,breaks[i+1]),breaks[i+1]],.03,"roof")
      for(const b of [-cz,cz]) pole(`hut-post-${side}-${b}`,[side,0,b],[side,roofY(side,b)+.21,b],.045)
    }
    for(const b of [-cz,cz]) pole(`hut-rafter-${b}`,[-w+.03,roofY(-w,b),b],[penLeft-.03,roofY(penLeft,b),b],.03,"roof")
    // Hurdle fence: stakes and two rails around the fold, with a gate beside the door.
    const railTop=Math.min(.62,h*.85), gate=Math.min(.62,depth*.42)
    const runs: Array<[Vec3, Vec3, string]> = [
      [[penLeft,0,-cz],[cx,0,-cz],"back"],
      [[cx,0,-cz],[cx,0,cz],"far"],
      [[cx,0,cz],[penLeft+gate,0,cz],"front"],
    ]
    for(const [a,b,name] of runs) {
      const length=Math.hypot(b[0]-a[0],b[2]-a[2]), stakes=Math.max(2,Math.round(length/.45))
      for(let i=0;i<=stakes;i++) {
        const px=a[0]+(b[0]-a[0])*i/stakes, pz=a[2]+(b[2]-a[2])*i/stakes
        pole(`pen-stake-${name}-${i}`,[px,0,pz],[px,railTop+.06,pz],i%stakes===0 ? .045 : .028)
      }
      for(const y of [railTop*.45,railTop]) pole(`pen-rail-${name}-${y}`,[a[0],y,a[2]],[b[0],y,b[2]],.026,"wall",palette.paleWood)
    }
    // A hung gate leaf, swung open into the fold.
    const hinge=penLeft+gate
    pole("pen-gatepost",[hinge,0,cz],[hinge,railTop+.12,cz],.048)
    for(const y of [railTop*.45,railTop]) pole(`pen-gate-bar-${y}`,[hinge,y,cz],[hinge+.06,y,cz-gate*.8],.024,"wall",palette.paleWood)
    pole("pen-gate-brace",[hinge,railTop*.35,cz],[hinge+.06,railTop,cz-gate*.8],.022,"wall",palette.wood)
    // A water trough and a bundle of hurdle rods: the fold reads as ready for a flock.
    const tx=(penLeft+cx)/2+.18, tz=-depth*.22
    for(const end of [-1,1]) box(`trough-end-${end}`,"interior",[tx+end*.24,.11,tz],[.05,.22,.26],palette.wood,undefined,false)
    box("trough-side","interior",[tx,.11,tz],[.48,.16,.26],palette.paleWood,undefined,false)
    box("trough-water","interior",[tx,.185,tz],[.4,.02,.19],"#6d7a72",undefined,false)
    for(let i=0;i<5;i++) pole(`spare-hurdle-${i}`,[cx-.12,.045+i*.05,cz-.55],[cx-.12+(i%2?.05:-.04),.05+i*.05,cz-.15],.03,"base",i%2?palette.paleWood:palette.wood)
    parts.push(...buildingWeathering(width,depth,h,variant,recipe.seed))
    return parts
  }

  if (hasDomesticHearth(variant) && variant !== "shelter") parts.push(...hearthParts(width,depth,h,rise))

  const x=w-.13,z=d-.13
  if(variant === "storehouse") {
    for(const a of [-x,x]) for(const b of [-z,rampStart-.06]) {
      pole(`raised-leg-${a}-${b}`,[a,0,b],[a,floor,b],.045,"base")
      pole(`raised-post-${a}-${b}`,[a,floor,b],[a,lean?roofY(a,b)+.21:eave,b],.045)
    }
    for(let i=0;i<Math.ceil(width/.12);i++) box(`floor-board-${i}`,"base",[-w+.07+i*(width-.14)/Math.max(1,Math.ceil(width/.12)-1),floor+.025,(rampStart-d+.06)/2],[.085,.045,rampStart+d-.06],palette.paleWood,undefined,false)
    box("grain-sack","base",[0,floor+.16,-depth*.12],[Math.min(.3,width*.3),.27,Math.min(.25,depth*.3)],"#a29978",undefined,false)
  } else for(const a of [-x,x]) for(const b of [-z,z]) pole(`earthfast-post-${a}-${b}`,[a,0,b],[a,lean?roofY(a,b)+.21:eave+.06,b],.043)

  if(variant === "storehouse") {
    const rampWidth=Math.min(.72,width*.65), front=d-.025, top=floor+.048
    face("entry-ramp","base",[-rampWidth/2,top,rampStart,rampWidth/2,top,rampStart,rampWidth/2,.018,front,-rampWidth/2,top,rampStart,rampWidth/2,.018,front,-rampWidth/2,.018,front],palette.paleWood)
    for(let i=1;i<6;i++) {
      const t=i/6
      box(`ramp-cleat-${i}`,"base",[0,top*(1-t)+.018*t+.01,rampStart+(front-rampStart)*t],[rampWidth,.022,.035],palette.wood,undefined,false)
    }
    for(const side of [-1,1]) {
      const breaks=[-z,...(lean ? profile.breaks.filter(v=>v>-z && v<z) : []),z]
      for(let i=0;i<breaks.length-1;i++) pole(`store-side-beam-${side}-${i}`,[side*x,lean?roofY(side*x,breaks[i]):eave,breaks[i]],[side*x,lean?roofY(side*x,breaks[i+1]):eave,breaks[i+1]],.04)
    }
  } else if(variant === "house" || variant === "hall" || variant === "tavern") {
    const door=Math.min(.44,width*.5), left=(width-.26-door)/2
    if(variant === "tavern") {
      closedWall("rear-left",[-x,0,-z],[doorX-door/2,0,-z])
      closedWall("rear-right",[doorX+door/2,0,-z],[x,0,-z])
    } else closedWall("rear",[-x,0,-z],[x,0,-z])
    for(const a of [-x,x]) closedWall(`side-${a}`,[a,0,-z],[a,0,z])
    if(left>0) {closedWall("front-left",[-x,0,z],[doorX-door/2,0,z]);closedWall("front-right",[doorX+door/2,0,z],[x,0,z])}
    // Doorways are open holes, never a hung leaf; headroom extends into the roof end while the surrounding walls stay low.
    const doorHeight = Math.max(BUILDING_DOOR_HEIGHT,h*.9)
    for(const end of variant === "tavern" ? [1,-1] : [1]) {
      const first=parts.length,prefix=end===1 ? "" : "back-"
      box(`${prefix}doorway-shadow`,"wall",[doorX,floor+doorHeight/2,end*(z-.035)],[door,doorHeight,.025],"#3f392c",undefined,false)
      for(const part of parts.slice(first)) part.cutawaySide=[0,end]
    }
    if(variant === "tavern") {
      // Low drinking tables and benches occupy the left side, clear of the hearth.
      for(const table of tavernLayout(width, depth).tables) {
        const { side, x: tx, z: tz, w: tableW, d: tableD } = table
        for(const a of [-1,1]) for(const b of [-1,1]) pole(`tavern-table-${side}-leg-${a}-${b}`,[tx+a*tableW*.35,0,tz+b*tableD*.32],[tx+a*tableW*.35,.37,tz+b*tableD*.32],.025,"interior")
        box(`tavern-table-${side}-top`,"interior",[tx,.39,tz],[tableW,.045,tableD],palette.paleWood,undefined,false)
        for(const b of [-1,1]) {
          const name = `tavern-bench-${side}-${b}`, seatZ = tz+b*depth*.11
          bench(name,tx,seatZ,.32,.23,b>0 ? Math.PI : 0)
          // Plain pegged plank chairs, with the backs away from the tabletop.
          for (const end of [-1,1]) pole(`${name}-back-post-${end}`,
            [tx+end*.13,floor,seatZ+b*.07],[tx+end*.13,floor+.49,seatZ+b*.07],.022,"interior")
          box(`${name}-back`,"interior",[tx,floor+.43,seatZ+b*.07],[.30,.10,.035],palette.wood,undefined,false)
        }
        for(const a of [-1,1]) {
          const mx=tx
          box(`tavern-trencher-${side}-${a}`,"interior",[mx,.421,tz+a*tableD*.23],[.15,.018,.13],palette.wood,undefined,false)
          box(`tavern-bread-${side}-${a}`,"interior",[mx-.025,.446,tz+a*tableD*.23],[.085,.035,.065],"#b58d52",undefined,false)
          box(`tavern-cheese-${side}-${a}`,"interior",[mx+.045,.44,tz+a*tableD*.23],[.04,.025,.05],"#cfba79",undefined,false)
          box(`tavern-cup-${side}-${a}`,"interior",[mx+a*.14,.445,tz+a*tableD*.25],[.045,.065,.045],"#ad9166",undefined,false)
          box(`tavern-ale-${side}-${a}`,"interior",[mx+a*.14,.48,tz+a*tableD*.25],[.032,.005,.032],"#614e32",undefined,false)
        }
      }
      for (const seat of tavernLayout(width, depth).exteriorBenches) {
        const first = parts.length
        bench(seat.id.replace(/-seat$/, ""), seat.x, seat.z, seat.w, .23, seat.heading)
        // Exterior furniture remains visible with the roof on or walls cut away.
        for (const part of parts.slice(first)) part.layer = "base"
      }
      const counter = tavernLayout(width, depth).counter
      const counterW=counter.w-.035,counterX=counter.x,counterZ=counter.z
      box("tavern-serving-counter", "interior",[counterX,.23,counterZ],[counterW,.46,depth*.14],palette.wood,undefined,false)
      box("tavern-counter-top", "interior",[counterX,.475,counterZ],[counterW+.035,.035,depth*.15],palette.paleWood,undefined,false)
    }
    if(variant === "house") {
      // One bed per resident, laid left of the hearth and clear of the door.
      const hearth = shelterHearth(width,depth,h,rise)
      const bedLeft = -w+.24, bedRight = hearth.x-.285*hearth.scale-.24
      const beds = Math.max(1,Math.min(HOUSE_BEDS,Math.floor((bedRight-bedLeft)/.42)+1))
      for(let i=0;i<beds;i++) bedding(beds === 1 ? (bedLeft+bedRight)/2 : bedLeft+(bedRight-bedLeft)*i/(beds-1),-depth*.15,i,Math.min(.9,depth*.6))
    }
    if(variant === "hall") {
      bench("hall-bench",0,-depth*.25,width*.65,.3,0)
      // A pegged lintel and sheltered threshold distinguish the gathering hall.
      pole("hall-lintel",[doorX-.30,floor+doorHeight+.03,z+.045],[doorX+.30,floor+doorHeight+.03,z+.045],.045)
      flag("hall-threshold",doorX,z-.04,Math.min(.62,width*.6),.2,-.023,.025,palette.stone)
    }
  } else {
    if(variant === "monk-shelter") {
      logWall("rear",[-x,0,-z],[x,0,-z],h*.85)
      for(const a of [-x,x]) logWall(`windbreak-${a}`,[a,0,-z],[a,0,z*.3],h*.6)
    } else {
      screen("rear",[-x,0,-z],[x,0,-z],h*.9)
      for(const a of [-x,x]) screen(`windbreak-${a}`,[a,0,-z],[a,0,z*.3],h*.6)
    }
    if(variant === "monk-shelter" || variant === "shelter") {
      if (variant === "shelter") {
        // Leave the rear-right hearth and front table clear of bedding.
        // Full-length bodies share a column, with a gap between the two beds.
        for(let i=0;i<2;i++) bedding(-width*.3,-depth*.24+i*depth*.48,i,Math.min(.9,depth*.44))
        bench("pilgrim-bench",width*.1,depth*.43,width*.4,.23,Math.PI)
        parts.push(...furnishingParts("shelter",width,depth,h,rise))
      } else {
        const beds=Math.max(1,Math.floor((width-.3)/.55))
        // Keep every bed left of the fireplace, including one-tile recipe previews.
        const hearth = shelterHearth(width,depth,h,rise)
        const left = -w+.22, right = hearth.x-.285*hearth.scale-.24
        for(let i=0;i<beds;i++) bedding(beds === 1 ? (left+right)/2 : left+(right-left)*i/(beds-1),-depth*.08,i,Math.min(.9,depth*.6))
      }
    } else if (variant === "market") {
      bench("stall-counter",0,depth*.23,width*.72,.38)
      for (let i=0;i<3;i++) box(`market-sack-${i}`,"base",[(i-1)*width*.2,floor+.15,-depth*.16],[width*.16,.3,depth*.25],[palette.strawDark,"#8b8067",palette.earth][i],undefined,false)
    } else if (variant === "guard-post") {
      bench("watch-seat",0,-depth*.16,width*.6,.24,0)
      pole("watch-staff",[x-.08,floor,-z+.06],[x-.08,eave+.1,-z+.06],.02)
    } else {
      for(let row=0;row<3;row++) for(let i=0;i<Math.max(2,Math.floor(width/.14)-3-row);i++) {
        const count=Math.max(2,Math.floor(width/.14)-3-row),px=(i-(count-1)/2)*.12
        pole(`firewood-${row}-${i}`,[px,floor+.065+row*.085,-depth*.2],[px+.008,floor+.065+row*.085,depth*.18],.052,"base",i%3?palette.wood:palette.paleWood)
      }
    }
  }
  // Broad lapped straw surfaces share the same low eaves and restrained material detail.
  const roofX=w,roofZ=d
  function roofSide(sign: number) {
    const at = (t: number,u: number): Vec3 => awning
      ? [-roofX+2*roofX*u,eave+rise*(1-t),roofZ-2*roofZ*t]
      : lean ? [-roofX+2*roofX*u,eave+rise*(1-t),-roofZ+2*roofZ*t]
      : [sign*roofX*t,eave+rise*(1-t),-roofZ+2*roofZ*u]
    parts.push(...thatchSurface(at(0,0),at(0,1),at(1,0),at(1,1),recipe.seed,String(sign)))
  }
  if(variant === "market" && lean) {
    parts.push(...marketCanopyParts(width,depth,eave+.48))

  } else if(closed) {
    // Leave a real opening in the low roof for the long arched door brow.
    const strips = [
      {name:"left",a:-w,b:doorX-browHalf,front:d},
      {name:"right",a:doorX+browHalf,b:w,front:d},
      {name:"rear",a:doorX-browHalf,b:doorX+browHalf,front:d-browDepth},
    ]
    for(const strip of strips) roofRectangle(strip.name,strip.a,strip.b,variant === "tavern" && strip.name === "rear" ? -d+browDepth : -d,strip.front)
  } else if(lean) roofRectangle("1",-w,w,-d,d); else {roofSide(-1);roofSide(1)}
  if(lean && variant === "storehouse") {
    // Hold-down battens follow each pitch of the thin straw roof.
    for(const side of [-1,1]) {
      const x = side*width*.22
      const breaks=[-roofZ+.07,...profile.breaks.filter(v=>v>-roofZ+.07 && v<roofZ-.07),roofZ-.07]
      for(let i=0;i<breaks.length-1;i++) pole(`store-roof-batten-${side}${breaks.length===2 ? "" : `-${i}`}`,[x,roofY(x,breaks[i])+.12,breaks[i]],[x,roofY(x,breaks[i+1])+.12,breaks[i+1]],.03,"roof",palette.wood)
    }
  }
  for(const side of variant === "market" ? [] : [-1,1]) {
    if(lean) {
      const breaks=[-d+.025,...profile.breaks.filter(z=>z>-d+.025 && z<d-.025),d-.025]
      for(let i=0;i<breaks.length-1;i++) pole(`eave-pole-${side}-${i}`,[side*x,roofY(side*x,breaks[i]),breaks[i]],[side*x,roofY(side*x,breaks[i+1]),breaks[i+1]],.03,"roof")
      const spans=closed && (side===1 || variant === "tavern")
        ? [[-roofX+.012,doorX-browHalf],[doorX+browHalf,roofX-.012]] : [[-roofX+.012,roofX-.012]]
      for(const [i,[a,b]] of spans.entries()) pole(`roof-rafter-${side}-${i}`,[a,roofY(a,side*z),side*z],[b,roofY(b,side*z),side*z],.03,"roof")
    } else {
      pole(`eave-pole-${side}`,[-x,eave,side*z],[x,eave,side*z],.037,"roof")
      pole(`rafter-left-${side}`,[-roofX+.025,eave,side*z],[0,eave+rise+.018,side*z],.036,"roof")
      pole(`rafter-right-${side}`,[roofX-.025,eave,side*z],[0,eave+rise+.018,side*z],.036,"roof")
    }
  }
  if(lean && (variant === "monk-shelter" || variant === "hall")) for(const side of [-1,1]) {
    const px=side*(w-.15),pz=profile.folded ? d-(profile.breaks[1]-profile.breaks[0]) : awning ? z : -z
    const top=roofY(px,pz)+.10
    box(`shelter-cross-upright-${side}`,"roof",[px,top+.22,pz],[.055,.44,.055],palette.paleWood)
    box(`shelter-cross-arm-${side}`,"roof",[px,top+.30,pz],[.29,.05,.05],palette.paleWood)
  }
  if(closed) {
    if(variant === "hall") for(const side of [-1,1]) {
      const px=doorX+side*Math.min(.32,w-.10)
      box(`door-cross-upright-${side}`,"wall",[px,.52,z+.075],[.035,.72,.035],palette.paleWood)
      box(`door-cross-arm-${side}`,"wall",[px,.68,z+.075],[.14,.035,.035],palette.paleWood)
      for(const part of parts.slice(-2)) part.cutawaySide=[0,1]
    }
    function rearInfill() {
      const spans=variant === "tavern" ? [[-x,doorX-browHalf],[doorX+browHalf,x]] : [[-x,x]]
      for(const [i,[a,b]] of spans.entries()) face(`roof-rear-infill-${i}`,"roof",[a,eave,-z,b,eave,-z,b,roofY(b,-z),-z,a,eave,-z,b,roofY(b,-z),-z,a,roofY(a,-z),-z],palette.wood)
    }
    // Rear wall and both side walls follow the longitudinal roof slope.
    if(profile.folded) {
      const breaks=[-z,...profile.breaks.filter(v=>v>-z && v<z),z]
      for(const side of [-1,1]) for(let i=0;i<breaks.length-1;i++) {
        const a=breaks[i],b=breaks[i+1],px=side*x
        face(`roof-side-infill-${side}-${i}`,"roof",[px,eave,a,px,eave,b,px,roofY(px,b),b,px,eave,a,px,roofY(px,b),b,px,roofY(px,a),a],a<0 ? palette.wood : "#b3aa8e")
      }
      rearInfill()
    } else {
    rearInfill()
    for(const side of [-1,1]) face(`roof-side-infill-${side}`,"roof",[side*x,eave,-z,side*x,eave,z,side*x,roofY(side*x,z),z,side*x,eave,-z,side*x,roofY(side*x,z),z,side*x,roofY(side*x,-z),-z],variant !== "house" ? "#b3aa8e" : palette.wood)
    const rows=Math.floor((roofY(0,-z)-eave)/.11)
    for(let row=0;row<rows;row++) {
      if(row%3!==1 || variant === "tavern") continue
      const y=eave+(row+.5)*.11,end=Math.min(z,d-(y+.055-eave)/Math.max(.001,rise)*depth)
      pole(`upper-rear-log-${row}`,[-x,y,-z],[x,y,-z],.065,"roof",row%5===1 ? "#927b58" : palette.wood)
      if(end+z>.06) for(const side of [-1,1]) pole(`upper-side-log-${side}-${row}`,[side*x,y,-z],[side*x,y,variant === "hall" ? Math.min(0,end) : end],.065,"roof",row%5===1 ? "#927b58" : palette.wood)
    }
    }
    for(const end of variant === "tavern" ? [1,-1] : [1]) {
      const first=parts.length
      const endBrowY=(x:number,z:number)=>browY(x,z,end)
      const endRoofY=(x:number,z:number)=>roofY(x,end*z)
      // Curved roof strips start well behind the door and merge flush into the main plane.
      const segments=10, runs=5
      for(let col=0;col<segments;col++) for(let row=0;row<runs;row++) {
        const a=doorX-browHalf+col*2*browHalf/segments,b=doorX-browHalf+(col+1)*2*browHalf/segments
        const za=d-row*browDepth/runs,zb=d-(row+1)*browDepth/runs
        const point=(x:number,z:number):Vec3=>[x,endBrowY(x,z),z]
        face(`door-arch-thatch-${row}-${col}`,"roof",[...point(a,za),...point(b,za),...point(b,zb),...point(a,za),...point(b,zb),...point(a,zb)],col%3 ? "#b09a6d" : "#ae986b")
        if(row===0) face(`door-arch-edge-${col}`,"roof",[a,endBrowY(a,d),d,b,endBrowY(b,d),d,b,endBrowY(b,d)-.065,d,a,endBrowY(a,d),d,b,endBrowY(b,d)-.065,d,a,endBrowY(a,d)-.065,d],"#97835c")
        if(row===0 && col%3!==0) {
          const px=a+(b-a)*(.25+random()*.4),end=Math.min(b,px+.022)
          face(`door-arch-edge-grain-${col}`,"roof",[px,endBrowY(px,d)-.035,d,end,endBrowY(end,d)-.04,d,end,endBrowY(end,d)-.055,d,px,endBrowY(px,d)-.035,d,end,endBrowY(end,d)-.055,d,px,endBrowY(px,d)-.055,d],"#b09a6d")
        }
      }
      // Close the thatch thickness where the curved brow joins the main roof.
      const tail=d-browDepth,left=doorX-browHalf,right=doorX+browHalf
      face("door-arch-rear-seam","roof",[left,endBrowY(left,tail),tail,right,endBrowY(right,tail),tail,right,endRoofY(right,tail)+.025,tail,left,endBrowY(left,tail),tail,right,endRoofY(right,tail)+.025,tail,left,endRoofY(left,tail)+.025,tail],"#ae986b")
      for(const side of [-1,1]) {
        const px=doorX+side*browHalf
        face(`door-arch-verge-${side}`,"roof",[px,endBrowY(px,d),d,px,endBrowY(px,tail),tail,px,endRoofY(px,tail)+.025,tail,px,endBrowY(px,d),d,px,endRoofY(px,tail)+.025,tail,px,endRoofY(px,d)+.025,d],"#ae986b")
      }
      const door=Math.min(.44,width*.5),head=Math.max(BUILDING_DOOR_HEIGHT,h*.9)+floor
      const points=[...new Set([left,doorX-door/2,doorX+door/2,right,...Array.from({length:9},(_,i)=>left+(i+1)*2*browHalf/10)])].sort((a,b)=>a-b)
      for(let i=0;i<points.length-1;i++) {
        const a=points[i],b=points[i+1],base=a>=doorX-door/2 && b<=doorX+door/2 ? head : eave
        face(`door-arch-infill-${i}`,"roof",[a,base,z,b,base,z,b,endBrowY(b,z)-.065,z,a,base,z,b,endBrowY(b,z)-.065,z,a,endBrowY(a,z)-.065,z],variant !== "house" ? "#b3aa8e" : palette.wood)
      }
      if(end===-1) for(const part of parts.slice(first)) {
        part.name=`back-${part.name}`
        // Reflect the local brow to the rear and retain outward triangle winding.
        part.vertices=part.vertices?.map((v,i)=>i%3===2 ? -v : v)
        if(part.vertices) for(let i=0;i<part.vertices.length;i+=9) for(let axis=0;axis<3;axis++) {
          const swap=part.vertices[i+3+axis];part.vertices[i+3+axis]=part.vertices[i+6+axis];part.vertices[i+6+axis]=swap
        }
      }
    }
  }
  if(!lean) {
    if(variant === "monk-shelter" || variant === "hall") {
      // Plain pegged wooden crosses at both gable ends; no ornament on utility huts.
      for(const end of [-1,1]) {
        box(`shelter-cross-upright-${end}`,"roof",[0,eave+rise+.13,end*z],[.04,.32,.04],palette.paleWood)
        box(`shelter-cross-arm-${end}`,"roof",[0,eave+rise+.2,end*z],[.2,.04,.04],palette.paleWood)
      }
    }
    pole("ridge-pole",[0,eave+rise+.045,-roofZ+.04],[0,eave+rise+.045,roofZ-.04],.045,"roof",palette.darkWood)
    if(variant === "house" || variant === "hall" || variant === "tavern") for(const s of [-1,1]) {
      face(`woven-gable-${s}`,"roof",[-x,eave,s*z,x,eave,s*z,0,eave+rise-.045,s*z],palette.wattle)
      pole(`gable-post-${s}`,[0,eave,s*z],[0,eave+rise,s*z],.029,"roof")
    }
  }
  parts.push(...buildingWeathering(width,depth,h,variant,recipe.seed))
  return parts
}
