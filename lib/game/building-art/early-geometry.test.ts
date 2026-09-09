import { describe, expect, it } from "vitest"
import { Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Euler, Quaternion, Vector3 } from "three"
import { buildingParts, type BuildingPart } from "./geometry"
import { RELIC_TABLE_TOP } from "./early-geometry"
import { DEFAULT_RECIPE, EARLY_BUILDINGS, earlyBuildingRecipe, recipeSchema } from "./style"
import { visibleStructureParts } from "./structure"

function bounds(part: BuildingPart) {
  const geometry = part.size ? new BoxGeometry(...part.size) : new BufferGeometry().setAttribute("position",new Float32BufferAttribute(part.vertices!,3))
  geometry.applyMatrix4(new Matrix4().compose(new Vector3(...part.position),new Quaternion().setFromEuler(new Euler(...part.rotation ?? [0,0,0])),new Vector3(1,1,1)))
  geometry.computeBoundingBox(); const box=geometry.boundingBox!.clone(); geometry.dispose(); return box
}

describe("early medieval building kit", () => {
  it.each(EARLY_BUILDINGS)("$name fills every supported footprint within its footprint and reserved bench frontage", (preset) => {
    for(let width=1;width<=5;width++) for(let depth=1;depth<=5;depth++) {
      const parts=buildingParts({...earlyBuildingRecipe(preset.id),width,depth}), whole=new Box3()
      for(const part of parts) {
        const box=bounds(part), context=`${preset.id} ${width}×${depth} ${part.name}`
        expect(box.min.x,context).toBeGreaterThanOrEqual(-width/2-.001)
        expect(box.max.x,context).toBeLessThanOrEqual(width/2+.001)
        expect(box.min.z,context).toBeGreaterThanOrEqual(-depth/2-.001-(part.name.startsWith("tavern-outside-") ? .6 : 0))
        expect(box.max.z,context).toBeLessThanOrEqual(depth/2+.001+(part.name.startsWith("tavern-outside-") ? .6 : 0))
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
  it("keeps ground floors and paving below character foot clearance", () => {
    for (const preset of EARLY_BUILDINGS.filter(p => p.id !== "storehouse")) {
      for (const seed of [0, 17, 99999]) {
        const parts = buildingParts({ ...earlyBuildingRecipe(preset.id), seed })
        const floor = bounds(parts.find(p => p.name === "floor")!)
        expect(floor.min.y).toBeLessThan(0)
        expect(floor.max.y).toBeGreaterThan(0)
        expect(floor.max.y).toBeLessThan(0.005)
        for (const paving of parts.filter(p => p.name.startsWith("paving-"))) {
          const stone = bounds(paving)
          expect(stone.min.y).toBeLessThan(0)
          expect(stone.max.y).toBeGreaterThan(floor.max.y)
          expect(stone.max.y).toBeLessThanOrEqual(0.003)
        }
      }
    }
  })
  it("marks religious structures with crosses while keeping all four gateways open", () => {
    const enclosure=buildingParts(DEFAULT_RECIPE)
    expect(enclosure.filter(p=>p.name.startsWith("gate-cross-upright-"))).toHaveLength(4)
    const shelter=buildingParts(earlyBuildingRecipe("monk-shelter"))
    expect(shelter.filter(p=>p.name.startsWith("shelter-cross-upright-"))).toHaveLength(2)
    for(const type of ["house","storehouse","wood-shelter","tavern"] as const) {
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

  it("gives homes and the tavern a fireplace clear of beds and a chimney above the roof in every footprint", () => {
    for(const variant of ["monk-shelter", "house", "tavern"] as const) {
      for(let width=1;width<=5;width++) for(let depth=1;depth<=5;depth++) {
        const parts = buildingParts({...earlyBuildingRecipe(variant),width,depth})
        const hearth = bounds(parts.find(p => p.name === "hearth-slab")!)
        const chimney = bounds(parts.find(p => p.name === "chimney-mouth")!)
        const roof = new Box3()
        parts.filter(p => p.name.startsWith("thatch-bundle-")).forEach(p => roof.union(bounds(p)))
        expect(chimney.min.y).toBeGreaterThan(roof.max.y)
        for(const bed of parts.filter(p => p.name.startsWith("straw-bed-"))) {
          expect(hearth.intersectsBox(bounds(bed)),`${variant} ${width}×${depth} ${bed.name}`).toBe(false)
        }
      }
    }
  })

  it("identifies stores by roof battens and keeps utility buildings free of chimneys", () => {
    for(const variant of ["storehouse", "wood-shelter", "enclosure"] as const) {
      const parts = buildingParts(earlyBuildingRecipe(variant))
      expect(parts.some(p => p.name.startsWith("chimney-") || p.name.startsWith("hearth-"))).toBe(false)
      expect(parts.filter(p => p.name.startsWith("store-roof-batten-"))).toHaveLength(variant === "storehouse" ? 2 : 0)
    }
  })

  it("cuts away entire chimneys without floating rim stones, keeping the fireplace visible", () => {
    for(const variant of ["monk-shelter", "house", "tavern"] as const) {
      const parts = buildingParts(earlyBuildingRecipe(variant))
      const chimneyCount = parts.filter(p => p.name.startsWith("chimney-")).length
      for(const x of [-1,1]) for(const z of [-1,1]) {
        const visible = visibleStructureParts(parts,true,[x,z])
        expect([0,chimneyCount]).toContain(visible.filter(p => p.name.startsWith("chimney-")).length)
        expect(visible.some(p => p.name === "hearth-embers")).toBe(true)
      }
    }
  })
})

it("keeps the full door below its arched roof and opens side and rear windows", () => {
  const parts=buildingParts(earlyBuildingRecipe("house"))
  const door=bounds(parts.find(p=>p.name==="doorway-shadow")!)
  const brows=parts.filter(p=>p.name.startsWith("door-arch-thatch-")).map(bounds)
  expect(brows.length).toBeGreaterThan(10)
  for(const roof of brows.filter(b=>b.min.x<door.max.x && b.max.x>door.min.x && b.max.z>door.min.z)) {
    expect(roof.min.y-.065).toBeGreaterThan(door.max.y)
  }
  expect(Math.min(...brows.map(b=>b.min.z))).toBeLessThan(.1)
  const walls=parts.filter(p=>p.layer==="wall").map(bounds)
  const windows=[
    new Box3(new Vector3(-.96,.27,-.09),new Vector3(-.77,.40,.09)),
    new Box3(new Vector3(.77,.27,-.09),new Vector3(.96,.40,.09)),
    new Box3(new Vector3(-.09,.27,-.96),new Vector3(.09,.40,-.77)),
  ]
  for(const opening of windows) expect(walls.some(wall=>wall.intersectsBox(opening))).toBe(false)
})

it("gives the tavern an unobstructed rear doorway and a taller front brow",()=>{
  const recipe=earlyBuildingRecipe("tavern"),parts=buildingParts(recipe)
  const back=parts.find(p=>p.name==="back-doorway-shadow")!
  expect(back.position[2]).toBeLessThan(0)
  expect(back.size![1]).toBe(parts.find(p=>p.name==="doorway-shadow")!.size![1])
  const passage=new Box3(new Vector3(-.19,.02,-recipe.depth/2+.07),new Vector3(.19,back.size![1]-.02,-recipe.depth/2+.19))
  expect(parts.filter(p=>p.layer!=="base" && !p.name.startsWith("back-door") && bounds(p).intersectsBox(passage)).map(p=>p.name)).toEqual([])
  const highest=(prefix:string)=>Math.max(...parts.filter(p=>p.name.startsWith(prefix)).map(p=>bounds(p).max.y))
  expect(highest("door-arch-edge-")).toBeGreaterThan(highest("back-door-arch-edge-")+.4)
  for(const x of [-1,1]) {
    const inside=visibleStructureParts(parts,true,[x,-1])
    expect(inside.some(p=>p.name.startsWith("back-door"))).toBe(false)
  }
})
