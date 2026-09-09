import { describe, expect, it } from "vitest"
import * as THREE from "three"
import { createBasePersonRig } from "../base-person/rig"
import { BASE_PERSON } from "../base-person/pose"
import { personCamera } from "../base-person/camera"
import { personRecipe } from "../base-person/design"
import { populationDesign } from "../base-person/population"
import { personWalkStride } from "../base-person/gait"
import { TRAVELER_TYPES } from "../travelers"
import { PASSENGER_CALLINGS } from "./party-assets"
import { packHandlerDesign } from "./handler"
import { handlerHand, handlerHandView } from "./handler-assets"
import { inkAnimalFrame } from "../base-person/ink"

describe("pack animal handlers", () => {
  it("preserves people's legs and stride while planting the staff and registering the lead hand", () => {
    const camera=personCamera(), origin=new THREE.Vector3().applyMatrix4(camera.matrixWorldInverse)
    for(const calling of PASSENGER_CALLINGS)for(let variant=0;variant<6;variant++) {
      const design=packHandlerDesign(calling,variant), original=populationDesign(TRAVELER_TYPES[calling],variant)
      expect(design.walkingStick).toBe(true)
      expect(personWalkStride(design)).toBe(personWalkStride(original))
      const rig=createBasePersonRig(personRecipe(design)), bare=createBasePersonRig(personRecipe(original))
      try {for(const clip of ["walk","wearyWalk","idle"] as const)for(const frame of clip==="idle"?[0]:[0,5,10,15])for(let row=0;row<8;row++) {
        rig.view(row);bare.view(row);rig.pose(frame/20,clip);bare.pose(frame/20,clip);rig.root.updateMatrixWorld(true)
        const current=rig.joints(),previous=bare.joints()
        for(const side of ["left","right"] as const)for(const joint of ["Hip","Knee","Foot"] as const) expect(current[`${side}${joint}`]).toEqual(previous[`${side}${joint}`])
        expect(rig.root.getObjectByName("walking-staff")!.visible).toBe(true)
        const actual=rig.sockets.leftHand.getWorldPosition(new THREE.Vector3()).applyMatrix4(camera.matrixWorldInverse).sub(origin)
        const point=handlerHand(calling,variant,clip,row,frame)!
        const registration=new THREE.Vector3(...handlerHandView(point,BASE_PERSON.camera.viewSize/BASE_PERSON.cellSize))
        expect(actual.distanceTo(registration)).toBeLessThan(1e-6)
      }}finally{rig.dispose();bare.dispose()}
    }
  })
  it("adds a single local-color edge without lowering the planted footprint", () => {
    const source=new Uint8ClampedArray(7*7*4)
    for(let y=2;y<=4;y++)for(let x=2;x<=4;x++)source.set([150,120,90,255],(y*7+x)*4)
    const ink=inkAnimalFrame(source,7)
    expect([...ink.slice((3*7+3)*4,(3*7+3)*4+4)]).toEqual([150,120,90,255])
    const edge=[...ink.slice((3*7+1)*4,(3*7+1)*4+4)]
    expect(edge[0]).toBeLessThan(150);expect(edge[0]).toBeGreaterThan(edge[1]);expect(edge[3]).toBe(255)
    expect(ink[(3*7)*4+3]).toBe(0)
    expect(ink[(5*7+3)*4+3]).toBe(0)
  })
})
