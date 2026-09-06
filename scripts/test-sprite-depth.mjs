import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { test } from "node:test"
import { chromium } from "playwright"
import ts from "typescript"

// Real GPU depth testing: unit tests cannot catch interpolation/quantization seams.
test("sprites preserve overlaps, terrain contact, and scenery occlusion", async () => {
  const shader = ts.transpileModule(await readFile(new URL("../lib/game/render/sprite-depth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText
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
    const result = await page.evaluate(async () => {
      const THREE = await import("/three.module.js")
      const { applySpriteDepth } = await import("/shader.js")
      const gl = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: false })
      gl.setSize(384, 384)
      const viewport = new THREE.Vector4()
      const worldTexel = { value: 0 }
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 400)
      const makeSprite = (color, order) => {
        const material = new THREE.SpriteMaterial({ color, transparent: false, toneMapped: false })
        material.onBeforeCompile = shader => applySpriteDepth(shader, viewport, worldTexel)
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
            front.position.set(shift, 0, shift)
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
      output.dispose()
      floor.geometry.dispose()
      floor.material.dispose()
      copyMesh.geometry.dispose()
      copyMaterial.dispose()
      gl.dispose()
      return { cases, compared, mismatches, occlusionFailures, floorCompared, floorClipped }
    })
    assert.deepEqual(errors, [], "WebGL shaders should compile without errors")
    assert.ok(result.compared > 10000, "must compare visible overlapping pixels")
    assert.equal(result.mismatches, 0, JSON.stringify(result))
    assert.equal(result.occlusionFailures, 0, "scenery must retain depth occlusion")
    assert.ok(result.floorCompared > 10000, "must compare feet against enlarged terrain depth")
    assert.equal(result.floorClipped, 0, "the enlarged floor must not erase sprite pixels")
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
})
