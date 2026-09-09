import { innPlacementLayout } from "../inn"
import type { GameMap, BuildingDef, TilePos } from "../map/types"
import type { TerrainId } from "../map/terrain"
import { EARLY_BUILDINGS, earlyBuildingRecipe, type BuildingRecipe } from "./style"
import { makeRng } from "../rng"
import { adoptNeighborChimney, roofAlignedRotation, placementClearance } from "../building-placement-layout"
import { buildingApproaches, rotatedFootprint, type BuildingRotation } from "../building-rotation"

/** Choose a distinct neighbor with its own normal footprint and layout. */
export function randomPreviewNeighbor(type: BuildingRecipe["variant"], seed: number): BuildingRecipe {
  const random = makeRng(seed), choices = EARLY_BUILDINGS.filter(preset => preset.id !== type)
  return { ...earlyBuildingRecipe(choices[Math.floor(random() * choices.length)].id),
    layoutSeed: Math.floor(random() * 65536) }
}

/** Origins are integer tiles relative to the main building's minimum corner. */
export interface PreviewPlacement {
  id: string
  recipe: BuildingRecipe
  x: number
  z: number
  rotation: BuildingRotation
  anchor?: "left" | "right"
}

export function previewNeighbors(recipe: BuildingRecipe, neighbor?: BuildingRecipe | PreviewPlacement[]): PreviewPlacement[] {
  return Array.isArray(neighbor) ? neighbor.map(p=>{
    if(!p.anchor) return p
    const size=rotatedFootprint({w:p.recipe.width,d:p.recipe.depth},p.rotation)
    return {...p,x:p.anchor==="left" ? -size.w : recipe.width,z:recipe.depth-size.d}
  }) : neighbor ? [{id:"neighbor",recipe:neighbor,x:recipe.width,z:recipe.depth-neighbor.depth,rotation:0}] : []
}

/** A tavern with two adjoining homes: one hearth, one unheated household. */
export function tavernPreviewNeighbors(): PreviewPlacement[] {
  return [
    {id:"neighbor-left",recipe:{...earlyBuildingRecipe("house"),layoutSeed:81,fireplace:false},x:-2,z:2,rotation:0,anchor:"left"},
    {id:"neighbor-right",recipe:{...earlyBuildingRecipe("house"),layoutSeed:1,fireplace:true},x:3,z:2,rotation:0,anchor:"right"},
  ]
}

export function previewBuilding(recipe: BuildingRecipe, at: TilePos, id: string, rotation: BuildingRotation = 0): BuildingDef {
  return {id,buildType:recipe.variant,label:recipe.subject,x:at.x,z:at.z,...rotatedFootprint({w:recipe.width,d:recipe.depth},rotation),rotation,
    height:recipe.wallHeight,layoutSeed:recipe.layoutSeed,hearthZ:recipe.hearthZ,fireplace:recipe.fireplace,color:"#e7d8b9",roofColor:"#c4a05f"}
}

/** One repeatable site shared by every camera view, with room to place more. */
export function buildingPreviewMap(recipe: BuildingRecipe, neighbor?: BuildingRecipe | PreviewPlacement[]): GameMap {
  const neighbors=previewNeighbors(recipe,neighbor)
  const placed=[{id:"workshop",recipe,x:0,z:0,rotation:0 as BuildingRotation},...neighbors]
  const shells=placed.map(p=>previewBuilding(p.recipe,p,p.id,p.rotation))
  const minX=Math.min(...shells.map(b=>b.x)),minZ=Math.min(...shells.map(b=>b.z))
  const maxX=Math.max(...shells.map(b=>b.x+b.w)),maxZ=Math.max(...shells.map(b=>b.z+b.d))
  const width=maxX-minX+12,depth=maxZ-minZ+12,offsetX=6-minX,offsetZ=6-minZ,roadZ=depth-4
  const entranceZ=6+maxZ-minZ,doorX=Math.floor(width/2)
  const tiles:TerrainId[]=Array.from({length:width*depth},(_,i)=>{
    const x=i%width,z=Math.floor(i/width)
    if(z===roadZ) return "path"
    if(x===doorX && z>=entranceZ && z<roadZ) return "track"
    if(x<3 && z<4 || x>=width-3 && z<3) return "forest"
    return "grass"
  })
  const map:GameMap={width,depth,tiles,seed:7919,buildings:[],road:Array.from({length:width},(_,x)=>({x,z:roadZ}))}
  const recipes=new Map(placed.map(p=>[p.id,p.recipe]))
  for(const shell of shells) {
    const next={...shell,x:shell.x+offsetX,z:shell.z+offsetZ}
    map.buildings.push(next.buildType === "inn" ? {...next,...innPlacementLayout(map,next)} : next.hearthZ === undefined ? {...next,...adoptNeighborChimney(map,next,b=>recipes.get(b.id)!.roofRise)} : next)
  }
  const occupied=(x:number,z:number)=>map.buildings.some(b=>x>=b.x && x<b.x+b.w && z>=b.z && z<b.z+b.d)
  for(const building of map.buildings) for(const entry of buildingApproaches(map,building)) {
    // The reserved frontage stays visible at every orientation; never paint a
    // connecting track through another building in a mixed cluster.
    if(entry.x<0 || entry.x>=width || entry.z<0 || entry.z>=depth) continue
    map.tiles[entry.z*width+entry.x]="track"
    if((building.rotation ?? 0)===0 && entry.z>=building.z+building.d)
      for(let z=entry.z;z<roadZ;z++) {if(occupied(entry.x,z)) break;map.tiles[z*width+entry.x]="track"}
  }
  return map
}

/** Preview and commit exactly the same orientation, footprint and adopted flue. */
export function previewPlacement(map: GameMap, recipe: BuildingRecipe, at: TilePos, rotation: BuildingRotation,
  snap: boolean, recipes: ReadonlyMap<string,BuildingRecipe>) {
  let building=previewBuilding(recipe,at,"placement-ghost",rotation)
  const riseFor=(b:BuildingDef)=>b.id===building.id ? recipe.roofRise : recipes.get(b.id)!.roofRise
  const aligned=snap ? roofAlignedRotation(map,building,riseFor) : rotation
  building={...building,...rotatedFootprint({w:recipe.width,d:recipe.depth},aligned),rotation:aligned}
  building={...building,...(building.buildType === "inn" ? innPlacementLayout(map,building) : adoptNeighborChimney(map,building,riseFor))}
  return {building,recipe:{...recipe,layoutSeed:building.layoutSeed,hearthZ:building.hearthZ,fireplace:building.fireplace},
    error:placementClearance(map,building),snapped:aligned!==rotation}
}
