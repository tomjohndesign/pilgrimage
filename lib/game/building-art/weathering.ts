import type { BuildingPart, Vec3 } from "./geometry"

/** Small, clustered signs of use; paths and live storage bays stay clear. */
export function buildingWeathering(width: number,depth: number,height: number,variant: string,seed: number): BuildingPart[] {
  const parts: BuildingPart[] = [], w=width/2,d=depth/2
  let serial=0
  const random=()=>{const n=Math.sin(++serial*91.7+seed*37.3)*45758.5453;return n-Math.floor(n)}
  const box=(name:string,position:Vec3,size:Vec3,color:string,layer:BuildingPart["layer"]="base")=>parts.push({name:`weather-${name}`,position,size,color,layer,outline:false})
  const face=(name:string,vertices:number[],color:string,layer:BuildingPart["layer"]="base")=>parts.push({name:`weather-${name}`,position:[0,0,0],vertices,color,layer,outline:false})
  // Grass lives in a handful of protected corners, with warm seed heads mixed in.
  for(let patch=0;patch<5;patch++) {
    const side=patch%2 ? -1 : 1, cx=side*(w-.07),cz=-d+.14+(depth-.28)*random()
    for(let blade=0;blade<4;blade++) {
      const x=cx+(random()-.5)*.065,z=cz+(random()-.5)*.11,h=.055+random()*.075
      face(`grass-${patch}-${blade}`,[x-.015,.006,z,x+.015,.006,z,x+(random()-.5)*.045,h,z+.02],["#647449","#7d8550","#97925c"][blade%3])
    }
    box(`moss-${patch}`,[side*(w-.10),.006,cz],[.13,.009,.10],patch%2 ? "#777b4c" : "#898359")
  }
  if(["tavern","house","hall","monk-shelter","sheep-pen"].includes(variant)) {
    // An uneven spray up one side, with a few reddish leaves rather than a green blanket.
    for(let leaf=0;leaf<15;leaf++) {
      const t=leaf/15,y=.06+t*Math.min(.75,height*.95),z=-d+.19+Math.sin(t*8)*.065+(random()-.5)*.08,x=-w+.045
      const r=.027+random()*.028
      face(`ivy-${leaf}`,[x,y-r,z,x-.008,y,z-r,x,y+r,z,x,y-r,z,x,y+r,z,x-.008,y,z+r],leaf%7===0 ? "#8d6850" : ["#596747","#758052","#86905a"][leaf%3],"wall")
      parts[parts.length-1].cutawaySide=[-1,0]
    }
  }
  if(["tavern","house","hall","market"].includes(variant) && width>=2 && depth>=2) {
    const x=w-.29,z=d-.35
    // Eight broad staves, a swollen middle and wooden hoops.
    const rings=[[.02,.115],[.08,.14],[.27,.14],[.34,.115]]
    for(let i=0;i<8;i++) {
      const a=i*Math.PI/4,b=(i+1)*Math.PI/4,vertices:number[]=[]
      const p=(angle:number,ring:number):Vec3=>[x+Math.cos(angle)*rings[ring][1],rings[ring][0],z+Math.sin(angle)*rings[ring][1]]
      for(let row=0;row<3;row++) vertices.push(...p(a,row),...p(b,row),...p(b,row+1),...p(a,row),...p(b,row+1),...p(a,row+1))
      vertices.push(x,.34,z,...p(a,3),...p(b,3))
      face(`barrel-stave-${i}`,vertices,i%3 ? "#8f7651" : "#a0845b","interior")
      for(const y of [.09,.26]) {
        const p=(t:number,h:number)=>[x+Math.cos(t)*.145,h,z+Math.sin(t)*.145]
        face(`barrel-hoop-${i}-${y}`,[...p(a,y),...p(b,y),...p(b,y+.025),...p(a,y),...p(b,y+.025),...p(a,y+.025)],"#625b45","interior")
      }
    }
    box("sack",[x-.29,.12,z-.08],[.2,.24,.18],"#a39471","interior")
    box("sack-tie",[x-.29,.255,z-.08],[.065,.055,.05],"#796a51","interior")
    for(let i=0;i<3;i++) box(`sack-fibre-${i}`,[x-.35+i*.045,.13,z+.013],[.014,.13,.007],"#b3a17c","interior")
    // A faded madder cloth hanging from the side of the work/living space.
    const px=w-.045,pz=-depth*.12
    face("hanging-cloth",[px,.27,pz-.10,px,.27,pz+.09,px,Math.min(.59,height+.05),pz+.1,px,.27,pz-.1,px,Math.min(.59,height+.05),pz+.1,px,Math.min(.59,height+.05),pz-.1],"#986657","wall")
    parts[parts.length-1].cutawaySide=[1,0]
  }
  return parts
}
