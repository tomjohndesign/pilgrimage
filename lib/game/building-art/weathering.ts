import type { BuildingPart, Vec3 } from "./geometry"

/** Small, clustered signs of use; paths and live storage bays stay clear. */
export function buildingWeathering(width: number,depth: number,height: number,variant: string,seed: number): BuildingPart[] {
  const parts: BuildingPart[] = [], w=width/2,d=depth/2
  const box=(name:string,position:Vec3,size:Vec3,color:string,layer:BuildingPart["layer"]="base")=>parts.push({name:`weather-${name}`,position,size,color,layer,outline:false})
  const face=(name:string,vertices:number[],color:string,layer:BuildingPart["layer"]="base")=>parts.push({name:`weather-${name}`,position:[0,0,0],vertices,color,layer,outline:false})
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
