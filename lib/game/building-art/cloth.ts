import type { BuildingPart, Vec3 } from "./geometry"

/** A level, lightly sagging linen canopy with a few hand-sewn repairs. */
export function marketCanopyParts(width: number, depth: number, top: number): BuildingPart[] {
  const parts: BuildingPart[] = [], w=width/2, d=depth/2
  const at = (x: number,z: number,lift=0): Vec3 => [x,top-Math.min(.12,width*.06)*Math.cos(x/w*Math.PI/2)**2-Math.min(.12,depth*.06)*Math.cos(z/d*Math.PI/2)**2+lift,z]
  const face = (name: string,a: Vec3,b: Vec3,c: Vec3,e: Vec3,color: string) => parts.push({
    name:`market-cloth-${name}`,layer:"roof",position:[0,0,0],vertices:[...a,...b,...c,...a,...c,...e],color,outline:false,
  })
  for(let row=0;row<4;row++) for(let col=0;col<4;col++) {
    const x=-w+col*width/4,z=-d+row*depth/4
    face(`panel-${row}-${col}`,at(x,z),at(x+width/4,z),at(x+width/4,z+depth/4),at(x,z+depth/4),["#baae91","#b7ab8f","#bdb195"][(row+col*2)%3])
  }
  // Only a folded thread-thin hem: the fabric is a surface, not a roof slab.
  for(const side of [-1,1]) for(let i=0;i<8;i++) {
    const a=-w+i*width/8,b=a+width/8
    face(`hem-${side}-${i}`,at(a,side*d),at(b,side*d),at(b,side*d,-.009),at(a,side*d,-.009),"#a4987d")
  }
  for(const [i,[x,z,sx,sz,color]] of ([[-width*.23,-depth*.13,.25,.22,"#908f6c"],[width*.2,depth*.22,.28,.18,"#a47c65"],[-width*.07,depth*.33,.14,.13,"#c7b798"]] as [number,number,number,number,string][]).entries()) {
    const a=x-sx/2,b=x+sx/2,c=z-sz/2,e=z+sz/2
    face(`patch-${i}`,at(a,c,.007),at(b,c+.012,.007),at(b-.015,e,.007),at(a,e-.012,.007),color)
    // Short isolated stitches, never a dense woven screen over the whole canopy.
    for(let stitch=0;stitch<4;stitch++) {
      const px=a+(stitch+.5)*sx/4
      for(const pz of [c,e]) face(`stitch-${i}-${stitch}-${pz}`,at(px-.008,pz-.02,.01),at(px+.008,pz-.02,.01),at(px+.008,pz+.018,.01),at(px-.008,pz+.018,.01),"#d1c1a2")
    }
  }
  return parts
}
