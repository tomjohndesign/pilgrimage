import * as THREE from "three"

const blocks = new WeakMap<THREE.Scene, Map<THREE.Group, THREE.Sphere>>()
const instances = new WeakMap<THREE.Scene, Map<THREE.Group, THREE.InstancedMesh[]>>()
const instanceRevisions = new WeakMap<THREE.Scene, number>()
const frozen = new WeakSet<THREE.Object3D>()
const matrix = new THREE.Matrix4(), frustum = new THREE.Frustum()

/** Reject an entire static subtree once, before the color and outline passes. */
export function registerStaticBlock(scene: THREE.Scene, group: THREE.Group, batchInstances = false) {
  group.updateWorldMatrix(true, true)
  const sphere = new THREE.Sphere().makeEmpty(), childSphere = new THREE.Sphere()
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return
    const mesh = object as THREE.InstancedMesh
    if (mesh.isInstancedMesh) {
      if (!mesh.boundingSphere) mesh.computeBoundingSphere()
      childSphere.copy(mesh.boundingSphere!)
    } else {
      if (!mesh.geometry.boundingSphere) mesh.geometry.computeBoundingSphere()
      childSphere.copy(mesh.geometry.boundingSphere!)
    }
    sphere.union(childSphere.applyMatrix4(mesh.matrixWorld))
  })
  const entries = blocks.get(scene) ?? new Map<THREE.Group, THREE.Sphere>()
  entries.set(group, sphere); blocks.set(scene, entries)
  const sourceVisibility = new Map<THREE.InstancedMesh, boolean>()
  if (batchInstances) {
    const meshes: THREE.InstancedMesh[] = []
    group.traverse(object => { if (object instanceof THREE.InstancedMesh) { meshes.push(object); sourceVisibility.set(object, object.visible) } })
    const sources = instances.get(scene) ?? new Map<THREE.Group, THREE.InstancedMesh[]>()
    sources.set(group, meshes); instances.set(scene, sources)
    instanceRevisions.set(scene, (instanceRevisions.get(scene) ?? 0) + 1)
  }
  frozen.add(group)
  group.matrixWorldAutoUpdate = false
  return () => {
    entries.delete(group)
    const sources = instances.get(scene)
    for (const [mesh, visible] of sourceVisibility) mesh.visible = visible
    sources?.delete(group)
    if (batchInstances) instanceRevisions.set(scene, (instanceRevisions.get(scene) ?? 0) + 1)
    frozen.delete(group)
    group.visible = true; group.matrixWorldAutoUpdate = true
  }
}

/** Sources stay in the graph for interaction; the scenery renderer draws their
 * visible instances with the same geometry, colors, and ID materials. */
export function staticInstanceSources(scene: THREE.Scene) { return instances.get(scene)?.values() ?? [] }
export function staticInstanceRevision(scene: THREE.Scene) { return instanceRevisions.get(scene) ?? 0 }

/** Three traverses hidden descendants even when matrixWorldAutoUpdate is off.
 * Resolve visible dynamic transforms once; static blocks were resolved at commit. */
export function updateVisibleWorldMatrices(object: THREE.Object3D) {
  if (!object.visible || frozen.has(object)) return
  object.updateWorldMatrix(false, false, true)
  for (const child of object.children) updateVisibleWorldMatrices(child)
}

export function cullStaticBlocks(scene: THREE.Scene, camera: THREE.Camera) {
  const entries = blocks.get(scene)
  if (!entries) return
  frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse))
  // The pixel camera snaps slightly away from the main camera; retain a margin
  // for that shift and outline samples at the viewport boundary.
  for (const plane of frustum.planes) plane.constant += 1
  for (const [group, sphere] of entries) group.visible = !sphere.isEmpty() && frustum.intersectsSphere(sphere)
}
