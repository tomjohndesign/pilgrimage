/** Shared furniture and walking clearances for the open sleeping floor. */
export function innLayout(width: number, depth: number, upper = false, flue?: {x:number;z:number}) {
  const bedWidth=Math.min(.45,width*.19),rows=Math.max(2,Math.floor(depth/.95))
  const step=(depth-.24)/rows,bedLength=Math.min(.70,step-.20)
  const aisle=width*.215,frontCross=depth/2-(upper ? .11 : .94)
  const beds=([-1,0,1] as const).flatMap(side=>Array.from({length:rows},(_,row)=>({
    x:side*(width/2-.36),z:-depth/2+.12+(row+.5)*step,
    bunk:side!==0 && row<Math.ceil(rows/2),side,row,
  })).filter(b=>(upper || b.z+bedLength/2<frontCross-.15)
    && (!flue || Math.abs(b.x-flue.x)>bedWidth/2+.24 || Math.abs(b.z-flue.z)>bedLength/2+.24)))
  return {beds,bedWidth,bedLength,aisle,frontCross,hatch:{x:aisle,z:0},hearthZ:depth/2-.5}
}
