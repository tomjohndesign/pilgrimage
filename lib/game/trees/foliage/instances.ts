import * as THREE from "three"
import { blockKey } from "../../render/blocks"
import { GuardedFrustum } from "../../render/guarded-frustum"

export interface FoliageInstance {
  x: number; y: number; z: number; column: number; row: number
  id: readonly number[]; brightness: number; tree: number
}

/** Pack only trees in the guarded view into the existing two atlas draws.
 * Resident source data and stable tree IDs survive camera movement and felling. */
export class FoliageInstances {
  readonly visible: number[] = []
  private blocks: { indices: number[]; sphere: THREE.Sphere }[]
  private view = new GuardedFrustum(3)
  private version = -1
  private world = new THREE.Matrix4()
  private sphere = new THREE.Sphere()

  constructor(readonly sources: readonly FoliageInstance[], private radii: Float32Array) {
    const blocks = new Map<number, { indices: number[]; box: THREE.Box3; radius: number }>()
    const point = new THREE.Vector3()
    sources.forEach((source, index) => {
      const key = blockKey(source.x, source.z)
      let block = blocks.get(key)
      if (!block) { block = { indices: [], box: new THREE.Box3(), radius: 0 }; blocks.set(key, block) }
      block.indices.push(index); block.box.expandByPoint(point.set(source.x, source.y, source.z))
      block.radius = Math.max(block.radius, radii[source.row])
    })
    this.blocks = [...blocks.values()].map(block => ({ indices: block.indices,
      sphere: block.box.expandByScalar(block.radius).getBoundingSphere(new THREE.Sphere()) }))
  }

  /** Building IDs precede tree IDs. A new building changes only those colors,
   * leaving tree geometry, spatial blocks and picking indices intact. */
  setIds(idForTree: (tree: number) => readonly number[]): void {
    for (const source of this.sources) source.id = idForTree(source.tree)
    this.version = -1
  }

  /** Suspense can reconnect layout effects without replacing the source data.
   * Repack attributes after its mesh buffers have been reset, even at rest. */
  invalidate() { this.version = -1 }

  update(mesh: THREE.InstancedMesh, camera: THREE.Camera): boolean {
    this.view.update(camera)
    if (this.version === this.view.version && this.world.equals(mesh.matrixWorld)) return false
    this.version = this.view.version; this.world.copy(mesh.matrixWorld)
    const frustum = this.view.frustum, scale = mesh.matrixWorld.getMaxScaleOnAxis()
    this.visible.length = 0
    for (const block of this.blocks) {
      this.sphere.copy(block.sphere).applyMatrix4(mesh.matrixWorld)
      if (!frustum.intersectsSphere(this.sphere)) continue
      for (const index of block.indices) {
        const source = this.sources[index]
        this.sphere.center.set(source.x, source.y, source.z).applyMatrix4(mesh.matrixWorld)
        this.sphere.radius = this.radii[source.row] * scale
        if (frustum.intersectsSphere(this.sphere)) this.visible.push(index)
      }
    }
    // Preserve the original tie order for overlapping equal-depth texels.
    this.visible.sort((a, b) => a - b)
    const frames = mesh.geometry.getAttribute("foliageFrame") as THREE.InstancedBufferAttribute
    const ids = mesh.geometry.getAttribute("foliageId") as THREE.InstancedBufferAttribute
    for (let i = 0; i < this.visible.length; i++) {
      const source = this.sources[this.visible[i]], offset = i * 16
      // Instance slots start as identity matrices; foliage only translates.
      mesh.instanceMatrix.array[offset + 12] = source.x
      mesh.instanceMatrix.array[offset + 13] = source.y
      mesh.instanceMatrix.array[offset + 14] = source.z
      frames.setXY(i, source.column, source.row)
      ids.setXYZ(i, source.id[0], source.id[1], source.id[2])
      mesh.instanceColor!.setXYZ(i, source.brightness, source.brightness, source.brightness)
    }
    mesh.count = this.visible.length
    for (const attribute of [mesh.instanceMatrix, mesh.instanceColor!, frames, ids]) {
      attribute.clearUpdateRanges(); attribute.addUpdateRange(0, mesh.count * attribute.itemSize); attribute.needsUpdate = true
    }
    return true
  }
}
