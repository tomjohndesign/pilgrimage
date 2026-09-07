import * as THREE from "three"
import { model } from "../transport/geometry"

/** An open earthen arch, with a recessed throat instead of a painted hole. */
export function createBurrowRig() {
  const m=model(),shape=new THREE.Shape()
  shape.moveTo(-.57,0)
  for(let i=0;i<=16;i++){const a=Math.PI-i/16*Math.PI;shape.lineTo(Math.cos(a)*.57,Math.sin(a)*.70)}
  shape.lineTo(.29,0)
  for(let i=0;i<=16;i++){const a=i/16*Math.PI;shape.lineTo(Math.cos(a)*.29,Math.sin(a)*.60)}
  shape.closePath()
  const bank=new THREE.ExtrudeGeometry(shape,{depth:.9,steps:6,bevelEnabled:false});bank.translate(0,0,-.9)
  const positions=bank.attributes.position
  for(let i=0;i<positions.count;i++){const t=-positions.getZ(i)/.9,factor=Math.sqrt(Math.max(.06,1-t*t));positions.setX(i,positions.getX(i)*factor);positions.setY(i,positions.getY(i)*factor)}
  bank.computeVertexNormals()
  m.mesh(bank,"#766047",[0,0,0])
  // The far wall and sloping floor sit behind the opening, letting the nose lead in.
  const throat=new THREE.Shape();throat.moveTo(-.27,0)
  for(let i=0;i<=16;i++){const a=Math.PI-i/16*Math.PI;throat.lineTo(Math.cos(a)*.27,Math.sin(a)*.50)}
  throat.closePath();m.mesh(new THREE.ShapeGeometry(throat),"#262116",[0,0,-.42])
  const floor=m.box([0,-.12,-.35],[.58,.035,.85],"#493a28");floor.rotation.x=-.3
  m.oval([-.46,.07,-.34],[.25,.19,.53],"#6c583f")
  m.oval([.46,.07,-.34],[.25,.19,.53],"#6c583f")
  return m
}
