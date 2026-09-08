import * as THREE from "three"
import { simplifiedSceneryGeometry } from "./scenery-detail"

interface SourceRange { offset: number; count: number; matrixVersion: number; colorVersion: number; sphere: THREE.Sphere }

/** Keep visible transforms in ordinary GPU instance buffers. Repack only when
 * the guarded camera view or scenery changes; every vertex then uses Three's
 * native instancing path without repeated transform-texture lookups. */
export class StaticInstanceBatch {
  readonly root = new THREE.Group()
  mesh?: THREE.InstancedMesh
  private ranges = new Map<THREE.InstancedMesh, SourceRange>()
  private sources: THREE.InstancedMesh[] = []
  private visible: THREE.InstancedMesh[] = []
  private transforms = new Float32Array()
  private colors = new Float32Array()
  private bounds = new Float32Array()
  private matrix = new THREE.Matrix4()
  private sphere = new THREE.Sphere()
  private viewVersion = -1
  private minRadius = 0
  private material?: THREE.Material
  private fullGeometry?: THREE.BufferGeometry
  private lowGeometry?: THREE.BufferGeometry

  prepare(sources: THREE.InstancedMesh[]): void {
    if (sources.length === this.sources.length && sources.every((source, i) => source === this.sources[i] && source.count === this.ranges.get(source)?.count)) return
    this.dispose(); this.sources = [...sources]; this.ranges.clear(); this.visible = []; this.viewVersion = -1
    const count = sources.reduce((sum, source) => sum + source.count, 0)
    if (!count) return
    this.transforms = new Float32Array(count * 16)
    this.colors = new Float32Array(count * 3)
    this.bounds = new Float32Array(count * 4)
    let offset = 0
    for (const source of sources) {
      this.ranges.set(source, { offset, count: source.count, matrixVersion: -1, colorVersion: -2, sphere: new THREE.Sphere() })
      this.updateSource(source); offset += source.count
    }
    const first = sources[0], original = first.material as THREE.Material
    const material = original.clone()
    const compile = original.onBeforeCompile, key = original.customProgramCacheKey.call(original)
    material.onBeforeCompile = function (shader, renderer) { compile.call(this, shader, renderer) }
    material.customProgramCacheKey = () => key
    this.material = material
    const geometry = first.geometry.clone()
    this.fullGeometry = geometry
    this.lowGeometry = simplifiedSceneryGeometry(first.geometry)
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    if (first.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3).setUsage(THREE.DynamicDrawUsage)
    mesh.frustumCulled = false; mesh.raycast = () => {}
    mesh.layers.mask = first.layers.mask; mesh.renderOrder = first.renderOrder
    this.mesh = mesh; this.root.add(mesh)
  }

  setSimplified(simplified: boolean) {
    if (this.mesh) this.mesh.geometry = (simplified && this.lowGeometry) || this.fullGeometry!
  }

  private updateSource(source: THREE.InstancedMesh): boolean {
    const range = this.ranges.get(source)!
    if (range.matrixVersion === source.instanceMatrix.version && range.colorVersion === (source.instanceColor?.version ?? -1)) return false
    if (!source.geometry.boundingSphere) source.geometry.computeBoundingSphere()
    source.computeBoundingSphere()
    range.sphere.copy(source.boundingSphere!).applyMatrix4(source.matrixWorld)
    for (let i = 0; i < source.count; i++) {
      const index = range.offset + i
      source.getMatrixAt(i, this.matrix); this.matrix.premultiply(source.matrixWorld)
      this.matrix.toArray(this.transforms, index * 16)
      for (let channel = 0; channel < 3; channel++) this.colors[index * 3 + channel] = source.instanceColor?.array[i * 3 + channel] ?? 1
      this.sphere.copy(source.geometry.boundingSphere!).applyMatrix4(this.matrix)
      this.sphere.center.toArray(this.bounds, index * 4); this.bounds[index * 4 + 3] = this.sphere.radius
    }
    range.matrixVersion = source.instanceMatrix.version; range.colorVersion = source.instanceColor?.version ?? -1
    return true
  }

  write(sources: THREE.InstancedMesh[], frustum?: THREE.Frustum, viewVersion = 0, minRadius = 0): void {
    this.root.visible = sources.length > 0
    if (!sources.length) { this.visible = []; return }
    if (!this.mesh || sources.some(source => !this.ranges.has(source))) this.prepare(sources)
    let changed = false
    for (const source of sources) changed = this.updateSource(source) || changed
    if (!changed && minRadius === this.minRadius && viewVersion === this.viewVersion && sources.length === this.visible.length && sources.every((source, i) => source === this.visible[i])) return
    const matrix = this.mesh!.instanceMatrix, color = this.mesh!.instanceColor
    const copy = (index: number, count: number, into: number) => {
      matrix.array.set(this.transforms.subarray(index * 16, (index + count) * 16), into * 16)
      color?.array.set(this.colors.subarray(index * 3, (index + count) * 3), into * 3)
    }
    let count = 0
    for (const source of sources) {
      const range = this.ranges.get(source)!
      // The block bound contains every primitive. Interior blocks can copy
      // their contiguous matrix/color span without repeating six plane tests per leaf.
      if (!minRadius && (!frustum || frustum.planes.every(plane => plane.distanceToPoint(range.sphere.center) >= range.sphere.radius))) {
        copy(range.offset, range.count, count)
        count += range.count
        continue
      }
      for (let i = 0; i < range.count; i++) {
        const index = range.offset + i
        if (this.bounds[index * 4 + 3] < minRadius) continue
        if (frustum) {
          this.sphere.center.fromArray(this.bounds, index * 4); this.sphere.radius = this.bounds[index * 4 + 3]
          if (!frustum.intersectsSphere(this.sphere)) continue
        }
        // Boundary primitives are sparse. Copy directly to avoid creating a
        // typed-array view for every leaf during camera movement.
        for (let channel = 0; channel < 16; channel++) matrix.array[count * 16 + channel] = this.transforms[index * 16 + channel]
        if (color) for (let channel = 0; channel < 3; channel++) color.array[count * 3 + channel] = this.colors[index * 3 + channel]
        count++
      }
    }
    this.mesh!.count = count
    matrix.clearUpdateRanges(); matrix.addUpdateRange(0, count * 16); matrix.needsUpdate = true
    if (color) { color.clearUpdateRanges(); color.addUpdateRange(0, count * 3); color.needsUpdate = true }
    this.visible = [...sources]; this.viewVersion = viewVersion; this.minRadius = minRadius
  }

  dispose() {
    this.fullGeometry?.dispose(); this.lowGeometry?.dispose(); this.mesh?.dispose(); this.material?.dispose()
    this.fullGeometry = undefined; this.lowGeometry = undefined
    this.mesh = undefined; this.root.clear()
  }
}

/** Only untextured, flat-shaded scenery opts into this shared material contract. */
export function staticInstanceKey(mesh: THREE.InstancedMesh): string {
  const material = mesh.material as THREE.MeshLambertMaterial
  return `${mesh.geometry.uuid}:${mesh.layers.mask}:${material.type}:${material.color.getHex()}:${material.flatShading}:${!!mesh.instanceColor}`
}
