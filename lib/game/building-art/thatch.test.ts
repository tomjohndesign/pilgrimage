import { describe, expect, it } from "vitest"
import { marketCanopyParts } from "./cloth"
import { thatchSurface } from "./thatch"
import { structureParts } from "./structure"
import { BUILD_CATALOG } from "../balance"
import { BUILDING_DOOR_HEIGHT } from "./dimensions"
import { buildingEntry } from "../building-rotation"

describe("layered straw roofs", () => {
  it("uses sparse broad tufts and thin irregular eaves, with irregular overlapping courses", () => {
    const parts = thatchSurface([1,1,-1],[1,1,1],[-1,0,-1],[-1,0,1],17)
    const grain = parts.find(p => p.name === "thatch-grain-1")!.vertices!
    expect(grain.length/18).toBeLessThanOrEqual(16)
    for(let i=0;i<grain.length;i+=18) {
      expect(Math.hypot(grain[i+3]-grain[i],grain[i+4]-grain[i+1])).toBeGreaterThan(.3)
    }
    const ends = parts.filter(p => p.name.startsWith("thatch-bundle-0-")).map(p => p.vertices![3])
    expect(new Set(ends).size).toBeGreaterThan(1)
    const eave = parts.find(p => p.name === "thatch-eave-1")!.vertices!
    const heights = eave.filter((_,i) => i%3 === 1)
    expect(Math.max(...heights)-Math.min(...heights)).toBeGreaterThan(.05)
    const first = parts.find(p => p.name === "thatch-bundle-0-0-1")!.vertices!
    const next = parts.find(p => p.name === "thatch-bundle-1-0-1")!.vertices!
    expect(next[0]).toBeGreaterThan(first[3])
    expect(first[1]-.5*(first[0]+1)).toBeGreaterThan(next[1]-.5*(next[0]+1))
  })

  it("softens roof edges without spilling into neighbouring building tiles", () => {
    const parts=thatchSurface([1,1,-1],[1,1,1],[-1,0,-1],[-1,0,1],17)
    const eave=parts.find(p=>p.name==="thatch-eave-1")!.vertices!
    expect(new Set(eave.filter((_,i)=>i%3===0).map(x=>x.toFixed(3))).size).toBeGreaterThan(3)
    for(const part of parts) for(let i=0;i<part.vertices!.length;i+=3) {
      expect(Math.abs(part.vertices![i])).toBeLessThanOrEqual(1)
      expect(Math.abs(part.vertices![i+2])).toBeLessThanOrEqual(1)
    }
  })

  it("puts the long hall's door on its narrow end, aligned with its navigable entrance", () => {
    const hall = BUILD_CATALOG.find(b => b.id === "hall")!
    expect(hall.d).toBeGreaterThan(hall.w)
    const parts = structureParts({...hall,buildType:"hall"})
    const door = parts.find(p => p.name === "doorway-shadow")!
    expect(door.position[0]).toBe(-.5)
    expect(door.position[2]).toBeGreaterThan(hall.d/2-.2)
    expect(buildingEntry({...hall,x:0,z:0}).z).toBe(hall.d)
    expect(parts.some(p => p.name.includes("-log-"))).toBe(true)
    expect(parts.some(p => p.name.endsWith("-plaster"))).toBe(true)
    expect(parts.some(p => p.name.startsWith("door-arch-infill-"))).toBe(true)
    expect(parts.some(p => p.name.startsWith("window-side-"))).toBe(true)
    expect(door.size![1]).toBeGreaterThanOrEqual(BUILDING_DOOR_HEIGHT)
    expect(hall.height).toBeLessThanOrEqual(.8)
  })
})

it("makes the market canopy level at all four corners, with sag and isolated stitched repairs", () => {
  const parts=marketCanopyParts(2,2,.9),panels=parts.filter(p=>p.name.includes("panel-"))
  const points=panels.flatMap(p=>Array.from({length:p.vertices!.length/3},(_,i)=>p.vertices!.slice(i*3,i*3+3)))
  const corners=points.filter(([x,,z])=>Math.abs(x)===1 && Math.abs(z)===1)
  expect(corners.length).toBeGreaterThan(0)
  for(const [,y] of corners) expect(y).toBe(.9)
  expect(Math.min(...points.map(p=>p[1]))).toBeLessThan(.70)
  const midEdges=points.filter(([x,,z])=>x===0 && Math.abs(z)===1)
  expect(midEdges.every(p=>p[1]<.8)).toBe(true)
  const hem=parts.find(p=>p.name==="market-cloth-hem-1-0")!.vertices!
  expect(Math.abs(hem[4]-hem[7])).toBeCloseTo(.009)
  expect(parts.filter(p=>p.name.includes("patch-"))).toHaveLength(3)
  expect(parts.filter(p=>p.name.includes("stitch-"))).toHaveLength(24)
})
