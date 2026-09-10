import { makeRng } from "../rng"
import { INN_OVERHANG, INN_ROOF_OVERHANG, INN_UPPER_ROOF_PITCH, innHearthRoofRise } from "./dimensions"
import type { BuildingPart, Vec3 } from "./geometry"
import { Euler, Quaternion, Vector3 } from "three"
import { EARLY_MATERIALS } from "./materials"
import { hearthParts } from "./furnishings"
import { thatchSurface } from "./thatch"
import { innLayout } from "../inn-layout"

/** Open shared sleeping floor, with three bed rows and two clear aisles. */
export function innParts(width: number, depth: number, height: number, fireplace = true, seed = 17, upper = false, flue?: {x:number;z:number}): BuildingPart[] {
  const overhang=upper ? INN_OVERHANG : 0, outerW=width+overhang*2,outerD=depth+overhang*2
  const layout=innLayout(width,depth,upper,flue)
  const parts:BuildingPart[]=[]
  const box = (name:string, position:Vec3,size:Vec3,color:string,layer:BuildingPart["layer"]="interior",rotation?:Vec3) => {
    parts.push({name,position,size,color,layer,rotation,outline:false})
    return parts[parts.length-1]
  }
  const timber=EARLY_MATERIALS.wood,random=makeRng(seed)
  const beam=(name:string,a:Vec3,b:Vec3,thickness:number,side:[number,number],layer:BuildingPart["layer"]="wall")=> {
    const vector=new Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),length=vector.length()
    const rotation=new Euler().setFromQuaternion(new Quaternion().setFromUnitVectors(new Vector3(0,1,0),vector.normalize()))
    const part=box(name,[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2],[thickness,length,thickness],timber,layer,[rotation.x,rotation.y,rotation.z])
    part.cutawaySide=side
  }
  // Cross-braced posts and pale earthen plaster repeat around an open dormitory.
  // Upstairs has windows in its outer walls; the ladder hatch is its only entrance.
  for(const axis of ["x","z"] as const) for(const side of [-1,1]) {
    const along=axis==="x" ? outerW-.12 : outerD-.12,fixed=side*((axis==="x" ? outerD : outerW )/2-.12)
    const normal:[number,number]=axis==="x" ? [0,side] : [side,0]
    const at=(u:number,y:number,out=.0):Vec3=>axis==="x" ? [u,y,fixed+side*out] : [fixed+side*out,y,u]
    const bays=axis==="x" ? 3 : Math.max(3,Math.round(depth)),step=along/bays
    for(let i=0;i<bays;i++) {
      const left=-along/2+i*step,right=left+step,mid=(left+right)/2
      const door=!upper && axis==="x" && side===1 && i===1
      const window=!door && (axis==="z" ? i%2===1 : i===1)
      const panel=box(`inn-plaster-${axis}-${side}-${i}`,at(mid,door ? height-.10 : height/2),
        axis==="x" ? [step,door ? .2 : height,.09] : [.09,door ? .2 : height,step],
        ["#b7ae94","#c3b79a","#bdb398"][(i+seed)%3],"wall")
      panel.cutawaySide=normal
      if(!door) {
        for(let fleck=0;fleck<3;fleck++) {
          const u=left+.13+random()*(step-.26),y=.16+random()*height*.22,sw=.08+random()*.1,sh=.045+random()*.07
          const mark=box(`inn-daub-${axis}-${side}-${i}-${fleck}`,at(u,y,.047),axis==="x" ? [sw,sh,.006] : [.006,sh,sw],fleck%2 ? "#b0a68d" : "#c4bba3","wall")
          mark.cutawaySide=normal
        }
        const low=.13,high=window ? height*.46 : height-.12
        beam(`inn-cross-a-${axis}-${side}-${i}`,at(left+.05,low,.055),at(right-.05,high,.055),.065,normal)
        beam(`inn-cross-b-${axis}-${side}-${i}`,at(left+.05,high,.055),at(right-.05,low,.055),.065,normal)
        if(window) {
          const windowW=Math.min(.42,step*.55),windowH=height*.32,cy=height*.70
          const pane=box(`inn-window-${axis}-${side}-${i}`,at(mid,cy,.055),axis==="x" ? [windowW,windowH,.025] : [.025,windowH,windowW],"#494639","wall")
          pane.cutawaySide=normal
          for(const edge of [-1,1]) {
            beam(`inn-window-jamb-${axis}-${side}-${i}-${edge}`,at(mid+edge*windowW/2,cy-windowH/2,.075),at(mid+edge*windowW/2,cy+windowH/2,.075),.045,normal)
            beam(`inn-window-rail-${axis}-${side}-${i}-${edge}`,at(mid-windowW/2,cy+edge*windowH/2,.075),at(mid+windowW/2,cy+edge*windowH/2,.075),.045,normal)
          }
          for(const shutter of [-1,1]) {
            const board=box(`inn-shutter-${axis}-${side}-${i}-${shutter}`,at(mid+shutter*windowW*.39,cy,.075),axis==="x" ? [windowW*.20,windowH,.035] : [.035,windowH,windowW*.20],"#8b7350","wall")
            board.cutawaySide=normal
          }
        }
      }
      if(i===0) beam(`inn-post-${axis}-${side}-0`,at(left,0,.03),at(left,height,.03),.085,normal)
      beam(`inn-post-${axis}-${side}-${i+1}`,at(right,0,.03),at(right,height,.03),.085,normal)
    }
    for(const y of [.07,height-.04]) {
      if(!upper && axis==="x" && side===1 && y<.1) continue
      beam(`inn-tie-${axis}-${side}-${y}`,at(-along/2,y,.04),at(along/2,y,.04),.09,normal)
    }
    if(upper) {
      beam(`inn-jetty-rim-${axis}-${side}`,at(-along/2,-.06),at(along/2,-.06),.13,normal)
      for(let i=0;i<=bays;i++) {
        const u=-along/2+i*step
        beam(`inn-jetty-bracket-${axis}-${side}-${i}`,at(u,-.32,-overhang),at(u,-.07),.075,normal)
      }
    }
  }
  box("floor",[0,-.024,0],[outerW-.12,.05,outerD-.12],"#937954","base")
  // Plank flooring stays visible upstairs instead of sampling the ground texture.
  for(let i=0;i<Math.ceil(width/.18);i++) {
    const step=(outerW-.12)/Math.ceil(width/.18)
    box(`inn-floorboard-${i}`,[-outerW/2+.06+(i+.5)*step,.018,0],[step-.008,.025,outerD-.12],i%3 ? "#987e58" : "#a58a62","base")
  }
  if(!upper) {
    const front=depth/2-.12,doorHeight=height-.2
    // An open plank door and a reception counter leave the central entrance clear.
    const door=box("inn-front-door",[-.38,doorHeight/2,front-.36],[.055,doorHeight,.72],"#826545","wall")
    door.cutawaySide=[0,1]
    for(const y of [.18,doorHeight-.18]) box(`inn-door-strap-${y}`,[-.345,y,front-.36],[.02,.045,.64],"#4d4b40","wall").cutawaySide=[0,1]
    box("inn-door-threshold",[0,.025,front],[.86,.05,.16],"#9c8b6f","base")
    box("inn-reception-counter",[-width/2+.38,.4,front-.57],[.5,.075,.6],"#937654")
    for(const x of [-width/2+.19,-width/2+.57]) for(const z of [front-.79,front-.35])
      box(`inn-counter-leg-${x}-${z}`,[x,.19,z],[.055,.38,.055],timber)
    for(let fold=0;fold<3;fold++) box(`inn-linen-${fold}`,[-width/2+.38,.46+fold*.045,front-.61],[.32,.045,.27],fold%2 ? "#aaa18b" : "#c0b292")
  }
  const bw=layout.bedWidth,length=layout.bedLength
  let index=0
  for(const {x,z,side,row,bunk} of layout.beds) {
    for(const a of [-1,1]) for(const b of [-1,1])
      box(`inn-bedpost-${side}-${row}-${a}-${b}`,[x+a*bw/2,bunk ? .43 : .15,z+b*length/2],[.045,bunk ? .86 : .3,.045],"#745a3d")
    for(let level=0;level<(bunk?2:1);level++) {
      const y=.17+level*.48,id=index++
      box(`inn-bed-frame-${id}`,[x,y-.045,z],[bw+.04,.065,length+.045],"#826545")
      box(`straw-bed-${id}`,[x,y,z],[bw,.055,length],"#af9962")
      box(`wool-cover-${id}`,[x,y+.04,z+.04],[bw-.025,.035,length*.68],id%2?"#7b8170":"#8c7465").support={clips:["sleeping"],anchorOffset:[0,-.04],heading:0}
      box(`rolled-blanket-${id}`,[x,y+.08,z-length*.34],[bw-.06,.1,.11],"#c0b292")
    }
    if(bunk) for(let rung=0;rung<4;rung++) box(`inn-bunk-rung-${side}-${row}-${rung}`,[x-side*(bw/2+.04),.16+rung*.16,z+.23],[.055,.035,.25],"#a1865c")
  }
  // Ground-floor roofs follow the tavern's gentle pitch along Z. Upstairs the
  // ridge turns perpendicular, with a steep pitch and projecting eaves/verges.
  const cross=upper ? outerW : outerD,along=upper ? outerD : outerW
  const extension=upper ? INN_ROOF_OVERHANG : 0,pitch=upper ? INN_UPPER_ROOF_PITCH : .32
  const run=cross/2+extension,span=along+extension*2,ridge=height+.1+cross/2*pitch
  const roofY=(u:number)=>ridge-Math.abs(u)*pitch
  const at=(u:number,y:number,v:number):Vec3=>upper ? [u,y,v] : [v,y,u]
  const roofBox=(name:string,u:number,y:number,v:number,size:Vec3,color:string,angle=0)=>
    box(name,at(u,y,v),upper ? size : [size[2],size[1],size[0]],color,"roof",upper ? [0,0,-angle] : [angle,0,0])
  parts.push(...thatchSurface(at(0,ridge,-span/2),at(0,ridge,span/2),
    at(-run,roofY(run),-span/2),at(-run,roofY(run),span/2),seed,"inn-left"))
  const courses=Math.ceil(run/.18),columns=Math.ceil(span/.2)
  for(let row=0;row<courses;row++) for(let col=0;col<=columns;col++) {
    const step=span/columns,back=row*run/courses,front=Math.min(run-.015,back+run/courses+.055)
    const left=Math.max(-span/2,-span/2+(col-(row%2)*.5)*step),right=Math.min(span/2,-span/2+(col+1-(row%2)*.5)*step)
    if(right-left<.02) continue
    const u=(back+front)/2,v=(left+right)/2
    roofBox(`inn-shingle-${row}-${col}`,u,roofY(u)+.035+(courses-row)*.007,v,[(front-back)*Math.sqrt(1+pitch**2),.035,right-left-.009],
      ["#857657","#8c7b5c","#918161"][Math.floor(random()*3)],Math.atan(pitch))
  }
  for(const side of [-1,1]) {
    const v=side*(along/2-.085),u=cross/2-.06
    parts.push({name:`inn-gable-${side}`,layer:"roof",position:[0,0,0],color:"#b7ae94",outline:false,
      vertices:[...at(-u,height,v),...at(u,height,v),...at(u,roofY(u),v),
        ...at(-u,height,v),...at(u,roofY(u),v),...at(0,ridge,v),
        ...at(-u,height,v),...at(0,ridge,v),...at(-u,roofY(u),v)]})
    roofBox(`inn-eave-${side}`,side*(run-.04),roofY(run)-.025,0,[.065,.08,span-.07],"#806647")
    if(upper) {
      const normal:[number,number]=[0,side],face=v+side*.025
      beam(`inn-gable-post-${side}`,at(0,height,face),at(0,ridge-.04,face),.085,normal,"roof")
      for(const slope of [-1,1]) {
        beam(`inn-gable-brace-${side}-${slope}`,at(slope*u,height,face),at(0,ridge-.04,face),.075,normal,"roof")
        const verge=side*(span/2-.05)
        beam(`inn-roof-verge-${side}-${slope}`,at(slope*(run-.04),roofY(run)-.025,verge),at(0,ridge-.025,verge),.07,normal,"roof")
      }
    }
  }
  roofBox("inn-ridge",0,ridge+.04,0,[.07,.065,span-.06],"#806647")
  if (!upper && fireplace) parts.push(...hearthParts(width,depth,height,innHearthRoofRise(width,depth,false),undefined,0,layout.hearthZ))
  if(upper && flue) {
    const shaft=hearthParts(width,depth,height,innHearthRoofRise(width,depth),undefined,0,flue.z)
      .filter(p=>p.name.startsWith("chimney-") && p.name!=="chimney-hood")
    for(const part of shaft) {
      part.position[0]+=flue.x-(width/2-.36)
      part.cutawaySide=[Math.sign(flue.x),0]
    }
    parts.push(...shaft)
    box("inn-flue-base",[flue.x,.315,flue.z],[.32,.71,.32],"#999788","wall").cutawaySide=[Math.sign(flue.x),0]
  }
  return parts
}

/** The ladder connects the tavern to an open hatch in the Inn's right aisle. */
export function innLadderParts(floorHeight: number, width = 3, depth = 4): BuildingPart[] {
  const parts:BuildingPart[]=[]
  const {x,z}=innLayout(width,depth,true).hatch
  const box=(name:string,position:Vec3,size:Vec3)=>parts.push({name,position,size,color:"#94764e",layer:"interior",outline:false})
  for(const side of [-1,1]) box(`inn-ladder-rail-${side}`,[x+side*.17,-floorHeight/2+.12,z],[.045,floorHeight+.24,.045])
  for(let i=0;i<Math.ceil(floorHeight/.16);i++) box(`inn-ladder-rung-${i}`,[x,-floorHeight+.12+i*.16,z],[.34,.04,.05])
  return parts
}
