import * as THREE from "three"

/** Cache a slightly larger view until the camera leaves it. Small pans reuse
 * visibility lists; every corner of the actual frustum must remain covered. */
export class GuardedFrustum {
  readonly frustum = new THREE.Frustum()
  version = 0
  private matrix = new THREE.Matrix4()
  private previous = new THREE.Matrix4()
  private inverse = new THREE.Matrix4()
  private corner = new THREE.Vector3()

  constructor(private margin = 2) {}

  update(camera: THREE.Camera): void {
    this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    if (this.version && this.matrix.equals(this.previous)) return
    this.previous.copy(this.matrix)
    this.inverse.copy(this.matrix).invert()
    let covered = this.version > 0
    for (let x = -1; covered && x <= 1; x += 2) for (let y = -1; covered && y <= 1; y += 2) for (let z = -1; covered && z <= 1; z += 2) {
      this.corner.set(x, y, z).applyMatrix4(this.inverse)
      // Reserve one world unit for the snapped pixel camera and outline samples.
      covered = this.frustum.planes.every(plane => plane.distanceToPoint(this.corner) >= 1)
    }
    if (covered) return
    this.frustum.setFromProjectionMatrix(this.matrix)
    for (const plane of this.frustum.planes) plane.constant += this.margin
    this.version++
  }
}
