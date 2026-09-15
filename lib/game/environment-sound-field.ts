import { SpatialPoints } from "./spatial-points"
import { tileToWorldX, tileToWorldZ, type GameMap } from "./map/types"
import type { TreePlacement } from "./trees/placement"

export interface AmbientPoint { x: number; y: number; z: number; profile: string }

/** Built once per map; camera updates query nearby cells instead of scanning the world. */
export function environmentSoundField(map: GameMap, trees: readonly TreePlacement[]) {
  const water: AmbientPoint[] = [], waterfalls: AmbientPoint[] = []
  for (let i=0;i<map.tiles.length;i++) {
    if(map.tiles[i]!=="water" && !((map.water?.depth[i]??0)>0))continue
    const waterfall = map.water?.motion?.[i] === 'waterfall'
    const points = waterfall ? waterfalls : water
    points.push({x:tileToWorldX(map,i%map.width),z:tileToWorldZ(map,Math.floor(i/map.width)),
      y:.2+(map.water?.surface?.[i]??-.1),profile:waterfall?'scene/waterfall':map.water?.flow[i]||map.water?.motion?.[i]==='flow'?'scene/stream':'scene/shore'})
  }
  const waterfallIndex=new SpatialPoints(waterfalls,8),waterIndex=new SpatialPoints(water,8),treeIndex=new SpatialPoints(trees,8)
  return {
    sample(x:number,z:number,felled:ReadonlySet<number>,visible:(point:AmbientPoint)=>boolean,showTrees=true) {
      let nearestFall:AmbientPoint|undefined,fallDistance=Infinity
      waterfallIndex.forEachWithin(x,z,24,point=>{
        const distance=Math.hypot(point.x-x,point.z-z)
        if(distance<fallDistance&&visible(point)){fallDistance=distance;nearestFall=point}
      })
      let nearestWater:AmbientPoint|undefined,nearestTree:AmbientPoint|undefined,waterDistance=Infinity,treeDistance=Infinity,count=0
      waterIndex.forEachWithin(x,z,18,point=>{
        const distance=Math.hypot(point.x-x,point.z-z)
        if(distance<waterDistance&&visible(point)){waterDistance=distance;nearestWater=point}
      })
      if(showTrees)treeIndex.forEachWithin(x,z,24,(tree,index)=>{
        if(felled.has(index)||tree.dead||tree.walking)return
        const point={x:tree.x,y:tree.y+1,z:tree.z,profile:'scene/wind'}
        if(!visible(point))return
        count++
        const distance=Math.hypot(tree.x-x,tree.z-z)
        if(distance<treeDistance){treeDistance=distance;nearestTree=point}
      })
      return {waterfall:nearestFall,water:nearestWater,trees:nearestTree,canopy:Math.min(1,count/12)}
    },
  }
}
