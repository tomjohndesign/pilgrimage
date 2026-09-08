import { expect, it } from "vitest"
import * as THREE from "three"
import { mergedBuildingGeometry, buildingGeometryLevels, buildingPartDetail } from "./merged-geometry"
import { buildingPartGeometry } from "./part-geometry"
import { constructionParts } from "./construction"
import { BUILD_CATALOG } from "../balance"

it("merging the catalogue preserves every transformed vertex, normal and linear color", () => {
  for (const def of BUILD_CATALOG) {
    const parts = constructionParts({ ...def, buildType: def.id, x: 0, z: 0 }).filter(p => !p.surface)
    const merged = mergedBuildingGeometry(parts)
    let offset = 0
    for (const part of parts) {
      const original = buildingPartGeometry(part), geometry = original.index ? original.toNonIndexed() : original
      geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...part.position),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(...part.rotation ?? [0, 0, 0])), new THREE.Vector3(1, 1, 1)))
      const count = geometry.getAttribute("position").count, color = new THREE.Color(part.color)
      for (const name of ["position", "normal"])
        expect(merged.getAttribute(name).array.slice(offset * 3, (offset + count) * 3)).toEqual(geometry.getAttribute(name).array)
      const colors = merged.getAttribute("color")
      expect(colors.getX(offset)).toBeCloseTo(color.r, 6)
      expect(colors.getY(offset)).toBeCloseTo(color.g, 6)
      expect(colors.getZ(offset)).toBeCloseTo(color.b, 6)
      offset += count
      geometry.dispose(); if (geometry !== original) original.dispose()
    }
    expect(merged.getAttribute("position").count).toBe(offset)
    merged.dispose()
  }
})

it("distant buildings drop only interiors and fine roof grain, retaining their original shell and buffers", () => {
  let interiorRemoved = 0, grainRemoved = 0
  for (const def of BUILD_CATALOG) {
    const parts = constructionParts({ ...def, buildType: def.id, x: 0, z: 0 }).filter(p => !p.surface)
    const levels = buildingGeometryLevels(parts)
    for (const detail of [1, 2]) {
      const expected = mergedBuildingGeometry(parts.filter(part => buildingPartDetail(part) >= detail))
      for (const name of ["position", "normal", "color"]) {
        expect(levels[detail].getAttribute(name)).toBe(levels[0].getAttribute(name))
        const actual = levels[detail].index ? levels[detail].toNonIndexed() : levels[detail]
        expect(actual.getAttribute(name).array).toEqual(expected.getAttribute(name).array)
        if (actual !== levels[detail]) actual.dispose()
      }
      expected.dispose()
    }
    const count = (level: number) => levels[level].index?.count ?? levels[level].getAttribute("position").count
    interiorRemoved += count(0) - count(1); grainRemoved += count(1) - count(2)
    for (const geometry of new Set(levels)) geometry.dispose()
  }
  expect(interiorRemoved).toBeGreaterThan(0)
  expect(grainRemoved).toBeGreaterThan(0)
})
