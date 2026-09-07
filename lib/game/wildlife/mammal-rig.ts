import * as THREE from "three"
import { model, loft, type CrossSection, type Point } from "../transport/geometry"
import { MAMMAL_ANATOMY, REGION_COLORS, type BodyRegion, type BodySection, type LimbAnatomy, type MammalKind } from "./anatomy"
import { mergeJoint } from "./mesh"
import { fitHide } from "./hide"
import { burrowPreview } from "./burrow-motion"
import { wildlifePose, type WildlifeGait } from "./gait"
import { animalOffset, type AnimalClip, type AnimalJoint, type AnimalRigEdits } from "./rig-edits"

const lerpPoint = (a: Point,b: Point,t: number): Point => a.map((v,i)=>THREE.MathUtils.lerp(v,b[i],t)) as Point

/** Smooth one connected contour; construction regions are carried with its rings. */
function smoothSections(source: BodySection[], subdivisions = 3): BodySection[] {
  const result: BodySection[] = []
  const curve = (a:number,b:number,c:number,d:number,t:number) => .5*((2*b)+(-a+c)*t+(2*a-5*b+4*c-d)*t*t+(-a+3*b-3*c+d)*t*t*t)
  for(let i=0;i<source.length-1;i++) for(let step=0;step<subdivisions;step++) {
    const t=step/subdivisions, a=source[Math.max(0,i-1)],b=source[i],c=source[i+1],d=source[Math.min(source.length-1,i+2)]
    result.push({at:b.at.map((_,axis)=>curve(a.at[axis],b.at[axis],c.at[axis],d.at[axis],t)) as Point,
      width:Math.max(.004,curve(a.width,b.width,c.width,d.width,t)),top:Math.max(.004,curve(a.top,b.top,c.top,d.top,t)),
      bottom:Math.max(.004,curve(a.bottom??a.top,b.bottom??b.top,c.bottom??c.top,d.bottom??d.top,t)),region:t<.5?b.region:c.region})
  }
  return [...result,source.at(-1)!]
}
function limbSections(points: Point[], limb: LimbAnatomy, region: BodyRegion): BodySection[] {
  const rings: BodySection[]=[]
  for(let bone=0;bone<3;bone++) for(const t of [0,.35,.7]) {
    const radius=THREE.MathUtils.lerp(limb.radii[bone],limb.radii[bone+1],t)
    rings.push({at:lerpPoint(points[bone],points[bone+1],t),width:radius*.82,top:radius,region})
  }
  rings.push({at:points[3],width:limb.radii[3]*.82,top:limb.radii[3],region})
  return rings
}

/** A species-authored skeleton under a continuous axial hide and tapered limb sleeves.
 * Timed actions remain an adapter; the anatomical bind pose is independently inspectable. */
