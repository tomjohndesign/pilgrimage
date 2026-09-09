import { expect, it } from "vitest"
import * as THREE from "three"
import { wildlifeGeometry } from "./batch"
import { encodeObjectId, wildlifeObjectId } from "../render/outline"

it("draws and picks only admitted wildlife while preserving source IDs after reordering", () => {
  const source = new THREE.BoxGeometry()
  source.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(source.attributes.position.count * 3).fill(1), 3))
  const part = new THREE.Mesh(source, new THREE.MeshBasicMaterial()), batch = wildlifeGeometry([part], [7, 13, 29])
  for (let i = 0; i < 3; i++) batch.write(i, new THREE.Matrix4().makeTranslation(i * 5, 0, 0))
  batch.finish()
  const mesh = new THREE.Mesh(batch.geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }))
  const ray = new THREE.Raycaster()
  const hit = (x: number) => { ray.set(new THREE.Vector3(x, 0, 3), new THREE.Vector3(0, 0, -1)); return ray.intersectObject(mesh)[0] }
  const position = batch.geometry.attributes.position, indices = batch.geometry.index!
  batch.setVisible([2, 0])
  expect(batch.geometry.drawRange.count).toBe(source.index!.count * 2)
  expect(batch.idGeometry.drawRange).toEqual(batch.geometry.drawRange)
  expect(hit(5)).toBeUndefined()
  expect(batch.animalAtFace(hit(10).faceIndex!)).toBe(2)
  expect(batch.animalAtFace(hit(0).faceIndex!)).toBe(0)
  const vertex = indices.getX(0), colors = batch.idGeometry.attributes.color
  const expected = encodeObjectId(wildlifeObjectId(29))
  ;[colors.getX(vertex), colors.getY(vertex), colors.getZ(vertex)].forEach((value, i) => expect(value).toBeCloseTo(expected[i], 6))
  batch.setVisible([])
  expect(hit(0)).toBeUndefined(); expect(hit(10)).toBeUndefined()
  batch.setVisible([1])
  expect(batch.animalAtFace(hit(5).faceIndex!)).toBe(1)
  expect(hit(0)).toBeUndefined()
  expect(batch.geometry.attributes.position).toBe(position)
  expect(batch.geometry.index).toBe(indices)
  expect(batch.idGeometry.index).toBe(indices)
  batch.dispose(); source.dispose(); part.material.dispose(); mesh.material.dispose()
})
