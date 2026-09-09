import { createPackLoad } from "./pack-rig"
import * as THREE from "three"
import { animalProfile } from "./assets"
import { animalLeg, animalMotion, spinePoint } from "./animal-pose"
import { animalHead, bitLocal } from "./bridle"
import { animalCoat } from "./coats"
import { model, loft, type CrossSection, type Point } from "./geometry"
import { animalOffset, type AnimalRigEdits, type AnimalJoint } from "../wildlife/rig-edits"

/** Bovine skin on the same four-beat, fixed-bone contact solver as the equines.
 * Paired claws, a broad muzzle, short heavy neck and tufted tail distinguish
 * cattle without changing stance travel or inventing a second gait system. */
export function createOxRig(coatId?: string, hitched = false, pack = false) {
  const m = model(), p = animalProfile("ox"), h = p.legHeight, colors = animalCoat("ox", coatId)
  const skin: Array<{ geometry: THREE.BufferGeometry; bind: Float32Array }> = []
  const body = (sections: CrossSection[], color: string, name: string) => {
    const geometry = loft(sections), mesh = m.mesh(geometry, color, [0, 0, 0]); mesh.name = name
    skin.push({ geometry, bind: new Float32Array(geometry.attributes.position.array) })
  }
  body([
    { at: [0,h+.16,-1.04], width:.12,top:.19,bottom:.15 },
    { at: [0,h+.17,-.82], width:.4,top:.37,bottom:.3 },
    { at: [0,h+.13,-.4], width:.44,top:.35,bottom:.4 },
    { at: [0,h+.12,.1], width:.47,top:.38,bottom:.43 },
    { at: [0,h+.14,.55], width:.43,top:.46,bottom:.35 },
    { at: [0,h+.12,.86], width:.3,top:.33,bottom:.25 },
  ],colors.coat,"ox-barrel")
  body([{at:[0,h-.1,-.52],width:.3,top:.08,bottom:.12},{at:[0,h-.22,.3],width:.32,top:.08,bottom:.12}],colors.belly,"ox-belly")
  const neck = new THREE.Group(); neck.name="articulated-neck"; m.root.add(neck)
  const { neckOrigin, poll } = animalHead("ox","common")
  m.mesh(loft([{at:[0,-.14,0],width:.32,top:.27,bottom:.3},{at:[0,.06,.36],width:.26,top:.23,bottom:.27},{at:poll,width:.2,top:.19,bottom:.2}]),colors.coat,[0,0,0],neck)
  m.mesh(loft([{at:[0,-.3,.1],width:.09,top:.07,bottom:.15},{at:[0,-.27,.46],width:.07,top:.06,bottom:.1}]),colors.belly,[0,0,0],neck).name="dewlap"
  const head = new THREE.Group(); head.name="articulated-head"; head.position.set(...poll); neck.add(head)
  m.mesh(loft([{at:[0,.05,-.03],width:.22,top:.14,bottom:.17},{at:[0,-.1,.16],width:.21,top:.14,bottom:.16},{at:[0,-.3,.37],width:.17,top:.1,bottom:.1}]),colors.coat,[0,0,0],head)
  m.mesh(loft([{at:[0,-.29,.34],width:.2,top:.1,bottom:.09},{at:[0,-.33,.49],width:.21,top:.08,bottom:.08}]),colors.muzzle,[0,0,0],head).name="broad-muzzle"
  for (const side of [-1,1]) {
    m.box([side*.2,-.045,.12],[.025,.035,.04],"#251f18",head)
    m.box([side*.13,-.29,.475],[.035,.026,.017],colors.dark,head)
    m.mesh(loft([{at:[side*.19,.02,-.01],width:.075,top:.065},{at:[side*.4,-.03,.015],width:.11,top:.045},{at:[side*.49,-.04,.05],width:.02,top:.015}]),colors.coat,[0,0,0],head).name="lateral-ear"
    const horn = [[side*.17,.13,-.04],[side*.33,.18,-.08],[side*.46,.32,-.1],[side*.47,.47,-.04]] as Point[]
    for(let i=0;i<horn.length-1;i++) m.bar(horn[i],horn[i+1],.06-i*.018,i===2?colors.dark:"#bfb08b",head).name="ox-horn"
  }
  // A rope halter follows the broad muzzle; the lead joins its cheek knot.
  if (pack) {
    const halter = new THREE.Group(); halter.name = "pack-halter"; head.add(halter)
    for (const side of [-1, 1]) {
      const knot = bitLocal("ox", "common", side)
      m.bar([side * .2, .1, -.06], knot, .022, "#59472e", halter)
      m.bar(knot, [side * .18, -.2, .4], .022, "#59472e", halter)
    }
    m.bar([-.18, -.2, .4], [.18, -.2, .4], .022, "#59472e", halter)
    m.bar(bitLocal("ox", "common", -1), bitLocal("ox", "common", 1), .022, "#59472e", halter)
    m.bar([-.2, .1, -.06], [.2, .1, -.06], .022, "#59472e", halter)
  }
  const load = createPackLoad(m, .44, pack)
  const tail = new THREE.Group(); tail.name="articulated-tail"; m.root.add(tail)
  m.mesh(loft([{at:[0,0,0],width:.036,top:.035},{at:[.025,-.42,-.09],width:.025,top:.025},{at:[.04,-.76,-.12],width:.024,top:.025}]),colors.coat,[0,0,0],tail)
  m.mesh(loft([{at:[.04,-.7,-.12],width:.058,top:.045},{at:[.035,-.92,-.14],width:.025,top:.025}]),colors.dark,[0,0,0],tail).name="tail-tuft"
  const yoke = new THREE.Group(); yoke.name="ox-withers-yoke"; m.root.add(yoke)
  if(hitched) {
    m.bar([-.54,0,0],[.54,0,0],.075,"#70583c",yoke)
    for(const side of [-1,1]) m.bar([side*.37,0,0],[side*.33,-.36,.04],.035,"#4e3d28",yoke)
  }
  const legs = new THREE.Group(); legs.name="articulated-legs"; m.root.add(legs)
  const joints: Partial<Record<AnimalJoint,{position:Point;editable:boolean;reason?:string}>> = {}
  return {...m, joints:()=>joints, pose(phase:number,moving:boolean,grazing=0,edits?:AnimalRigEdits) {
    const motion=animalMotion("ox",phase,moving), clip=moving?"walk":grazing>.5?"graze":"idle"
    for(const {geometry,bind} of skin) {
      const positions=geometry.attributes.position as THREE.BufferAttribute
      for(let i=0;i<positions.count;i++) positions.setXYZ(i,...spinePoint([bind[i*3],bind[i*3+1],bind[i*3+2]],"ox",phase,moving))
      positions.needsUpdate=true;geometry.computeVertexNormals();geometry.computeBoundingSphere()
    }
    neck.position.set(...spinePoint(neckOrigin,"ox",phase,moving));neck.rotation.set(motion.pitch+motion.neck,0,motion.roll)
    head.position.set(...poll);head.position.add(new THREE.Vector3(...animalOffset(edits,clip,"head",phase)))
    head.rotation.x=.05+motion.head
    if(grazing) {
      head.rotation.x=THREE.MathUtils.lerp(head.rotation.x,-.6,grazing)
      const tip=new THREE.Vector3(0,-.33,.49).applyEuler(head.rotation).add(new THREE.Vector3(...poll))
      let lo=0,hi=2
      for(let i=0;i<24;i++){const a=(lo+hi)/2;if(neck.position.y+tip.y*Math.cos(a)-tip.z*Math.sin(a)>.08)lo=a;else hi=a}
      neck.rotation.x=THREE.MathUtils.lerp(neck.rotation.x,(lo+hi)/2,grazing)
    }
    load.position.set(...spinePoint([0,h+.49,0],"ox",phase,moving));load.rotation.set(motion.pitch,0,motion.roll)
    tail.position.set(...spinePoint([0,h+.45,-.96],"ox",phase,moving));tail.position.add(new THREE.Vector3(...animalOffset(edits,clip,"tail",phase)))
    tail.rotation.set(motion.pitch,motion.tail,motion.roll)
    yoke.position.set(...spinePoint([0,h+.58,.48],"ox",phase,moving));yoke.rotation.set(motion.pitch,0,motion.roll)
    for(const child of [...legs.children]) {legs.remove(child);child.traverse(part=>{if(part instanceof THREE.Mesh)part.geometry.dispose()})}
    for(const rear of [false,true])for(const side of ["left","right"] as const) {
      const pose=animalLeg("ox",side,rear,phase,moving)
      for(const [name,position] of [[`${side}${rear?"Hip":"Shoulder"}`,pose.hip],[`${side}${rear?"Thigh":"Elbow"}`,pose.upperJoint],[`${side}${rear?"Knee":"Wrist"}`,pose.knee],[`${side}${rear?"Foot":"Hand"}`,pose.ankle]] as [AnimalJoint,Point][])
        joints[name]={position,editable:false,reason:"Fixed bone lengths and planted hoof contacts follow the shared walking solver."}
      m.bar(pose.hip,pose.upperJoint,rear?.12:.105,colors.coat,legs)
      m.bar(pose.upperJoint,pose.knee,.067,colors.coat,legs)
      m.bar(pose.knee,pose.ankle,.047,colors.points,legs)
      const hoof=new THREE.Group();hoof.name=`${side}-${rear?"hind":"fore"}-hoof`;hoof.position.set(...pose.ankle);hoof.rotation.x=pose.hoofPitch;legs.add(hoof)
      for(const toe of [-1,1]) { const claw = m.mesh(loft([{at:[toe*.042,-.035,-.065],width:.037,top:.034,bottom:.035},{at:[toe*.046,-.038,.1],width:.039,top:.029,bottom:.032}]),"#3c352b",[0,0,0],hoof); claw.name="cloven-toe"
        const vertices=claw.geometry.attributes.position as THREE.BufferAttribute
        for(let i=0;i<vertices.count;i++)if(vertices.getY(i)<-.06)vertices.setY(i,-.07)
        vertices.needsUpdate=true;claw.geometry.computeVertexNormals()
      }
    }
    joints.chest={position:spinePoint([0,h+.2,p.legZ],"ox",phase,moving),editable:false}
    joints.pelvis={position:spinePoint([0,h+.2,-p.legZ],"ox",phase,moving),editable:false}
    m.root.updateMatrixWorld(true)
    for(const [name,part] of [["head",head],["tail",tail]] as const) joints[name]={position:m.root.worldToLocal(part.getWorldPosition(new THREE.Vector3())).toArray() as Point,editable:true}
  }}
}
