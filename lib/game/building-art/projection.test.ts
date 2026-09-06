import { describe, expect, it } from "vitest"
import { OrthographicCamera, Vector3 } from "three"
import { cameraOffset, yawForView } from "../render/iso"
import { DEFAULT_RECIPE, buildingPrompt, recipeManifest } from "./style"
import { BUILDING_VIEWS, buildingGuideSvg, footprintPolygon, projectBuildingPoint, projectionLayout } from "./projection"

describe("four-view building registration", () => {
  it("matches the actual game camera projection in every quadrant", () => {
    const recipe = { ...DEFAULT_RECIPE, width: 5, depth: 4 }
    const layout = projectionLayout(recipe)
    for (const view of BUILDING_VIEWS) {
      const half=0.5/layout.pixelsPerUnit
      const camera=new OrthographicCamera(-half,half,half,-half,0.1,400)
      camera.position.set(...cameraOffset(yawForView(view.id)));camera.lookAt(0,0,0);camera.updateMatrixWorld()
      for(const [x,y,z] of [[0,0,0],[2,3,-1],[-3,0,2],[3.5,0,-2]]) {
        const vector=new Vector3(x,y,z).project(camera)
        const point=projectBuildingPoint(recipe,view.id,x,y,z)
        expect(point[0]).toBeCloseTo(vector.x/2+0.5,8)
        expect(point[1]).toBeCloseTo(-vector.y/2+0.72,8)
      }
    }
  })
  it("reserves consistent anchors and footprint bounds for all supported sizes", () => {
    for(const [width,depth] of [[1,1],[3,3],[5,5],[1,5],[5,1]]) for(const view of BUILDING_VIEWS) {
      const recipe={...DEFAULT_RECIPE,width,depth}
      expect(projectBuildingPoint(recipe,view.id,0,0,0)).toEqual([0.5,0.72])
      for(const point of footprintPolygon(recipe,view.id)) for(const coordinate of point) {
        expect(coordinate).toBeGreaterThan(0.05);expect(coordinate).toBeLessThan(0.95)
      }
    }
  })
  it("always generates all four views regardless of the preview angle", () => {
    expect(buildingPrompt(DEFAULT_RECIPE)).toBe(buildingPrompt({...DEFAULT_RECIPE,view:3}))
    const manifest=recipeManifest(DEFAULT_RECIPE)
    expect(manifest.atlas.order).toEqual(["Southeast","Northeast","Northwest","Southwest"])
    expect(manifest.placement.views.map((v)=>v.normalizedCell)).toEqual([[0,0,0.5,0.5],[0.5,0,0.5,0.5],[0,0.5,0.5,0.5],[0.5,0.5,0.5,0.5]])
    expect(buildingGuideSvg(DEFAULT_RECIPE)).toContain('width="2048" height="2048"')
  })
})
