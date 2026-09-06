import { describe, expect, it } from "vitest"
import { Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Euler, Quaternion, Vector3 } from "three"
import { buildingParts, type BuildingPart } from "./geometry"
import { RELIC_TABLE_TOP } from "./early-geometry"
import { DEFAULT_RECIPE, EARLY_BUILDINGS, earlyBuildingRecipe, recipeSchema } from "./style"

function bounds(part: BuildingPart) {
  const geometry = part.size ? new BoxGeometry(...part.size) : new BufferGeometry().setAttribute("position",new Float32BufferAttribute(part.vertices!,3))
  geometry.applyMatrix4(new Matrix4().compose(new Vector3(...part.position),new Quaternion().setFromEuler(new Euler(...part.rotation ?? [0,0,0])),new Vector3(1,1,1)))
  geometry.computeBoundingBox(); const box=geometry.boundingBox!.clone(); geometry.dispose(); return box
}

describe("early medieval building kit", () => {
  it.each(EARLY_BUILDINGS)("$name fills every supported footprint without spilling into neighbours", (preset) => {
    for(let width=1;width<=5;width++) for(let depth=1;depth<=5;depth++) {
      const parts=buildingParts({...earlyBuildingRecipe(preset.id),width,depth}), whole=new Box3()
      for(const part of parts) {
        const box=bounds(part), context=`${preset.id} ${width}×${depth} ${part.name}`
        expect(box.min.x,context).toBeGreaterThanOrEqual(-width/2-.001)
        expect(box.max.x,context).toBeLessThanOrEqual(width/2+.001)
        expect(box.min.z,context).toBeGreaterThanOrEqual(-depth/2-.001)
        expect(box.max.z,context).toBeLessThanOrEqual(depth/2+.001)
        expect(box.min.y,context).toBeGreaterThanOrEqual(-.06)
        expect(Number.isFinite(box.max.y),context).toBe(true)
        whole.union(box)
      }
      expect(whole.max.x-whole.min.x).toBeGreaterThan(width-.1)
      expect(whole.max.z-whole.min.z).toBeGreaterThan(depth-.1)
    }
  })
  it("starts with a roofless 3×3 enclosure and a clear gate passage in each wall", () => {
    expect(DEFAULT_RECIPE.variant).toBe("enclosure")
    expect([DEFAULT_RECIPE.width,DEFAULT_RECIPE.depth]).toEqual([3,3])
    const parts=buildingParts(DEFAULT_RECIPE)
    expect(parts.some(p=>p.layer==="roof")).toBe(false)
    expect(parts.filter(p=>p.name.startsWith("open-gate-"))).toHaveLength(4)
    for(const [width,depth] of [[1,1],[3,3],[5,2]]) {
      const walls=buildingParts({...DEFAULT_RECIPE,width,depth}).filter(p=>p.layer==="wall").map(bounds)
      for(const side of [-1,1]) {
        const x=side*width/2,z=side*depth/2
        const northSouth=new Box3(new Vector3(-.18,.15,z-.16),new Vector3(.18,.3,z+.16))
        const eastWest=new Box3(new Vector3(x-.16,.15,-.18),new Vector3(x+.16,.3,.18))
        expect(walls.some(b=>b.intersectsBox(northSouth))).toBe(false)
        expect(walls.some(b=>b.intersectsBox(eastWest))).toBe(false)
      }
    }
    expect(bounds(parts.find(p=>p.name==="relic-table")!).max.y).toBeCloseTo(RELIC_TABLE_TOP)
    expect(parts.some(p=>p.name.startsWith("paving-"))).toBe(true)
    expect(parts.filter(p=>p.name.startsWith("loose-plank-"))).toHaveLength(3)
  })
  it("marks religious structures with crosses while keeping all four gateways open", () => {
    const enclosure=buildingParts(DEFAULT_RECIPE)
    expect(enclosure.filter(p=>p.name.startsWith("gate-cross-upright-"))).toHaveLength(4)
    const shelter=buildingParts(earlyBuildingRecipe("monk-shelter"))
    expect(shelter.filter(p=>p.name.startsWith("shelter-cross-upright-"))).toHaveLength(2)
    for(const type of ["shepherd-hut","storehouse","wood-shelter"] as const) {
      expect(buildingParts(earlyBuildingRecipe(type)).some(p=>p.name.includes("cross-"))).toBe(false)
    }
  })
  it("keeps all four views the same model and seeds repeatable material variation", () => {
    for(const preset of EARLY_BUILDINGS) {
      const recipe=earlyBuildingRecipe(preset.id), parts=buildingParts(recipe)
      for(let view=0;view<4;view++) expect(buildingParts({...recipe,view})).toEqual(parts)
      expect(buildingParts({...recipe,seed:recipe.seed+1})).not.toEqual(parts)
    }
  })
  it("provides distinct shelter interiors and limits recipes to one through five tiles", () => {
    expect(buildingParts(earlyBuildingRecipe("monk-shelter")).filter(p=>p.name.startsWith("straw-bed-"))).toHaveLength(4)
    expect(buildingParts(earlyBuildingRecipe("wood-shelter")).some(p=>p.name.startsWith("firewood-"))).toBe(true)
    expect(buildingParts(earlyBuildingRecipe("storehouse")).some(p=>p.name.startsWith("raised-leg-"))).toBe(true)
    for(const width of [0,6,12,1.5]) expect(recipeSchema.safeParse({...DEFAULT_RECIPE,width}).success).toBe(false)
    for(const width of [1,5]) expect(recipeSchema.safeParse({...DEFAULT_RECIPE,width}).success).toBe(true)
  })
})
