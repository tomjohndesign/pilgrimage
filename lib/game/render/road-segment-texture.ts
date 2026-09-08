import * as THREE from "three"

/** Stable GPU storage for a terrain block's changing road records. Texture
 * allocation grows geometrically; ordinary wear updates reuse the same image. */
export class RoadSegmentTexture {
  texture = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)

  update(data: Float32Array): THREE.DataTexture {
    let image = this.texture.image
    if (image.data!.length < data.length) {
      const texels = 2 ** Math.ceil(Math.log2(Math.max(1, data.length / 4)))
      const width = Math.min(1024, texels), height = texels / width
      this.texture.dispose()
      this.texture = new THREE.DataTexture(new Float32Array(texels * 4), width, height, THREE.RGBAFormat, THREE.FloatType)
      image = this.texture.image
    }
    image.data!.set(data)
    this.texture.needsUpdate = true
    return this.texture
  }

  dispose() { this.texture.dispose() }
}
