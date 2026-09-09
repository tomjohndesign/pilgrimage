import * as THREE from "three"
import { loft, model } from "./geometry"

/** Soft asymmetric loads shared by every pack animal, fitted to its barrel. */
export function createPackLoad(m: ReturnType<typeof model>, breadth: number, packed: boolean) {
  const load = new THREE.Group(); load.name = "pack-saddle"; m.root.add(load)
  if (packed) {
    m.mesh(loft([{ at:[0,0,-.43],width:breadth+.05,top:.035,bottom:.05 },
      { at:[0,.04,0],width:breadth+.1,top:.05,bottom:.05 },
      { at:[0,0,.43],width:breadth+.04,top:.025,bottom:.04 }]),"#786b4d",[0,0,0],load).name="saddle-pad"
    // Soft, separately tied loads: a long blanket roll and slumped grain sack
    // on the left, two unequal round bundles on the right. Balanced mass does
    // not mean mirrored silhouettes or matching colors.
    const bundle = (x:number,y:number,z:number,length:number,width:number,height:number,color:string,name:string) => {
      const mesh=m.mesh(loft([
        {at:[0,0,-length*.5],width:width*.24,top:height*.25,bottom:height*.2},
        {at:[-.025,.015,-length*.3],width:width*.85,top:height*.8,bottom:height*.78},
        {at:[.018,-.01,length*.12],width,top:height,bottom:height*.9},
        {at:[.01,-.025,length*.4],width:width*.7,top:height*.68,bottom:height*.6},
        {at:[0,-.02,length*.5],width:width*.2,top:height*.2,bottom:height*.18},
      ]),color,[x,y,z],load);mesh.name=name;return mesh
    }
    bundle(breadth+.15,-.16,-.08,.88,.19,.24,"#9c8967","long-cloth-roll").rotation.x=.12
    bundle(breadth+.1,.09,.21,.38,.16,.17,"#b0a080","tied-grain-sack").rotation.z=-.16
    bundle(-breadth-.15,-.16,-.18,.48,.21,.27,"#796f58","slumped-wool-bundle").rotation.z=.16
    bundle(-breadth-.13,-.09,.27,.42,.18,.20,"#9b8061","small-linen-bundle").rotation.x=-.18
    for(const sign of [-1,1]) {
      for(const z of sign>0?[-.28,.17]:[-.19,.28]) {
        m.bar([sign*.16,.15,z],[sign*(breadth+.14),.12,z+.025],.018,"#59472e",load)
        m.bar([sign*(breadth+.14),.12,z+.025],[sign*(breadth+.34),-.11,z],.018,"#59472e",load)
        m.bar([sign*(breadth+.34),-.11,z],[sign*(breadth+.16),-.38,z-.02],.018,"#59472e",load)
      }
      m.bar([sign*breadth,.04,.15],[sign*breadth,-.65,.15],.027,"#493b28",load)
    }
    m.bar([-breadth,-.65,.15],[breadth,-.65,.15],.027,"#493b28",load)
  }
  return load
}
