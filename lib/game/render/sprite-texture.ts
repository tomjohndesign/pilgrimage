import * as THREE from "three"

/** Independent atlas UVs over an unchanged shared image. Texture.copy marks
 * its shared Source dirty; restoring that image revision prevents each newly
 * mounted figure from uploading everybody's atlas again. The clone's own
 * texture version still initializes its sampler, and real image updates keep
 * the revision they had on entry. This is only for static sprite atlases. */
export function spriteTextureView(source: THREE.Texture): THREE.Texture {
  if (source.colorSpace !== THREE.SRGBColorSpace || source.minFilter !== THREE.NearestFilter ||
    source.magFilter !== THREE.NearestFilter || source.generateMipmaps) {
    source.colorSpace = THREE.SRGBColorSpace
    source.minFilter = source.magFilter = THREE.NearestFilter
    source.generateMipmaps = false
    source.needsUpdate = true
  }
  const version = source.source.version
  const texture = source.clone()
  source.source.version = version
  return texture
}
