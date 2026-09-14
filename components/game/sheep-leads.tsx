"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { InstancedMesh, Object3D, Vector3 } from "three"
import type { WildlifeAnimal } from "@/lib/game/wildlife/simulation"

/** A visible hemp lead distinguishes an escorted animal from the grazing flock. */
export function SheepLeads({animals,scale}:{animals:readonly WildlifeAnimal[];scale:number}) {
  const mesh=useRef<InstancedMesh>(null)
  const scratch=useMemo(()=>({pose:new Object3D(),axis:new Vector3(0,1,0),a:new Vector3(),b:new Vector3(),direction:new Vector3()}),[])
  useFrame(()=>{
    if(!mesh.current)return
    const {pose,axis,a,b,direction}=scratch
    let count=0
    for(const animal of animals) {
      const escort=animal.fold?.escort
      if(!escort || animal.concealed)continue
      a.set(animal.x+Math.sin(animal.heading)*.16*scale,animal.y+.23*scale,animal.z+Math.cos(animal.heading)*.16*scale)
      b.set(escort.guide.x,escort.guide.y+.3*scale,escort.guide.z)
      direction.subVectors(b,a)
      const length=direction.length()
      if(length<.05)continue
      pose.position.copy(a).add(b).multiplyScalar(.5)
      pose.quaternion.setFromUnitVectors(axis,direction.multiplyScalar(1/length))
      pose.scale.set(1,length,1);pose.updateMatrix()
      mesh.current.setMatrixAt(count++,pose.matrix)
    }
    mesh.current.count=count;mesh.current.instanceMatrix.needsUpdate=true
  })
  return <instancedMesh ref={mesh} name="sheep-leading-ropes" args={[undefined,undefined,Math.max(1,animals.length)]} count={0} frustumCulled={false} raycast={()=>{}}>
    <cylinderGeometry args={[.008*scale,.008*scale,1,4]}/>
    <meshLambertMaterial color="#ae9974"/>
  </instancedMesh>
}
