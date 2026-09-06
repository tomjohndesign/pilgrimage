import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { test } from "node:test"
import { chromium } from "playwright"
import ts from "typescript"

// Real GPU depth testing: unit tests cannot catch interpolation/quantization seams.
test("sprites preserve overlaps, terrain contact, scenery occlusion, and aligned outlines", async () => {
  const shader = ts.transpileModule(await readFile(new URL("../lib/game/render/sprite-depth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText
  const outlineSource = await readFile(new URL("../components/game/outline-pass.tsx", import.meta.url), "utf8")
  const outlineFragment = outlineSource.match(/const FRAGMENT_SHADER = \/\* glsl \*\/ `([\s\S]*?)`/)[1]
  const server = createServer(async (request, response) => {
    const name = request.url.slice(1)
    if (name === "shader.js") {
      response.setHeader("Content-Type", "text/javascript")
      response.end(shader)
    } else if (["three.module.js", "three.core.js"].includes(name)) {
      response.setHeader("Content-Type", "text/javascript")
      response.end(await readFile(new URL(`../node_modules/three/build/${name}`, import.meta.url)))
    } else response.end("<!doctype html><canvas></canvas>")
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()
    const errors = []
    page.on("pageerror", error => errors.push(error.message))
    page.on("console", message => { if (message.type() === "error") errors.push(message.text()) })
    await page.goto(`http://127.0.0.1:${server.address().port}`)
    const result = await page.evaluate(async (outlineFragment) => {
      const THREE = await import("/three.module.js")
      const { applySpriteDepth } = await import("/shader.js")
      const gl = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: false })
      gl.setSize(384, 384)
      const viewport = new THREE.Vector4()
      const worldTexel = { value: 0 }
      const groundPlane = { value: new THREE.Vector4() }
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 400)
      const makeSprite = (color, order) => {
        const material = new THREE.SpriteMaterial({ color, transparent: false, toneMapped: false })
        material.onBeforeCompile = shader => applySpriteDepth(shader, viewport, worldTexel, groundPlane)
        material.onBeforeRender = renderer => renderer.getCurrentViewport(viewport)
        const sprite = new THREE.Sprite(material)
        sprite.center.set(0.5, 0.2421875)
        sprite.renderOrder = order
        scene.add(sprite)
        return sprite
      }
      const back = makeSprite(0xff0000, 1)
      const front = makeSprite(0x00ff00, 2)
      let cases = 0, compared = 0, mismatches = 0, occlusionFailures = 0
      for (const size of [192, 384, 768]) {
        worldTexel.value = size === 192 ? 0 : 1 / 25
        const target = new THREE.WebGLRenderTarget(size, size, { depthTexture: new THREE.DepthTexture(size, size) })
        gl.setRenderTarget(target)
        for (const yaw of [0, Math.PI / 4, 1.23, Math.PI, 5.4]) {
          camera.position.set(Math.sin(yaw) * 98, 69.3, Math.cos(yaw) * 98)
          camera.lookAt(0, 0, 0)
          camera.updateMatrixWorld()
          for (const scale of [0.71, 1, 1.29]) {
            front.scale.setScalar(scale)
            back.scale.setScalar(1.35)
            for (const shift of [0, 0.031]) {
              front.position.set(shift, 0.017, shift)
              back.position.copy(front.position)
              const expected = new Uint8Array(size * size * 4), actual = expected.slice()
              back.visible = false
              gl.render(scene, camera)
              gl.readRenderTargetPixels(target, 0, 0, size, size, expected)
              back.visible = true
              gl.render(scene, camera)
              gl.readRenderTargetPixels(target, 0, 0, size, size, actual)
              for (let i = 0; i < expected.length; i += 4) {
                if (expected[i + 1] < 200) continue
                compared++
                if (actual[i + 1] < 200) mismatches++
              }
              cases++
            }
          }
        }
        // Scenery in front must still hide characters; scenery behind must not.
        const scenery = new THREE.Mesh(new THREE.PlaneGeometry(10, 10),
          new THREE.MeshBasicMaterial({ color: 0x0000ff, toneMapped: false }))
        scenery.quaternion.copy(camera.quaternion)
        scene.add(scenery)
        back.visible = false
        const towardCamera = camera.position.clone().normalize()
        for (const distance of [-4, 4]) {
          scenery.position.copy(towardCamera).multiplyScalar(distance)
          gl.render(scene, camera)
          const pixels = new Uint8Array(size * size * 4)
          gl.readRenderTargetPixels(target, 0, 0, size, size, pixels)
          let green = 0
          for (let i = 1; i < pixels.length; i += 4) if (pixels[i] > 200) green++
          if (distance < 0 ? green === 0 : green !== 0) occlusionFailures++
        }
        scene.remove(scenery)
        scenery.geometry.dispose()
        scenery.material.dispose()
        target.depthTexture.dispose()
        target.dispose()
      }
      // Match PixelCanvas: enlarge nearest world depth, then draw full-resolution
      // feet against it. A native-resolution floor alone misses this regression.
      const floorScene = new THREE.Scene()
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(20, 20),
        new THREE.MeshBasicMaterial({ color: 0x333333, toneMapped: false }))
      floor.rotation.x = -Math.PI / 2
      floorScene.add(floor)
      const output = new THREE.WebGLRenderTarget(480, 480)
      const copyMaterial = new THREE.ShaderMaterial({
        uniforms: { tDepth: { value: null } },
        vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: "varying vec2 vUv; uniform sampler2D tDepth; void main() { gl_FragColor = vec4(0.2, 0.2, 0.2, 1.0); gl_FragDepth = texture2D(tDepth, vUv).x; }",
      })
      const copyScene = new THREE.Scene()
      const copyMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), copyMaterial)
      copyScene.add(copyMesh)
      const copyCamera = new THREE.Camera()
      let floorCompared = 0, floorClipped = 0
      back.visible = false
      for (const [dx, dz] of [[0, 0], [0.3, 0], [-0.3, 0], [0.2, 0.25], [-0.2, -0.25]]) {
        groundPlane.value.set(-dx, 1, -dz, 0)
        floor.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-dx, 1, -dz).normalize())
      for (const resolution of [30, 60, 120]) {
        const ground = new THREE.WebGLRenderTarget(resolution, resolution, {
          depthTexture: new THREE.DepthTexture(resolution, resolution),
        })
        copyMaterial.uniforms.tDepth.value = ground.depthTexture
        for (const zoom of [1, 1.3, 2]) {
          camera.zoom = zoom
          camera.updateProjectionMatrix()
          worldTexel.value = 2.4 / zoom / resolution
          for (const shift of [0, 0.003, 0.013, 0.025]) {
            front.position.set(shift, (dx + dz) * shift, shift)
            const expected = new Uint8Array(480 * 480 * 4), actual = expected.slice()
            gl.autoClear = true
            gl.setRenderTarget(output)
            gl.render(scene, camera)
            gl.readRenderTargetPixels(output, 0, 0, 480, 480, expected)
            gl.setRenderTarget(ground)
            gl.render(floorScene, camera)
            gl.setRenderTarget(output)
            gl.render(copyScene, copyCamera)
            gl.autoClear = false
            gl.render(scene, camera)
            gl.readRenderTargetPixels(output, 0, 0, 480, 480, actual)
            for (let i = 1; i < expected.length; i += 4) {
              if (expected[i] < 200) continue
              floorCompared++
              if (actual[i] < 200) floorClipped++
            }
          }
        }
        ground.depthTexture.dispose()
        ground.dispose()
      }
      }
      output.dispose()
      floor.geometry.dispose()
      floor.material.dispose()
      // Exercise the actual outline compositor with display-resolution IDs.
      // A figure crosses a wall (or tree) in front of it; its right half is
      // hidden. The edge must touch the visible figure and stay off the wall.
      const size = 96, characterId = 0xffffff
      const idPixels = new Uint8Array(size * size * 4)
      const depthPixels = new Float32Array(size * size * 4)
      const characterPixels = new Uint8Array(size * size * 4)
      const characterDepthPixels = new Float32Array(size * size * 4)
      const makeTexture = (pixels, type) => {
        const texture = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat, type)
        texture.needsUpdate = true
        return texture
      }
      const ids = makeTexture(idPixels, THREE.UnsignedByteType)
      const depths = makeTexture(depthPixels, THREE.FloatType)
      const character = makeTexture(characterPixels, THREE.UnsignedByteType)
      const characterDepth = makeTexture(characterDepthPixels, THREE.FloatType)
      const outlineTarget = new THREE.WebGLRenderTarget(size, size)
      const outlineMaterial = new THREE.ShaderMaterial({
        vertexShader: copyMaterial.vertexShader, fragmentShader: outlineFragment,
        depthTest: false, depthWrite: false,
        uniforms: {
          tId: { value: ids }, tDepth: { value: depths },
          tCharacter: { value: character }, tCharacterDepth: { value: characterDepth },
          uCharacterPass: { value: true }, uCharacterSelected: { value: false },
          uCharacterIdMin: { value: 0xffe000 }, uTexel: { value: new THREE.Vector2() },
          uMode: { value: 1 }, uColor: { value: new THREE.Color(1, 0, 0) },
          uSelectedId: { value: 0 }, uSelectionFill: { value: new THREE.Color(0, 1, 0) },
          uSelectionOpacity: { value: 0.06 }, uSelectionColor: { value: new THREE.Color(0, 0, 1) },
          uSelectionOutlineOpacity: { value: 0.65 },
        },
      })
      copyMesh.material = outlineMaterial
      gl.autoClear = true
      gl.setClearColor(0, 0)
      let outlineCompared = 0, outlineMismatches = 0, selectionMismatches = 0
      // Fractional texel widths represent zoom and DPR; shifts cover the phase
      // difference between scenery pixels and moving display-resolution sprites.
      for (const width of [1, 2.25, 4, 5.75]) for (const shift of [0, 1, 3]) {
        const left = 25 + shift, bottom = 23 + shift, top = 70 + shift, wall = 49
        const figureAt = (x, y) => x >= left && x < 65 + shift && y >= bottom && y < top
        const idAt = (x, y) => x >= wall ? 2 : figureAt(x, y) ? characterId : 1
        const depthAt = (x, y) => x >= wall ? 0.2 : figureAt(x, y) ? 0.4 : 0.8
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
          const i = (y * size + x) * 4, id = idAt(x, y)
          idPixels.set([id & 255, (id >> 8) & 255, (id >> 16) & 255, 255], i)
          depthPixels[i] = depthAt(x, y)
          characterPixels.set([255, 255, 255, figureAt(x, y) ? 255 : 0], i)
          characterDepthPixels[i] = 0.4
        }
        for (const texture of [ids, depths, character, characterDepth]) texture.needsUpdate = true
        outlineMaterial.uniforms.uTexel.value.set(width / size, width / size)
        const pixels = new Uint8Array(size * size * 4)
        for (const selected of [false, true]) {
          outlineMaterial.uniforms.uCharacterSelected.value = selected
          outlineMaterial.uniforms.uSelectedId.value = selected ? characterId : 0
          gl.setRenderTarget(outlineTarget)
          gl.render(copyScene, copyCamera)
          gl.readRenderTargetPixels(outlineTarget, 0, 0, size, size, pixels)
          for (let y = 8; y < size - 8; y++) for (let x = 8; x < size - 8; x++) {
            const neighbors = [[x + width, y], [x - width, y], [x, y + width], [x, y - width]]
              .map(([nx, ny]) => [Math.floor(nx + 0.5), Math.floor(ny + 0.5)])
            const edge = neighbors.some(([nx, ny]) => idAt(nx, ny) !== idAt(x, y)
              && (idAt(x, y) === characterId || idAt(nx, ny) === characterId)
              && depthAt(nx, ny) < depthAt(x, y))
            const selection = selected && (figureAt(x, y) || neighbors.some(([nx, ny]) => figureAt(nx, ny)))
            const drawn = pixels[(y * size + x) * 4 + 3] > 0
            if (drawn !== (edge || selection)) {
              if (selected) selectionMismatches++
              else outlineMismatches++
            }
            outlineCompared++
          }
        }
      }
      for (const texture of [ids, depths, character, characterDepth]) texture.dispose()
      outlineTarget.dispose()
      outlineMaterial.dispose()
      copyMesh.geometry.dispose()
      copyMaterial.dispose()
      gl.dispose()
      return { cases, compared, mismatches, occlusionFailures, floorCompared, floorClipped,
        outlineCompared, outlineMismatches, selectionMismatches }
    }, outlineFragment)
    assert.deepEqual(errors, [], "WebGL shaders should compile without errors")
    assert.ok(result.compared > 10000, "must compare visible overlapping pixels")
    assert.equal(result.mismatches, 0, JSON.stringify(result))
    assert.equal(result.occlusionFailures, 0, "scenery must retain depth occlusion")
    assert.ok(result.floorCompared > 10000, "must compare feet against enlarged terrain depth")
    assert.equal(result.floorClipped, 0, "the enlarged floor must not erase sprite pixels")
    assert.ok(result.outlineCompared > 10000, "must compare outlines at multiple zooms and sprite offsets")
    assert.equal(result.outlineMismatches, 0, "overlap outlines must touch the visible sprite and respect foreground occlusion")
    assert.equal(result.selectionMismatches, 0, "selected silhouettes and borders must track the actual character pixels")
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
})