export function createMammalRig(kind: MammalKind, construction = false) {
  const a=MAMMAL_ANATOMY[kind],m=model(), deer=kind==="deer"||kind==="buck", rabbit=kind==="rabbit", fox=kind==="fox", boar=kind==="boar", sheep=kind==="sheep",goat=kind==="goat"
  const neck=new THREE.Group(),head=new THREE.Group(),tail=new THREE.Group(),ears:THREE.Group[]=[]
  neck.name="neck";head.name="head";tail.name="tail";m.root.add(neck,head,tail)
  const skinColor=new THREE.Color(a.coat),bellyColor=new THREE.Color(a.belly),scratchColor=new THREE.Color()
  const colorGeometry=(geometry:THREE.BufferGeometry,sections:BodySection[],sides=12,belly=true) => {
    const colors=new Float32Array(geometry.attributes.position.count*3)
    sections.forEach((section,i)=>{for(let j=0;j<sides;j++){
      const underside=Math.max(0,-Math.cos(j/sides*Math.PI*2)-.25)
      scratchColor.copy(construction?new THREE.Color(REGION_COLORS[section.region]):skinColor)
      if(!construction&&belly)scratchColor.lerp(bellyColor,underside*(fox?.95:deer?.55:.3))
      if(!construction&&sheep)scratchColor.multiplyScalar(.97+.035*Math.sin(i*1.7+j*2.9))
      scratchColor.toArray(colors,(i*sides+j)*3)
    }})
    geometry.setAttribute("color",new THREE.BufferAttribute(colors,3))
  }
  const surface=(sections:BodySection[],name:string,parent=m.root,belly=true) => {
    const geometry=loft(sections,12);colorGeometry(geometry,sections,12,belly)
    const mesh=new THREE.Mesh(geometry,new THREE.MeshLambertMaterial({vertexColors:true}));mesh.name=name;parent.add(mesh);return mesh
  }
  // Rump, loin, rib cage, shoulder and neck share vertices rather than overlapping barrels.
  const neckVector=new THREE.Vector3(...a.neck.poll).sub(new THREE.Vector3(...a.neck.base))
  const neckLength=neckVector.length(),middle=lerpPoint(a.neck.base,a.neck.poll,.5)
  const axialControls=a.body.slice(0,-2),neckControls:BodySection[]=[
    {at:a.neck.base,width:a.neck.rootWidth,top:a.neck.rootWidth,bottom:a.neck.rootWidth,region:"neck"},
    {at:middle,width:THREE.MathUtils.lerp(a.neck.rootWidth,a.neck.width,.65),top:a.neck.width*1.15,region:"neck"},
    {at:a.neck.poll,width:a.neck.width*.85,top:a.neck.width*.9,region:"neck"},
  ]
  const bind=smoothSections([...axialControls,...neckControls]),bodyCount=axialControls.length*3
  if(sheep) for(const ring of bind.slice(0,bodyCount)) { ring.top*=1.025;ring.width*=1.025 }
  const hide=surface(bind,"continuous-body-hide")
  const skull=a.skull
  const headRings=smoothSections([
    {at:[0,.02,-.105],width:skull.width*.55,top:skull.height*.7,region:"skull"},
    {at:[0,.02,0],width:skull.width*.9,top:skull.height,bottom:skull.height*.78,region:"skull"},
    {at:[0,0,skull.length*.26],width:skull.width,top:skull.height*.85,bottom:skull.height*.85,region:"skull"},
    {at:[0,-skull.drop*.55,skull.length*.60],width:skull.width*(boar?.72:rabbit?.82:.57),top:skull.height*.54,bottom:skull.height*.50,region:"muzzle"},
    {at:[0,-skull.drop,skull.length],width:skull.noseWidth,top:boar?.075:.039,bottom:.03,region:"muzzle"},
  ])
  const skullMesh=surface(headRings,"skull-and-muzzle",head)
  if(sheep&&!construction) {
    const colors=skullMesh.geometry.attributes.color as THREE.BufferAttribute,c=new THREE.Color("#ded8c9")
    for(let i=0;i<colors.count;i++)colors.setXYZ(i,c.r,c.g,c.b)
  }
  const detailColor=(region:BodyRegion,color:string)=>construction?REGION_COLORS[region]:color
  m.oval([0,-skull.drop,skull.length+.007],[skull.noseWidth*.91,boar?.06:.03,.023],detailColor("muzzle",boar?"#927966":a.dark),head)
  for(const sign of [-1,1]) {
    m.oval([sign*skull.width*.91,.049,skull.length*.20],[.016,rabbit?.026:.019,.022],construction?"#343c3e":"#221f1a",head)
    const base=a.ears.base.map((v,i)=>i===0?v*sign:v) as Point,tip=a.ears.tip.map((v,i)=>i===0?v*sign:v) as Point
    const earParent=rabbit?new THREE.Group():head
    if(rabbit){earParent.position.set(...base);head.add(earParent);ears.push(earParent)}
    const ear:CrossSection[]=[{at:base,width:a.ears.width*.45,top:.018},{at:lerpPoint(base,tip,.45),width:a.ears.width,top:.021},{at:lerpPoint(base,tip,.80),width:a.ears.width*.64,top:.015},{at:tip,width:.003,top:.004}]
    if(sheep) {
      const earGroup=new THREE.Group();head.add(earGroup);earGroup.position.set(...base)
      const axis=new THREE.Vector3(...tip).sub(new THREE.Vector3(...base)),length=axis.length()
      earGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),axis.normalize())
      m.mesh(loft([{at:[0,0,0],width:.028,top:.018},{at:[0,0,length*.43],width:a.ears.width,top:.024},{at:[0,0,length*.8],width:.045,top:.017},{at:[0,0,length],width:.007,top:.005}],8),detailColor("skull","#d6c7b4"),[0,0,0],earGroup)
      mergeJoint(earGroup)
    } else m.mesh(loft(rabbit?ear.map(section=>({...section,at:section.at.map((v,i)=>v-base[i]) as Point})):ear,8),detailColor("skull",a.coat),[0,0,0],earParent)
    if(rabbit||fox){
      const local=(t:number)=>lerpPoint(base,tip,t).map((v,i)=>v-(rabbit?base[i]:0)) as Point
      m.bar(local(.22),local(.79),rabbit?.017:.024,detailColor("skull",rabbit?"#b09885":a.dark),earParent)
    }
    if(kind==="buck") {
      const points:Point[]=[[sign*.09,.12,-.035],[sign*.18,.33,-.12],[sign*.30,.51,-.18],[sign*.38,.63,-.12]]
      for(let i=1;i<points.length;i++)m.bar(points[i-1],points[i],.035-i*.008,"#bfa77e",head)
      for(let i=1;i<3;i++)m.bar(points[i],[points[i][0]+sign*.05,points[i][1]+.17,points[i][2]+.13],.012,"#cbb58e",head)
    }
    if(goat) {
      const points:Point[]=[[sign*.065,.10,-.015],[sign*.09,.28,-.08],[sign*.105,.36,-.21],[sign*.09,.34,-.28]]
      for(let i=1;i<points.length;i++)m.bar(points[i-1],points[i],.03-i*.006,detailColor("skull","#a89673"),head)
    }
    if(boar)m.bar([sign*.16,-.12,.26],[sign*.18,-.005,.34],.021,detailColor("muzzle","#d4c4a0"),head)
  }
  if(goat)m.mesh(loft([{at:[0,-.12,.15],width:.05,top:.03},{at:[0,-.23,.18],width:.014,top:.008}],8),detailColor("skull",a.dark),[0,0,0],head)
  if(fox) {
    // Pale cheeks/ruff are part of the skull surface rather than an extra inflated muzzle.
    const colors=skullMesh.geometry.attributes.color as THREE.BufferAttribute
    if(!construction)for(let i=0;i<headRings.length;i++)for(let j=0;j<12;j++)if(Math.cos(j/12*Math.PI*2)<-.1){scratchColor.set(a.belly);colors.setXYZ(i*12+j,scratchColor.r,scratchColor.g,scratchColor.b)}
  }
  const tailRings=smoothSections(a.tail.points.map((at,i)=>({at,width:a.tail.radii[i],top:a.tail.radii[i],region:"tail"})))
  const tailMesh=surface(tailRings,"tail-hide",tail,false)
  if(!construction&&(fox||rabbit||deer)) {
    const colors=tailMesh.geometry.attributes.color as THREE.BufferAttribute
    for(let i=0;i<tailRings.length;i++)if(!fox||i>=tailRings.length*.65)for(let j=0;j<12;j++){scratchColor.set("#e0d1b0");colors.setXYZ(i*12+j,scratchColor.r,scratchColor.g,scratchColor.b)}
  }
  const legs=[a.front,a.front,a.hind,a.hind].map((limb,index)=>{
    const sign=index%2?-1:1,points=limb.points.map(p=>[p[0]*sign,p[1],p[2]] as Point),region=index<2?"forelimb":"hindlimb"
    const mesh=surface(limbSections(points,limb,region),`${index%2?"right":"left"}-${index<2?"fore":"hind"}limb-hide`)
    const foot=new THREE.Group();foot.name=`${index%2?"right":"left"}-${index<2?"fore":"hind"}foot`;m.root.add(foot)
    const [w,h,l]=limb.foot,color=detailColor("feet",rabbit?a.belly:a.dark)
    if(deer||goat||sheep||boar)for(const side of [-1,1])m.box([side*w*.26,-h*.5,l*.10],[w*.46,h,l],color,foot)
    else m.mesh(loft([{at:[0,-h*.35,-l*.3],width:w*.42,top:h*.6,bottom:h*.6},{at:[0,-h*.45,l*.22],width:w*.5,top:h*.5,bottom:h*.5},{at:[0,-h*.65,l*.63],width:w*.28,top:h*.3,bottom:h*.3}],8),color,[0,0,0],foot)
    mergeJoint(foot)
    return {limb,mesh,foot,region:region as BodyRegion}
  })
  // Only merge small static details. The main hide retains its shared, editable vertices.
  ears.forEach(mergeJoint)
  mergeJoint(head)
  const parts:THREE.Mesh[]=[]
  m.root.traverse(part=>{if(part instanceof THREE.Mesh)parts.push(part)})
  const joints:Partial<Record<AnimalJoint,{position:Point;editable:boolean;reason?:string}>>={}
  const point=new THREE.Vector3(),base=new THREE.Vector3(),poll=new THREE.Vector3(),direction=new THREE.Vector3(),rotation=new THREE.Quaternion()
  const posedRings=bind.map(section=>({...section,at:[...section.at] as Point}))
  const register=(name:AnimalJoint,position:Point,editable=false,reason?:string)=>{joints[name]={position,editable,reason}}
  const headLocal=(at:Point):Point=>{point.set(...at).applyQuaternion(head.quaternion).add(head.position);return point.toArray() as Point}
  return {root:m.root,parts,joints:()=>joints,
    pose(phase:number,moving:boolean,age:number,grazing:number,flying:boolean|number=false,gait:WildlifeGait="walk",posture:{drive?:number;lying?:number;edits?:AnimalRigEdits;clip?:AnimalClip;burrow?:ReturnType<typeof burrowPreview>}={}) {
      const clip=posture.clip??(moving?gait:grazing>.5?"graze":"idle"),lying=posture.lying??0
      const shelter=rabbit&&clip==="burrow"?(posture.burrow??burrowPreview(phase)):null
      const motion=wildlifePose(kind,shelter?"walk":gait,shelter?.stridePhase??phase,shelter?shelter.drive:posture.drive??(moving?1:0),lying,posture.edits,clip,phase)
      ears.forEach(ear=>{ear.rotation.x=-(shelter?.tuck??0)*1.35})
      base.set(...motion.spine(a.neck.base));poll.set(...motion.spine(a.neck.poll))
      const amount=THREE.MathUtils.clamp(grazing,0,1),feedingPitch=boar?1.1:goat?1.18:rabbit?.7:.95
      const mouthHeight=.05+.01*(1-Math.cos(phase*Math.PI*2))
      const mouthY=(-skull.drop-.027)*Math.cos(feedingPitch)-skull.length*Math.sin(feedingPitch)
      const vertical=mouthHeight-base.y-mouthY
      const grazeAngle=Math.acos(THREE.MathUtils.clamp(vertical/neckLength,-1,1))-Math.atan2(neckVector.z,neckVector.y)
      direction.copy(neckVector).applyAxisAngle(new THREE.Vector3(1,0,0),grazeAngle*amount)
      if(amount>0)poll.copy(base).add(direction)
      const edit=animalOffset(posture.edits,clip,"head",phase)
      poll.add(new THREE.Vector3(...edit));direction.copy(poll).sub(base)
      if(direction.lengthSq()<1e-10)direction.copy(neckVector)
      direction.normalize().multiplyScalar(neckLength);poll.copy(base).add(direction)
      rotation.setFromUnitVectors(neckVector.clone().normalize(),direction.clone().normalize())
      neck.position.copy(base);neck.quaternion.copy(rotation)
      head.position.copy(poll);head.rotation.set(THREE.MathUtils.lerp(skull.pitch+motion.pitch*.2,feedingPitch,amount),motion.twist*(1-amount),0)
      for(let i=0;i<bind.length;i++){
        const section=bind[i]
        if(i<bodyCount)posedRings[i].at=motion.spine(section.at)
        else {point.set(...section.at).sub(new THREE.Vector3(...a.neck.base)).applyQuaternion(rotation).add(base);posedRings[i].at=point.toArray() as Point}
      }
      fitHide(hide.geometry,posedRings,12)
      tail.position.set(...motion.spine(a.tail.base));tail.position.add(new THREE.Vector3(...animalOffset(posture.edits,clip,"tail",phase)))
      tail.rotation.set(lying*-.15,motion.twist*-.6+lying*.9,0)
      motion.legs.forEach((leg,index)=>{
        const surface=legs[index],side=index%2?"right":"left",rear=index>=2
        fitHide(surface.mesh.geometry,limbSections([leg.hip,leg.upperJoint,leg.knee,leg.ankle],surface.limb,surface.region),12)
        surface.foot.position.set(...leg.ankle)
        register(`${side}${rear?"Hip":"Shoulder"}`,leg.hip)
        register(`${side}${rear?"Thigh":"Elbow"}`,leg.upperJoint)
        register(`${side}${rear?"Knee":"Wrist"}`,leg.knee)
        register(`${side}${rear?"Foot":"Hand"}`,leg.ankle,!leg.planted,leg.planted?"Ground contact stays planted. Edit a swing frame to move this foot.":undefined)
      })
      register("pelvis",motion.spine([0,a.hind.points[0][1],a.hind.points[0][2]]))
      register("chest",motion.spine([0,a.front.points[0][1],a.front.points[0][2]]))
      register("leftScapula",motion.spine(a.scapula));register("rightScapula",motion.spine([-a.scapula[0],a.scapula[1],a.scapula[2]]))
      register("neck",base.toArray() as Point,false,"The cervical chain stays attached to the shoulders.")
      register("head",head.position.toArray() as Point,true,"Move the poll; neck length stays fixed.")
      register("muzzle",headLocal([0,-skull.drop-.027,skull.length]),false,"The muzzle follows the skull.")
      register("tail",tail.position.toArray() as Point,true)
      m.root.updateMatrixWorld(true)
    },
    dispose(){m.dispose();parts.forEach(part=>{if(!Array.isArray(part.material))part.material.dispose()})},
  }
}
