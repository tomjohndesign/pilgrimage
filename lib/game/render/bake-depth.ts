import * as THREE from "three"

/** RG16 stores distance toward the bake camera, relative to the rig origin,
 * spanning minus/plus one full cell's world extent. B marks valid geometry.
 * Opaque alpha preserves the exact data bytes through canvas/PNG round trips. */
export const SPRITE_DEPTH_ENCODING = "view-offset-rg16-v1" as const

/** Ink grows from the first solid neighbour in inkPersonFrame. Carry that same
 * neighbour's depth into the added pixel instead of borrowing background depth. */
export function registerDepthPixels(depth: Uint8Array, source: Uint8ClampedArray, inked: Uint8ClampedArray, size: number) {
  const output = new Uint8ClampedArray(depth.length)
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y * size + x) * 4
    output.set([128, 0, 0, 255], i)
    if (inked[i + 3] < 128) continue
    let sample = i
    if (source[i + 3] < 128) {
      const neighbour = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].find(([nx, ny]) =>
        nx >= 0 && ny >= 0 && nx < size && ny < size && source[(ny * size + nx) * 4 + 3] >= 128)
      if (!neighbour) throw new Error("Sprite ink has no source depth")
      sample = (neighbour[1] * size + neighbour[0]) * 4
    }
    // WebGL readback is bottom-up; the color/ink buffers are top-down.
    const raw = ((size - 1 - Math.floor(sample / 4 / size)) * size + sample / 4 % size) * 4
    if (depth[raw + 3] < 128) throw new Error("Visible sprite pixel has no baked geometry depth")
    const value = depth[raw] * 256 + depth[raw + 1]
    if (value === 0 || value === 65535) throw new Error("Sprite geometry exceeds its encoded depth range")
    output.set([depth[raw], depth[raw + 1], 255, 255], i)
  }
  return output
}

/** Small bake-only target. Original clipping planes, alpha masks and vertex
 * deformation remain active, including robes, equipment and custom pose edits. */
export function spriteDepthBaker(renderer: THREE.WebGLRenderer) {
  const target = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter })
  const materials = new Map<THREE.Material, THREE.MeshDepthMaterial>()
  const range = { value: new THREE.Vector4() }
  const origin = new THREE.Vector3(), clear = new THREE.Color()
  const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d")!
  let pixels = new Uint8Array(4)
  return {
    render(scene: THREE.Scene, camera: THREE.OrthographicCamera, size: number, extent: number,
      source: Uint8ClampedArray, inked: Uint8ClampedArray) {
      if (canvas.width !== size || canvas.height !== size) {
        canvas.width = canvas.height = size; target.setSize(size, size); pixels = new Uint8Array(size * size * 4)
      }
      camera.updateMatrixWorld(true)
      origin.set(0, 0, 0).applyMatrix4(camera.matrixWorldInverse)
      range.value.set(camera.near, camera.far, origin.z, extent)
      const previous = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>()
      const materialFor = (source: THREE.Material) => {
        let depth = materials.get(source)
        if (!depth) {
          const mesh = source as THREE.MeshBasicMaterial
          depth = new THREE.MeshDepthMaterial({ side: source.side, map: mesh.map, alphaMap: mesh.alphaMap,
            alphaTest: source.alphaTest, clippingPlanes: source.clippingPlanes, clipIntersection: source.clipIntersection })
          depth.onBeforeCompile = shader => {
            shader.uniforms.spriteBakeRange = range
            shader.fragmentShader = "uniform vec4 spriteBakeRange;\n" + shader.fragmentShader.replace(/}\s*$/, `
              float distance = mix(spriteBakeRange.x, spriteBakeRange.y, fragCoordZ);
              float value = clamp((-distance - spriteBakeRange.z) / (2.0 * spriteBakeRange.w) + 0.5, 0.0, 1.0);
              float packed = floor(value * 65535.0 + 0.5);
              gl_FragColor = vec4(floor(packed / 256.0) / 255.0, mod(packed, 256.0) / 255.0, 1.0, 1.0);
            }`)
          }
          depth.customProgramCacheKey = () => SPRITE_DEPTH_ENCODING
          materials.set(source, depth)
        }
        depth.clippingPlanes = source.clippingPlanes
        return depth
      }
      const previousTarget = renderer.getRenderTarget(), alpha = renderer.getClearAlpha()
      renderer.getClearColor(clear)
      try {
        scene.traverse(object => {
          if (!(object instanceof THREE.Mesh)) return
          previous.set(object, object.material)
          object.material = Array.isArray(object.material) ? object.material.map(materialFor) : materialFor(object.material)
        })
        renderer.setRenderTarget(target); renderer.setClearColor(0, 0)
        renderer.render(scene, camera)
        renderer.readRenderTargetPixels(target, 0, 0, size, size, pixels)
        const image = ctx.createImageData(size, size)
        image.data.set(registerDepthPixels(pixels, source, inked, size))
        ctx.putImageData(image, 0, 0)
        return canvas
      } finally {
        for (const [mesh, material] of previous) mesh.material = material
        renderer.setRenderTarget(previousTarget); renderer.setClearColor(clear, alpha)
      }
    },
    dispose() { target.dispose(); for (const material of materials.values()) material.dispose() },
  }
}
