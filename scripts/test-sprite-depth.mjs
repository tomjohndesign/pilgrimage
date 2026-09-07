import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { test } from "node:test"
import { chromium } from "playwright"
import ts from "typescript"

// Real GPU depth testing: unit tests cannot catch interpolation/quantization seams.
test("sprites preserve overlaps, terrain contact, scenery occlusion, and aligned outlines", async () => {
  const metadata = JSON.parse(await readFile(new URL("../public/textures/characters/base/base-person-v31.json", import.meta.url), "utf8"))
  const poseClips = Object.fromEntries(Object.entries(metadata.clips).map(([clip, frames]) => [clip, frames.length / metadata.directions.length]))
  const shader = ts.transpileModule(await readFile(new URL("../lib/game/render/sprite-depth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText
  const baker = ts.transpileModule(await readFile(new URL("../lib/game/render/bake-depth.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText
  const driverShader = ts.transpileModule(await readFile(new URL("../lib/game/transport/driver-layer.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext },
  }).outputText
  const transportSource = await readFile(new URL("../lib/game/transport/assets.ts", import.meta.url), "utf8")
  const transportVersion = transportSource.match(/version: "(v\d+)"/)[1]
  const transportFiles = { "cart.png": "cart-produce-horse.png", "cart-depth.png": "depth-cart-produce-horse.png",
    "driver.png": "cart-produce-driver.png", "driver-depth.png": "depth-cart-produce-driver.png" }
  const outlineSource = await readFile(new URL("../components/game/outline-pass.tsx", import.meta.url), "utf8")
  const outlineFragment = outlineSource.match(/const FRAGMENT_SHADER = \/\* glsl \*\/ `([\s\S]*?)`/)[1]
  const server = createServer(async (request, response) => {
    const name = request.url.slice(1)
    if (name === "shader.js") {
      response.setHeader("Content-Type", "text/javascript")
      response.end(shader)
    } else if (name === "baker.js") {
      response.setHeader("Content-Type", "text/javascript")
      response.end(baker)
    } else if (name === "driver.js") {
      response.setHeader("Content-Type", "text/javascript"); response.end(driverShader)
    } else if (transportFiles[name]) {
      response.setHeader("Content-Type", "image/png")
      response.end(await readFile(new URL(`../public/textures/transport/${transportVersion}/${transportFiles[name]}`, import.meta.url)))
    } else if (/^(pose|depth)-[A-Za-z]+\.png$/.test(name)) {
      const [, kind, clip] = name.match(/^(pose|depth)-([A-Za-z]+)\.png$/)
      const asset = clip === "walk" || clip === "idle"
        ? metadata.images[kind === "pose" ? clip : clip === "walk" ? "depthWalk" : "depthIdle"]
        : metadata.images.actions[clip][kind === "pose" ? "url" : "depth"]
      response.setHeader("Content-Type", "image/png")
      response.end(await readFile(new URL(`../public${asset}`, import.meta.url)))
    } else if (["three.module.js", "three.core.js"].includes(name)) {
      response.setHeader("Content-Type", "text/javascript")
      response.end(await readFile(new URL(`../node_modules/three/build/${name}`, import.meta.url)))
    } else response.end('<!doctype html><script type="importmap">{"imports":{"three":"/three.module.js"}}</script><canvas></canvas>')
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
    const result = await page.evaluate(async ({ outlineFragment, poseClips }) => {
      const THREE = await import("/three.module.js")
      const { applySpriteDepth } = await import("/shader.js")
      const { applyDriverLayer } = await import("/driver.js")
      const driverColor = await new THREE.TextureLoader().loadAsync("/driver.png")
      const driverDepth = await new THREE.TextureLoader().loadAsync("/driver-depth.png")
      for (const texture of [driverColor, driverDepth]) {
        texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false
      }
      const driverFrame = { value: new THREE.Vector4() }, driverVisible = { value: 0 }
      const pixelsOf = texture => {
        const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d")
        canvas.width = texture.image.width; canvas.height = texture.image.height; ctx.drawImage(texture.image, 0, 0)
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data
      }
      const driverPixels = pixelsOf(driverColor), driverDepthPixels = pixelsOf(driverDepth)
      const gl = new THREE.WebGLRenderer({ canvas: document.querySelector("canvas"), antialias: false })
      gl.setSize(384, 384)
      const viewport = new THREE.Vector4()
      const worldTexel = { value: 0 }
      const groundPlane = { value: new THREE.Vector4() }
      const poseDepth = { map: { value: null }, enabled: { value: false } }
      const scene = new THREE.Scene()
      const camera = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 400)
      const makeSprite = (color, order) => {
        const material = new THREE.SpriteMaterial({ color, transparent: false, toneMapped: false })
        material.onBeforeCompile = shader => {
          applySpriteDepth(shader, viewport, worldTexel, groundPlane, poseDepth)
          applyDriverLayer(shader, driverColor, driverFrame, driverVisible, driverDepth)
          // Keep the atlas alpha, using flat IDs for exact pixel comparisons.
          shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = diffuse;")
        }
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
      let supportCompared = 0, supportClipped = 0
      const sleeping = await new THREE.TextureLoader().loadAsync("/pose-sleeping.png")
      const sleepingDepth = await new THREE.TextureLoader().loadAsync("/depth-sleeping.png")
      sleeping.minFilter = sleeping.magFilter = THREE.NearestFilter
      sleepingDepth.minFilter = sleepingDepth.magFilter = THREE.NearestFilter
      sleeping.repeat.set(1 / 16, 1 / 8)
      front.material.alphaTest = .5
      back.visible = false
      // Building paving clears terrain by at most 0.003 world units; characters
      // still stand at terrain height and must keep their complete foot silhouette.
      // Real sleeping silhouettes on furniture must clear the same sampled
      // depth as their ID pass. Test every baked facing, plus the old ground cases.
      const contacts = [{ height: 0, row: -1 }, ...[.009, .0975, .4].flatMap(height =>
        Array.from({ length: 8 }, (_, row) => ({ height, row })))]
      for (const { height, row } of contacts) {
      front.material.map = row < 0 ? null : sleeping
      poseDepth.map.value = sleepingDepth; poseDepth.enabled.value = row >= 0
      front.material.needsUpdate = true
      sleeping.offset.set(0, (7 - row) / 8)
      for (const floorLift of [0, 0.003]) for (const [dx, dz] of (row < 0 ? [[0, 0], [0.3, 0], [-0.3, 0], [0.2, 0.25], [-0.2, -0.25]] : [[0, 0]])) {
        floor.position.y = height + floorLift
        groundPlane.value.set(-dx, 1, -dz, -height)
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
            front.position.set(shift, height + (dx + dz) * shift, shift)
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
              if (row >= 0) {
                supportCompared++
                if (actual[i] < 200) supportClipped++
              }
            }
          }
        }
        ground.depthTexture.dispose()
        ground.dispose()
      }
      }
      }
      sleeping.dispose()
      sleepingDepth.dispose()
      output.dispose()
      floor.geometry.dispose()
      floor.material.dispose()
      // A surface passing THROUGH a pose must split it by the geometry depth,
      // not the upright billboard's height. Compare against the decoded atlas
      // independently on the CPU, including animation, direction and world scale.
      const poseTarget = new THREE.WebGLRenderTarget(256, 256)
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), new THREE.MeshBasicMaterial({ color: 0x0000ff, toneMapped: false }))
      scene.add(wall)
      gl.autoClear = true; camera.zoom = 1; camera.updateProjectionMatrix()
      camera.position.set(0, 2 + 10 / Math.sqrt(3), 10 * Math.sqrt(2 / 3)); camera.lookAt(0, 2, 0); camera.updateMatrixWorld(true)
      wall.quaternion.copy(camera.quaternion)
      front.position.set(0, 2, 0); front.center.set(.5, 1 - 48.5 / 64)
      groundPlane.value.set(0, 0, 0, 0); worldTexel.value = 0; poseDepth.enabled.value = true
      const toward = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 2)
      let poseCompared = 0, poseMismatches = 0, poseVisible = 0, poseHidden = 0
      let driverCompared = 0
      for (const [clip, columns] of Object.entries({ ...poseClips, cart: 24 })) {
        const cart = clip === "cart", cell = cart ? 160 : 64, rows = cart ? 16 : 8
        driverVisible.value = cart ? 1 : 0
        front.center.set(.5, 1 - (cart ? 94 / 160 : 48.5 / 64))
        const color = await new THREE.TextureLoader().loadAsync(cart ? "/cart.png" : `/pose-${clip}.png`)
        const depth = await new THREE.TextureLoader().loadAsync(cart ? "/cart-depth.png" : `/depth-${clip}.png`)
        color.minFilter = color.magFilter = depth.minFilter = depth.magFilter = THREE.NearestFilter
        color.generateMipmaps = depth.generateMipmaps = false
        const canvas = document.createElement("canvas"), ctx = canvas.getContext("2d")
        canvas.width = depth.image.width; canvas.height = depth.image.height
        ctx.drawImage(depth.image, 0, 0)
        const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
        front.material.map = color; front.material.needsUpdate = true; poseDepth.map.value = depth
        for (const scale of [.8, 1.4]) for (const row of (cart ? [0, 1, 2, 4, 7, 11, 15] : [0, 1, 2, 4, 7])) for (const frame of [...new Set([0, Math.floor(columns / 2)])]) {
          front.scale.set(scale, scale, 1)
          color.repeat.set(1 / columns, 1 / rows); color.offset.set(frame / columns, (rows - 1 - row) / rows)
          driverFrame.value.set(0, (rows - 1 - row) / rows, 1 / 6, 1 / rows)
          wall.visible = false
          gl.setRenderTarget(poseTarget); gl.render(scene, camera)
          const mask = new Uint8Array(256 * 256 * 4), actual = mask.slice()
          gl.readRenderTargetPixels(poseTarget, 0, 0, 256, 256, mask)
          wall.visible = true
          for (const cut of [-.12, .05, .2]) {
            wall.position.copy(front.position).addScaledVector(toward, cut * scale)
            gl.render(scene, camera); gl.readRenderTargetPixels(poseTarget, 0, 0, 256, 256, actual)
            for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
              const i = (y * 256 + x) * 4
              if (mask[i + 1] < 200) continue
              const u = ((x + .5) / 256 * 2.4 - 1.2) / scale + front.center.x
              const v = ((y + .5) / 256 * 2.4 - 1.2) / scale + front.center.y
              // Exact texel-boundary ties can round either way in GPU float precision.
              if (Math.abs(u * cell - Math.round(u * cell)) < 1e-5 || Math.abs(v * cell - Math.round(v * cell)) < 1e-5) continue
              const px = Math.floor(u * cell), py = cell - 1 - Math.floor(v * cell)
              if (px < 0 || px >= cell || py < 0 || py >= cell) continue
              const at = ((row * cell + py) * canvas.width + frame * cell + px) * 4
              const driverAt = ((row * cell + py) * driverColor.image.width + px) * 4
              const isDriver = cart && driverPixels[driverAt + 3] >= 128
              const packed = isDriver ? driverDepthPixels[driverAt] * 256 + driverDepthPixels[driverAt + 1] : data[at] * 256 + data[at + 1]
              if (isDriver) driverCompared++
              const offset = (packed / 65535 - .5) * 2
              // Ignore values within the intentional .005-world-unit depth bias.
              if (Math.abs((offset - cut) * scale) < .008) continue
              const visible = offset > cut
              if (visible) poseVisible++; else poseHidden++
              poseCompared++
              if ((actual[i + 1] > 200) !== visible) poseMismatches++
            }
          }
        }
        color.dispose(); depth.dispose()
      }
      if (driverCompared < 100) throw new Error("Driver depth occlusion was not exercised")
      driverVisible.value = 0; driverColor.dispose(); driverDepth.dispose()
      scene.remove(wall); wall.geometry.dispose(); wall.material.dispose(); poseTarget.dispose()
      // Independently verify the baker against ray/mesh intersections, including
      // local garment-style clipping. This catches wrong depth units or anchors.
      const { spriteDepthBaker } = await import("/baker.js")
      const bakeGL = new THREE.WebGLRenderer({ alpha: true, antialias: false })
      bakeGL.setSize(64, 64); bakeGL.setClearColor(0, 0); bakeGL.localClippingEnabled = true
      const bake = spriteDepthBaker(bakeGL), model = new THREE.Scene()
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.4)
      const box = new THREE.Mesh(new THREE.BoxGeometry(.9, 1.3, .7),
        new THREE.MeshBasicMaterial({ color: 0xff0000, side: THREE.DoubleSide, clippingPlanes: [plane] }))
      box.position.set(.2, .7, -.1); model.add(box)
      const bakeCamera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 30)
      bakeCamera.position.set(0, 10 / Math.sqrt(3), 10 * Math.sqrt(2 / 3)); bakeCamera.lookAt(0, 0, 0); bakeCamera.updateMatrixWorld(true)
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 64
      const context = canvas.getContext("2d"), ray = new THREE.Raycaster(), ndc = new THREE.Vector2()
      let bakeCompared = 0, bakeError = 0
      for (const rotation of [0, .8, 1.6]) {
        box.rotation.y = rotation; bakeGL.render(model, bakeCamera)
        context.clearRect(0, 0, 64, 64); context.drawImage(bakeGL.domElement, 0, 0)
        const source = context.getImageData(0, 0, 64, 64).data
        const rendered = bake.render(model, bakeCamera, 64, 4, source, source)
        const depth = rendered.getContext("2d").getImageData(0, 0, 64, 64).data
        for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
          const i = (y * 64 + x) * 4
          if (source[i + 3] < 128) continue
          ndc.set((x + .5) / 64 * 2 - 1, 1 - (y + .5) / 64 * 2); ray.setFromCamera(ndc, bakeCamera)
          const hit = ray.intersectObject(box).find(hit => plane.distanceToPoint(hit.point) >= 0)
          if (!hit) throw new Error("Rendered depth has no matching visible mesh surface")
          // Grazing faces amplify subpixel raster-vertex rounding at the silhouette.
          if (Math.abs(hit.face.normal.clone().transformDirection(box.matrixWorld).dot(toward)) < .2) continue
          const expected = hit.point.applyMatrix4(bakeCamera.matrixWorldInverse).z + 10
          const actual = ((depth[i] * 256 + depth[i + 1]) / 65535 - .5) * 8
          bakeCompared++; bakeError = Math.max(bakeError, Math.abs(actual - expected))
        }
      }
      bake.dispose(); box.geometry.dispose(); box.material.dispose(); bakeGL.dispose()
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
      return { cases, compared, mismatches, occlusionFailures, floorCompared, floorClipped, supportCompared, supportClipped, poseCompared, poseMismatches, poseVisible, poseHidden, bakeCompared, bakeError,
        outlineCompared, outlineMismatches, selectionMismatches }
    }, { outlineFragment, poseClips })
    assert.deepEqual(errors, [], "WebGL shaders should compile without errors")
    assert.ok(result.compared > 10000, "must compare visible overlapping pixels")
    assert.equal(result.mismatches, 0, JSON.stringify(result))
    assert.equal(result.occlusionFailures, 0, "scenery must retain depth occlusion")
    assert.ok(result.floorCompared > 10000, "must compare feet against enlarged terrain depth")
    assert.equal(result.floorClipped, 0, "the enlarged floor must not erase sprite pixels")
    assert.ok(result.supportCompared > 10000, "must compare sleeping silhouettes on raised furniture in every direction")
    assert.equal(result.supportClipped, 0, "furniture depth must not slice supported sleeping sprites")
    assert.ok(result.poseVisible > 10000 && result.poseHidden > 10000, "must test both sides of surfaces intersecting actual poses")
    assert.equal(result.poseMismatches, 0, `pose depth must match the atlas through scenery intersections: ${JSON.stringify(result)}`)
    assert.ok(result.bakeCompared > 500 && result.bakeError < 4 / 64 / 16, `baked depth must match clipped rig geometry: ${JSON.stringify(result)}`)
    assert.ok(result.outlineCompared > 10000, "must compare outlines at multiple zooms and sprite offsets")
    assert.equal(result.outlineMismatches, 0, "overlap outlines must touch the visible sprite and respect foreground occlusion")
    assert.equal(result.selectionMismatches, 0, "selected silhouettes and borders must track the actual character pixels")
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
})
