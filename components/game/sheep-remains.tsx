"use client"

import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import { InstancedMesh, Object3D } from "three"
import type { WildlifeAnimal } from "@/lib/game/wildlife/simulation"

/** A small muted stain at the work mat, cleared with the final meat load. */
export function SheepRemains({animals,scale}:{animals:readonly WildlifeAnimal[];scale:number}) {
  const mesh=useRef<InstancedMesh>(null),pose=useMemo(()=>new Object3D(),[])
  useFrame(()=>{
    if(!mesh.current)return
    let count=0
    for(const animal of animals) {
      if(animal.concealed || !(animal.fold?.carcass || (animal.fold?.slaughter ?? 0)>.35))continue
      const s=Math.sin(animal.heading),c=Math.cos(animal.heading)
      pose.position.set(animal.x+(.15*s+.09*c)*scale,animal.y+.052,animal.z+(.15*c-.09*s)*scale)
      pose.rotation.set(-Math.PI/2,0,-animal.heading)
      pose.scale.set(.17*scale,.12*scale,1);pose.updateMatrix()
      mesh.current.setMatrixAt(count++,pose.matrix)
    }
    mesh.current.count=count;mesh.current.instanceMatrix.needsUpdate=true
  })
  return <instancedMesh ref={mesh} name="sheep-work-mat-stains" args={[undefined,undefined,Math.max(1,animals.length)]} count={0} frustumCulled={false} raycast={()=>{}}>
    <circleGeometry args={[1,7]}/><meshLambertMaterial color="#713c32" polygonOffset polygonOffsetFactor={-1}/>
  </instancedMesh>
}
