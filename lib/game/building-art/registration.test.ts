import { describe, expect, it } from "vitest"
import { buildingDimensions } from "./dimensions"
import { projectionLayout } from "./projection"
import { ISO_PITCH } from "../render/iso"
import { LEGACY_RECIPE as DEFAULT_RECIPE, VARIANTS } from "./style"
import { foundationCorners, registrationTransforms, studyRegistrations, type Matrix, type Point } from "./registration"
const apply=(m:Matrix,[x,y]:Point)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]

describe("sprite footprint registration",()=>{
  it("fits all three ground corners, preserves verticals and joins without a seam",()=>{
    for(const variant of VARIANTS) for(let view=0;view<4;view++) {
      const recipe={...DEFAULT_RECIPE,variant:variant.id},source=studyRegistrations(variant.id)[view]!
      const target=foundationCorners(recipe,view),fit=registrationTransforms(recipe,view,source)
      for(const [index,m] of [[0,fit.left],[1,fit.left],[1,fit.right],[2,fit.right]] as const) {
        const result=apply(m,source[index]);expect(result[0]).toBeCloseTo(target[index][0],10);expect(result[1]).toBeCloseTo(target[index][1],10)
      }
      expect(fit.left[2]).toBe(0);expect(fit.right[2]).toBe(0)
      expect(fit.left[3]).toBe(fit.right[3])
      for(const y of [0,0.5,1]) {
        const left=apply(fit.left,[source[1][0],y]),right=apply(fit.right,[source[1][0],y])
        expect(left[0]).toBeCloseTo(right[0],10);expect(left[1]).toBeCloseTo(right[1],10)
      }
    }
  })
  it("calibrates the illustrated eave to the same world height as the procedural building in all four views", () => {
    for (const variant of VARIANTS) for (let view = 0; view < 4; view++) {
      const recipe = { ...DEFAULT_RECIPE, variant: variant.id }
      const source = studyRegistrations(variant.id)[view]!
      const fit = registrationTransforms(recipe, view, source)
      const ground = apply(fit.left, source[1]), eave = apply(fit.left, source[3]!)
      const height = (ground[1] - eave[1]) / (projectionLayout(recipe).pixelsPerUnit * Math.cos(ISO_PITCH))
      expect(height).toBeCloseTo(buildingDimensions(recipe).eaveHeight, 8)
    }
  })
  it("rejects reversed or degenerate corner picks",()=>{
    expect(()=>registrationTransforms(DEFAULT_RECIPE,0,[[0.8,0.5],[0.5,0.8],[0.2,0.5]])).toThrow()
    expect(()=>registrationTransforms(DEFAULT_RECIPE,0,[[0.2,0.5],[0.5,0.5],[0.8,0.5]])).toThrow()
  })
})
