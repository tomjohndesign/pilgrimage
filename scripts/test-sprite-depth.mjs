import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { createServer } from "node:http"
import { test } from "node:test"
import { chromium } from "playwright"
import ts from "typescript"

// Real GPU depth testing: unit tests cannot catch interpolation/quantization seams.
test("sprites preserve overlaps, terrain contact, scenery occlusion, and aligned outlines", async () => {
  const metadata = JSON.parse(await readFile(new URL("../public/textures/characters/base/base-person-v32.json", import.meta.url), "utf8"))
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
  const pixelSource = await readFile(new URL("../components/pixel-canvas.tsx", import.meta.url), "utf8")
  const presentationFragment = pixelSource.match(/fragmentShader: \/\* glsl \*\/ `([\s\S]*?)`/)[1]
  const foliageManifest = JSON.parse(await readFile(new URL("../public/textures/trees/foliage/v5/manifest.json", import.meta.url), "utf8"))
  const foliageModules = {}
  for (const name of ["material", "raycast", "crop"]) {
    foliageModules[name] = ts.transpileModule(await readFile(new URL(`../lib/game/trees/foliage/${name}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext },
    }).outputText.replace('"../../render/sprite-depth"', '"/shader.js"').replace('"./design"', '"/foliage-design.js"')
  }
  const batchModules = {}
  for (const name of ["building-batch", "road-segment-texture", "terrain-elevation", "terrain-hidden-faces", "character-batch", "sprite-texture", "static-instances", "scenery-detail", "flat-geometry", "complexion-swap", "outline"]) {
    batchModules[name] = ts.transpileModule(await readFile(new URL(`../lib/game/render/${name}.ts`, import.meta.url), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext },
    }).outputText.replaceAll('"./sprite-depth"', '"/shader.js"')
      .replaceAll('"./sprite-texture"', '"/batch-sprite-texture.js"')
      .replaceAll('"./complexion-swap"', '"/batch-complexion-swap.js"')
      .replaceAll('"./scenery-detail"', '"/batch-scenery-detail.js"')
      .replaceAll('"./flat-geometry"', '"/batch-flat-geometry.js"')
      .replaceAll('"./outline"', '"/batch-outline.js"')
      .replaceAll('"../base-person/complexion"', '"/complexion-slots.js"')
  }
  const designSource = await readFile(new URL("../lib/game/base-person/design.ts", import.meta.url), "utf8")
  const slots = ["SKIN_SHADES", "HAIR_SHADES"].reduce((sum, name) =>
    sum + JSON.parse(designSource.match(new RegExp(`export const ${name} = (\\[[^\\]]+\\])`))[1]).length, 0)
  const complexionSlots = `export const COMPLEXION_SLOTS = ${slots}`
  const server = createServer(async (request, response) => {
    const name = request.url.slice(1)
    if (name === "complexion-slots.js") {
      response.setHeader("Content-Type", "text/javascript"); response.end(complexionSlots)
    } else if (name.startsWith("batch-") && name.endsWith(".js")) {
      response.setHeader("Content-Type", "text/javascript"); response.end(batchModules[name.slice(6, -3)])
    } else if (name === "foliage-design.js") {
      response.setHeader("Content-Type", "text/javascript"); response.end(`export const FOLIAGE_FRAME = ${JSON.stringify(foliageManifest.frame)}`)
    } else if (name.startsWith("foliage-") && name.endsWith(".js")) {
      response.setHeader("Content-Type", "text/javascript"); response.end(foliageModules[name.slice(8, -3)])
    } else if (["foliage-color.png", "foliage-depth.png"].includes(name)) {
      response.setHeader("Content-Type", "image/png")
      response.end(await readFile(new URL(`../public${foliageManifest[name.includes("color") ? "color" : "depth"]}`, import.meta.url)))
    } else if (name === "shader.js") {
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
    const result = await page.evaluate(async ({ outlineFragment, presentationFragment, poseClips }) => {
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
          uTreeIdMin: { value: 2 }, uTreeIdMax: { value: 2 },
          uCharacterEdgeOpacity: { value: 1 },
          uTreeEdgeOpacity: { value: 1 }, uMode: { value: 1 }, uColor: { value: new THREE.Color(1, 0, 0) },
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
      for (const width of [1, 2.25, 4, 5.75]) for (const shift of [0, 1, 3]) for (const wallId of [1, 2]) for (const groundId of [0, 3]) {
        const left = 25 + shift, bottom = 23 + shift, top = 70 + shift, wall = 49
        const figureAt = (x, y) => x >= left && x < 65 + shift && y >= bottom && y < top
        const idAt = (x, y) => x >= wall ? wallId : figureAt(x, y) ? characterId : groundId
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
        for (const detail of ["close", "distant characters", "distant trees"]) for (const selected of ["none", "character", "tree"]) {
          const characterPass = detail !== "distant trees", ordinaryEdges = detail !== "distant characters"
          outlineMaterial.uniforms.uCharacterPass.value = characterPass
          outlineMaterial.uniforms.uMode.value = ordinaryEdges ? 1 : 0
          outlineMaterial.uniforms.uTreeEdgeOpacity.value = detail === "close" ? 1 : 0
          outlineMaterial.uniforms.uCharacterSelected.value = selected === "character"
          outlineMaterial.uniforms.uSelectedId.value = selected === "character" ? characterId : selected === "tree" ? 2 : 0
          gl.setRenderTarget(outlineTarget)
          gl.render(copyScene, copyCamera)
          gl.readRenderTargetPixels(outlineTarget, 0, 0, size, size, pixels)
          for (let y = 8; y < size - 8; y++) for (let x = 8; x < size - 8; x++) {
            const neighbors = [[x + width, y], [x - width, y], [x, y + width], [x, y - width]]
              .map(([nx, ny]) => [Math.floor(nx + 0.5), Math.floor(ny + 0.5)])
            const edge = ordinaryEdges && neighbors.some(([nx, ny]) => idAt(nx, ny) !== idAt(x, y)
              && (idAt(x, y) !== 0 || idAt(nx, ny) < 2)
              && (!characterPass || idAt(x, y) === characterId || idAt(nx, ny) === characterId)
              && (detail === "close" || (idAt(x, y) !== 2 && idAt(nx, ny) !== 2))
              && depthAt(nx, ny) < depthAt(x, y))
            const selection = selected === "character"
              ? figureAt(x, y) || neighbors.some(([nx, ny]) => figureAt(nx, ny))
              : selected === "tree" && (idAt(x, y) === 2 || neighbors.some(([nx, ny]) => idAt(nx, ny) === 2 && depthAt(nx, ny) < depthAt(x, y)))
            const drawn = pixels[(y * size + x) * 4 + 3] > 0
            if (drawn !== (edge || selection)) {
              if (selected !== "none") selectionMismatches++
              else outlineMismatches++
            }
            outlineCompared++
          }
        }
      }
      // Exercise the actual world presentation shader and GPU snapshot copy.
      // The old world image must survive overwriting its source, across target
      // growth, and blend continuously without drawing the old scene again.
      const currentWorld = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType })
      const previousWorld = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false })
      const fadeOutput = new THREE.WebGLRenderTarget(1, 1)
      const fadeMaterial = new THREE.ShaderMaterial({ vertexShader: copyMaterial.vertexShader, fragmentShader: presentationFragment,
        uniforms: { tScene: { value: currentWorld.texture }, tDepth: { value: depths }, tPrevious: { value: previousWorld.texture },
          uScale: { value: new THREE.Vector2(1, 1) }, uOffset: { value: new THREE.Vector2() },
          uPreviousScale: { value: new THREE.Vector2(1, 1) }, uPreviousOffset: { value: new THREE.Vector2() }, uDetailFade: { value: 1 } } })
      copyMesh.material = fadeMaterial
      let fadeCompared = 0, fadeMismatches = 0
      for (const size of [32, 64]) {
        for (const target of [currentWorld, previousWorld, fadeOutput]) target.setSize(size, size)
        gl.setRenderTarget(currentWorld); gl.setClearColor(new THREE.Color(1, 0, 0), 1); gl.clear()
        gl.initRenderTarget(previousWorld); gl.copyTextureToTexture(currentWorld.texture, previousWorld.texture)
        gl.setRenderTarget(currentWorld); gl.setClearColor(new THREE.Color(0, 0, 1), 1); gl.clear()
        for (const fade of [0, .25, .5, .75, 1]) {
          fadeMaterial.uniforms.uDetailFade.value = fade
          gl.setRenderTarget(fadeOutput); gl.render(copyScene, copyCamera)
          const data = new Uint8Array(size * size * 4)
          gl.readRenderTargetPixels(fadeOutput, 0, 0, size, size, data)
          for (let i = 0; i < data.length; i += 4) {
            fadeCompared++
            if (Math.abs(data[i] - 255 * (1 - fade)) > 1 || data[i + 1] !== 0 || Math.abs(data[i + 2] - 255 * fade) > 1) fadeMismatches++
          }
        }
      }
      for (const target of [currentWorld, previousWorld, fadeOutput]) target.dispose()
      fadeMaterial.dispose()
      for (const texture of [ids, depths, character, characterDepth]) texture.dispose()
      outlineTarget.dispose()
      outlineMaterial.dispose()
      copyMesh.geometry.dispose()
      copyMaterial.dispose()
      gl.dispose()
      return { cases, compared, mismatches, occlusionFailures, floorCompared, floorClipped, supportCompared, supportClipped, poseCompared, poseMismatches, poseVisible, poseHidden, bakeCompared, bakeError,
        outlineCompared, outlineMismatches, selectionMismatches, fadeCompared, fadeMismatches }
    }, { outlineFragment, presentationFragment, poseClips })
    const foliage = await page.evaluate(async () => {
      const THREE = await import("/three.module.js")
      const { foliageMaterial } = await import("/foliage-material.js")
      const { foliageRaycast } = await import("/foliage-raycast.js")
      const { foliageCropTexture } = await import("/foliage-crop.js")
      const { FOLIAGE_FRAME: frame } = await import("/foliage-design.js")
      const [color, depth] = await Promise.all(["color", "depth"].map(kind => new THREE.TextureLoader().loadAsync(`/foliage-${kind}.png`)))
      for (const texture of [color, depth]) { texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false }
      const gl = new THREE.WebGLRenderer({ antialias: false }), size = 192
      gl.setSize(size, size); gl.setClearColor(0, 0)
      const target = new THREE.WebGLRenderTarget(size, size, { depthTexture: new THREE.DepthTexture(size, size) })
      const ztarget = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType })
      const scene = new THREE.Scene(), view = { value: 0 }
      const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.5, -2.5, 0.1, 100)
      camera.position.set(12, 10, 24); camera.lookAt(12, 5, 15); camera.updateMatrixWorld()
      const trees = [0, 1].map(i => {
        const geometry = new THREE.PlaneGeometry(1, 1)
        geometry.translate(0, frame.anchor[1] / frame.cellSize - 0.5, 0)
        geometry.setAttribute("foliageFrame", new THREE.InstancedBufferAttribute(new Float32Array([0, i * 3]), 2))
        geometry.setAttribute("foliageId", new THREE.InstancedBufferAttribute(new Float32Array(i ? [0, 1, 0] : [1, 0, 0]), 3))
        const mesh = new THREE.InstancedMesh(geometry, foliageMaterial(color, depth, view, { value: 0 }, true), 1)
        mesh.position.set(2, 0.8, 4)
        mesh.setMatrixAt(0, new THREE.Matrix4().makeTranslation(10 + i * 0.25, 3, 11 + i * 0.35))
        mesh.raycast = foliageRaycast(geometry, color, depth, view, () => camera)
        mesh.frustumCulled = false; scene.add(mesh); return mesh
      })
      const crop = foliageCropTexture(color)
      const originals = trees.map(tree => tree.material)
      const cropped = trees.map(() => foliageMaterial(color, depth, view, { value: 0 }, true, undefined, crop))
      const copyScene = new THREE.Scene(), copyCamera = new THREE.Camera()
      const copy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        uniforms: { map: { value: target.depthTexture } },
        vertexShader: "varying vec2 v; void main(){v=uv;gl_Position=vec4(position,1.0);}",
        fragmentShader: "uniform sampler2D map; varying vec2 v; void main(){gl_FragColor=vec4(texture2D(map,v).r,0.0,0.0,1.0);}",
      })); copyScene.add(copy)
      const capture = () => {
        gl.setRenderTarget(target); gl.render(scene, camera)
        const pixels = new Uint8Array(size * size * 4), z = new Float32Array(size * size * 4)
        gl.readRenderTargetPixels(target, 0, 0, size, size, pixels)
        gl.setRenderTarget(ztarget); gl.render(copyScene, copyCamera); gl.readRenderTargetPixels(ztarget, 0, 0, size, size, z)
        return { pixels, z }
      }
      const pickExamples = []
      let overlap = 0, mismatches = 0, picked = 0, pickMismatches = 0, holes = 0, cropCompared = 0, cropMismatches = 0, cropDepthMismatches = 0
      const ray = new THREE.Raycaster()
      for (let direction = 0; direction < 8; direction++) {
        view.value = direction
        trees.forEach((tree, i) => { tree.visible = true; tree.material = originals[i] })
        const uncropped = capture()
        trees.forEach((tree, i) => { tree.material = cropped[i] })
        const trimmed = capture()
        for (let i = 0; i < trimmed.pixels.length; i += 4) {
          if (!trimmed.pixels[i + 3] && !uncropped.pixels[i + 3]) continue
          cropCompared++
          if ([0, 1, 2, 3].some(channel => trimmed.pixels[i + channel] !== uncropped.pixels[i + channel])) cropMismatches++
          else if (Math.abs(trimmed.z[i] - uncropped.z[i]) > 1e-6) cropDepthMismatches++
        }
        trees[1].visible = false; const a = capture()
        trees[0].visible = false; trees[1].visible = true; const b = capture()
        trees[0].visible = true; const both = capture()
        for (let i = 0; i < both.pixels.length; i += 4) {
          if (a.pixels[i + 3] && b.pixels[i + 3]) {
            overlap++
            const expected = a.z[i] < b.z[i] ? a : b
            if (both.pixels[i] !== expected.pixels[i]) mismatches++
          }
          if (i / 4 % 7 !== 0) continue
          const x = i / 4 % size, y = Math.floor(i / 4 / size)
          ray.setFromCamera(new THREE.Vector2((x + 0.5) / size * 2 - 1, (y + 0.5) / size * 2 - 1), camera)
          // Rasterizers quantize projected vertices to subpixels. Compare texel
          // interiors; a CPU ray exactly on a leaf edge can land on either texel.
          const nearTexelEdge = trees.some(tree => {
            const matrix = new THREE.Matrix4(); tree.getMatrixAt(0, matrix); matrix.premultiply(tree.matrixWorld)
            const anchor = new THREE.Vector3().setFromMatrixPosition(matrix).project(camera)
            const u = (((x + 0.5) / size * 2 - 1 - anchor.x) * 2.5 / frame.extent + 0.5) * frame.cellSize
            const v = (((y + 0.5) / size * 2 - 1 - anchor.y) * 2.5 / frame.extent + 1 - frame.anchor[1] / frame.cellSize) * frame.cellSize
            return Math.abs(u - Math.round(u)) < 0.1 || Math.abs(v - Math.round(v)) < 0.1
          })
          if (nearTexelEdge) continue
          const hits = ray.intersectObjects(trees, false)
          if (both.pixels[i + 3]) {
            picked++
            if (!hits.length || hits[0].object !== trees[both.pixels[i] ? 0 : 1]) { pickMismatches++; if (pickExamples.length < 12) pickExamples.push({x,y,direction,expected:both.pixels[i] ? 0 : 1,hits:hits.map(h=>({tree:trees.indexOf(h.object),distance:h.distance,uv:h.uv.toArray()})),z:[a.z[i],b.z[i]]}) }
          } else { holes++; if (hits.length) pickMismatches++ }
        }
      }
      trees.forEach(tree => { tree.geometry.dispose(); tree.material.dispose(); tree.dispose() })
      originals.forEach(material => material.dispose()); crop.dispose()
      copy.geometry.dispose(); copy.material.dispose(); color.dispose(); depth.dispose(); target.dispose(); ztarget.dispose(); gl.dispose()
      return { overlap, mismatches, picked, holes, pickMismatches, pickExamples, cropCompared, cropMismatches, cropDepthMismatches }
    })
    const batched = await page.evaluate(async columns => {
      const THREE = await import("/three.module.js")
      const { CharacterBatch, characterPalette } = await import("/batch-character-batch.js")
      const { applyComplexionSwap, complexionUniforms } = await import("/batch-complexion-swap.js")
      const { applySpriteDepth } = await import("/shader.js")
      const color = await new THREE.TextureLoader().loadAsync("/pose-walk.png")
      const depth = await new THREE.TextureLoader().loadAsync("/depth-walk.png")
      for (const texture of [color, depth]) { texture.minFilter = texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false }
      color.colorSpace = THREE.SRGBColorSpace
      const sampleCanvas = document.createElement("canvas")
      sampleCanvas.width = color.image.width; sampleCanvas.height = color.image.height
      const ctx = sampleCanvas.getContext("2d"); ctx.drawImage(color.image, 0, 0)
      const pixels = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data
      let source
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] && pixels[i] > 80) {
        source = `#${[pixels[i], pixels[i + 1], pixels[i + 2]].map(v => v.toString(16).padStart(2, "0")).join("")}`; break
      }
      const gl = new THREE.WebGLRenderer({ antialias: false })
      gl.setClearColor(0, 0)
      const scene = new THREE.Scene(), originals = new THREE.Group()
      scene.add(originals)
      const camera = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, .1, 100)
      const viewport = new THREE.Vector4(), worldTexel = { value: .04 }
      const entries = Array.from({ length: 20 }, (_, i) => {
        const map = color.clone(), ground = { value: new THREE.Vector4(.05, 1, -.1, 0) }
        const pose = { map: { value: depth }, enabled: { value: true } }
        const complexion = complexionUniforms({ from: [source], to: [i % 2 ? "#ab562a" : "#ecd3a0"] })
        const id = new THREE.Vector3((i + 1) / 255, (i * 11 + 1) / 255, .2)
        const sprites = [false, true].map(ids => {
          const material = new THREE.SpriteMaterial({ map, alphaTest: .5, transparent: false, toneMapped: false })
          material.onBeforeCompile = shader => {
            applySpriteDepth(shader, viewport, worldTexel, ground, pose)
            if (ids) {
              shader.uniforms.testId = { value: id }
              shader.fragmentShader = "uniform vec3 testId;\n" + shader.fragmentShader.replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb = testId;")
            } else applyComplexionSwap(shader, complexion)
          }
          material.customProgramCacheKey = () => ids ? "test-batch-id" : "test-batch-color"
          material.onBeforeRender = renderer => renderer.getCurrentViewport(viewport)
          const sprite = new THREE.Sprite(material)
          sprite.layers.set(ids ? 1 : 0); sprite.renderOrder = i + 1
          sprite.center.set(.5, .2421875); sprite.scale.setScalar(.71 + i * .035)
          sprite.position.set((i % 5 - 2) * .22, .02, (Math.floor(i / 5) - 1.5) * .24)
          originals.add(sprite); return sprite
        })
        return { sprite: sprites[0], ids: sprites[1], complexion, ground, depth: pose, id }
      })
      let batch = new CharacterBatch(entries[0], worldTexel, 1)
      scene.add(batch.root)
      let compared = 0, mismatches = 0, visible = 0
      const examples = [], byLayer = [0, 0]
      for (const recolor of [true, false]) {
        if (!recolor) {
          scene.remove(batch.root); batch.dispose()
          for (const entry of entries) {
            delete entry.complexion
            const material = entry.sprite.material
            material.onBeforeCompile = shader => applySpriteDepth(shader, viewport, worldTexel, entry.ground, entry.depth)
            material.customProgramCacheKey = () => "test-batch-uncolored"
            material.needsUpdate = true
          }
          batch = new CharacterBatch(entries[0], worldTexel, 1); scene.add(batch.root)
        }
        for (const size of [192, 384]) {
          gl.setSize(size, size)
          const target = new THREE.WebGLRenderTarget(size, size)
          const capture = () => {
            gl.setRenderTarget(target); gl.render(scene, camera)
            const result = new Uint8Array(size * size * 4)
            gl.readRenderTargetPixels(target, 0, 0, size, size, result); return result
          }
          for (let direction = 0; direction < 8; direction++) {
            const yaw = direction * Math.PI / 4
            camera.position.set(Math.sin(yaw) * 20, 14, Math.cos(yaw) * 20); camera.lookAt(0, .3, 0); camera.updateMatrixWorld()
            for (let frame = 0; frame < 3; frame++) {
              entries.forEach((entry, i) => {
                const map = entry.sprite.material.map
                map.repeat.set(1 / columns, 1 / 8); map.offset.set(((i + frame) % columns) / columns, direction / 8)
                if (entry.complexion && frame === 2) entry.complexion.complexionTo.value[0].setRGB(.22 + i * .002, .4, .25)
                entry.palette = entry.complexion && frame > 0 ? characterPalette(entry.complexion) : undefined
              })
              originals.visible = true; originals.updateWorldMatrix(true, true); batch.write(entries, camera, true)
              for (const layer of [0, 1]) {
                camera.layers.set(layer)
                originals.visible = true; batch.root.visible = false; const reference = capture()
                originals.visible = false; batch.root.visible = true; const actual = capture()
                for (let i = 0; i < actual.length; i += 4) {
                  if (reference[i + 3]) visible++
                  if (!reference[i + 3] && !actual[i + 3]) continue
                  compared++
                  if ([0, 1, 2, 3].some(c => Math.abs(reference[i + c] - actual[i + c]) > 1)) {
                    mismatches++; byLayer[layer]++
                    if (examples.length < 12) examples.push({ size, direction, frame, layer, at: i / 4, reference: [...reference.slice(i, i + 4)], actual: [...actual.slice(i, i + 4)] })
                  }
                }
              }
            }
          }
          target.dispose()
        }
      }
      batch.write(entries.slice(0, 2), camera); batch.write([], camera); batch.dispose()
      originals.children.forEach(sprite => { sprite.material.map.dispose(); sprite.material.dispose() })
      color.dispose(); depth.dispose(); gl.dispose()
      return { compared, visible, mismatches, byLayer, examples }
    }, poseClips.walk)
    const buildings = await page.evaluate(async () => {
      const THREE = await import("/three.module.js")
      const { mergedBuildingBlock, buildingSurfaceMaterial } = await import("/batch-building-batch.js")
      const gl = new THREE.WebGLRenderer({ antialias: false })
      gl.setSize(256, 256); gl.setClearColor(0, 0)
      const scene = new THREE.Scene(), originals = new THREE.Group(), merged = new THREE.Group()
      scene.add(originals, merged, new THREE.AmbientLight(0xffffff, .7))
      const light = new THREE.DirectionalLight(0xffffff, 1.4); light.position.set(3, 5, 2); scene.add(light)
      const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 100)
      const target = new THREE.WebGLRenderTarget(256, 256)
      const bodyMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
      const flatMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })
      const shading = { value: 1 }, batchMaterial = buildingSurfaceMaterial(shading)
      const idMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false })
      const sources = Array.from({ length: 8 }, (_, i) => {
        const full = new THREE.BoxGeometry(.7, .4 + i * .08, .9).toNonIndexed()
        const colors = new Float32Array(full.getAttribute("position").count * 3)
        for (let j = 0; j < colors.length; j += 3) { colors[j] = .3 + i * .04; colors[j + 1] = .45; colors[j + 2] = .12 }
        full.setAttribute("color", new THREE.BufferAttribute(colors, 3))
        const levels = [full, ...[24, 18].map(count => {
          const geometry = new THREE.BufferGeometry()
          for (const [name, attribute] of Object.entries(full.attributes)) geometry.setAttribute(name, attribute)
          geometry.setIndex(Array.from({ length: count }, (_, j) => j)); return geometry
        })]
        const body = new THREE.Mesh(full, bodyMaterial)
        const idColor = new THREE.Color((i + 1) / 255, .2, .4)
        const ids = new THREE.Mesh(full, new THREE.MeshBasicMaterial({ color: idColor, toneMapped: false, side: THREE.DoubleSide }))
        // Real buildings have disjoint footprints; their screen projections overlap.
        body.position.set((i % 4 - 1.5) * .82, .35 + i * .01, (Math.floor(i / 4) - .5) * 1.1)
        body.rotation.y = (i % 4) * Math.PI / 2
        ids.position.copy(body.position); ids.rotation.copy(body.rotation); ids.layers.set(1)
        originals.add(body, ids); body.updateWorldMatrix(true, false)
        return { body, ids, levels }
      })
      let compared = 0, mismatches = 0
      // Removing a selected building from a cell must retain every neighbour.
      for (const selected of [-1, 3]) {
        const active = sources.filter((_, i) => i !== selected)
        const block = mergedBuildingBlock(active)
        const body = new THREE.Mesh(block.body[0], batchMaterial), ids = new THREE.Mesh(block.ids[0], idMaterial)
        ids.layers.set(1); merged.add(body, ids)
        for (const source of sources) source.body.visible = source.ids.visible = source !== sources[selected]
        for (const level of [0, 1, 2]) {
          shading.value = level === 0 ? 1 : 0
          for (const source of sources) source.body.material = level === 0 ? bodyMaterial : flatMaterial
          for (const source of sources) source.body.geometry = source.ids.geometry = source.levels[level]
          body.geometry = block.body[level]; ids.geometry = block.ids[level]
          for (let view = 0; view < 4; view++) {
            const angle = .31 + view * Math.PI / 2
            camera.position.set(Math.sin(angle) * 12, 9, Math.cos(angle) * 12); camera.lookAt(0, .3, 0); camera.updateMatrixWorld()
            for (const layer of [0, 1]) {
              camera.layers.set(layer)
              const capture = batch => {
                originals.visible = !batch; merged.visible = batch
                gl.setRenderTarget(target); gl.render(scene, camera)
                const data = new Uint8Array(256 * 256 * 4)
                gl.readRenderTargetPixels(target, 0, 0, 256, 256, data); return data
              }
              const reference = capture(false), actual = capture(true)
              for (let i = 0; i < actual.length; i += 4) {
                compared++
                if ([0, 1, 2, 3].some(c => Math.abs(actual[i + c] - reference[i + c]) > 1)) mismatches++
              }
            }
          }
        }
        merged.remove(body, ids); block.dispose()
      }
      target.dispose(); bodyMaterial.dispose(); flatMaterial.dispose(); batchMaterial.dispose(); idMaterial.dispose()
      for (const source of sources) { source.ids.material.dispose(); for (const level of source.levels) level.dispose() }
      gl.dispose()
      return { compared, mismatches }
    })
    assert.equal(buildings.mismatches, 0, `building cells must preserve surfaces and IDs at every LOD: ${JSON.stringify(buildings)}`)

    const scenery = await page.evaluate(async () => {
      const THREE = await import("/three.module.js")
      const { StaticInstanceBatch } = await import("/batch-static-instances.js")
      const { indexFlatGeometry } = await import("/batch-flat-geometry.js")
      const gl = new THREE.WebGLRenderer({ antialias: false })
      gl.setSize(192, 192); gl.setClearColor(0, 0)
      const scene = new THREE.Scene(), originals = new THREE.Group()
      scene.add(originals, new THREE.AmbientLight(0xffffff, 1.5))
      const sun = new THREE.DirectionalLight(0xffffff, 2); sun.position.set(3, 7, 2); scene.add(sun)
      const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .1, 100)
      const target = new THREE.WebGLRenderTarget(192, 192)
      const geometry = new THREE.IcosahedronGeometry(1, 1)
      const material = new THREE.MeshLambertMaterial({ flatShading: true })
      const sources = Array.from({ length: 5 }, (_, block) => {
        const source = new THREE.InstancedMesh(geometry, material, 100)
        for (let i = 0; i < 100; i++) {
          const matrix = new THREE.Matrix4().compose(new THREE.Vector3((i % 5 - 2) * .7, block * .3, (Math.floor(i / 5) - 2) * .7 + block * .25),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * .5), new THREE.Vector3(.22, .5, .28))
          source.setMatrixAt(i, matrix); source.setColorAt(i, new THREE.Color().setHSL((i + block * 20) / 100, .6, .5))
        }
        originals.add(source); return source
      })
      const batch = new StaticInstanceBatch(); scene.add(batch.root)
      const indexed = indexFlatGeometry(geometry.clone())
      const capture = () => {
        gl.setRenderTarget(target); gl.render(scene, camera)
        const pixels = new Uint8Array(192 * 192 * 4)
        gl.readRenderTargetPixels(target, 0, 0, 192, 192, pixels); return pixels
      }
      let compared = 0, mismatches = 0
      for (let direction = 0; direction < 8; direction++) {
        if (direction === 4) {
          // Change a late source to verify batched buffer offsets.
          const source = sources.at(-1), matrix = new THREE.Matrix4()
          source.getMatrixAt(0, matrix); matrix.elements[12] += .5; source.setMatrixAt(0, matrix)
          source.setColorAt(0, new THREE.Color("red"))
          source.instanceMatrix.needsUpdate = source.instanceColor.needsUpdate = true
        }
        camera.position.set(Math.sin(direction * Math.PI / 4) * 20, 15, Math.cos(direction * Math.PI / 4) * 20)
        camera.lookAt(0, .5, 0); camera.updateMatrixWorld()
        for (const count of [5, 2, 4]) {
          const active = sources.slice(0, count)
          sources.forEach(source => { source.visible = active.includes(source) })
          batch.write(active)
          if (direction === 0 && count === 5) {
            sources.at(-1).setColorAt(0, new THREE.Color("cyan"))
            sources.at(-1).instanceColor.needsUpdate = true
            batch.write(active) // Changes before the first draw must also reach the GPU.
          }
          batch.mesh.geometry.setIndex(indexed.index)
          batch.mesh.geometry.setAttribute("position", indexed.getAttribute("position"))
          batch.mesh.geometry.setAttribute("normal", indexed.getAttribute("normal"))
          originals.visible = true; batch.root.visible = false; const reference = capture()
          originals.visible = false; batch.root.visible = true; const actual = capture()
          for (let i = 0; i < actual.length; i += 4) {
            if (!reference[i + 3] && !actual[i + 3]) continue
            compared++
            if ([0, 1, 2, 3].some(c => Math.abs(reference[i + c] - actual[i + c]) > 1)) mismatches++
          }
        }
      }
      batch.dispose(); sources.forEach(source => source.dispose()); geometry.dispose(); indexed.dispose(); material.dispose(); target.dispose(); gl.dispose()
      return { compared, mismatches }
    })
    const terrain = await page.evaluate(async () => {
      const THREE = await import("/three.module.js")
      const { elevationShader } = await import("/batch-terrain-elevation.js")
      const { terrainHiddenFaces, compactTerrainFaces } = await import("/batch-terrain-hidden-faces.js")
      const gl = new THREE.WebGLRenderer(), scene = new THREE.Scene()
      const width = 5, heights = Array.from({ length: 25 }, (_, i) => i > 7 && i < 19 ? .6 : 0)
      const corners = heights.flatMap((h, i) => [0, 1, 2, 3].map(c => h + (i % width + c % 2) * .03))
      const masks = terrainHiddenFaces({ width, depth: width, elevation: { corners } }, new Map([[12, true]]))
      const geometry = new THREE.BoxGeometry(1, 1, 1), count = 26
      const originalIndex = [...geometry.index.array]
      const surface = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4)
      const vertexCorners = new THREE.InstancedBufferAttribute(new Float32Array([...corners, 0, 0, 0, 0]), 4)
      const cuts = new Float32Array(count); cuts[12] = 1; cuts[25] = -1
      geometry.setAttribute("aCorners", vertexCorners); geometry.setAttribute("aSurface", surface)
      geometry.setAttribute("aCut", new THREE.InstancedBufferAttribute(cuts, 1))
      const material = new THREE.MeshBasicMaterial({ toneMapped: false })
      material.onBeforeCompile = shader => elevationShader(shader)
      const mesh = new THREE.InstancedMesh(geometry, material, count), matrix = new THREE.Matrix4(), tint = new THREE.Color()
      for (let i = 0; i < count; i++) {
        const tile = i === 25 ? 12 : i, h = i === 25 ? 0 : heights[i]
        const size = h + 1.2
        matrix.makeScale(1, size, 1); matrix.setPosition(tile % width - 2, -1 + size / 2, Math.floor(tile / width) - 2)
        mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, tint.setHSL(i / count, .5, .4))
      }
      scene.add(mesh)
      const slab = new THREE.Mesh(new THREE.BoxGeometry(5.2, .2, 5.2), new THREE.MeshBasicMaterial({ color: 0x473122 }))
      slab.position.y = -1.1; scene.add(slab)
      const camera = new THREE.OrthographicCamera(-4, 4, 4, -4, .1, 100)
      let compared = 0, seams = 0, mismatches = 0, depthMismatches = 0, compactMismatches = 0; const differences = []
      const point = new THREE.Vector3()
      for (const size of [137, 256]) {
        const target = new THREE.WebGLRenderTarget(size, size, { depthTexture: new THREE.DepthTexture(size, size) })
        const ztarget = new THREE.WebGLRenderTarget(size, size, { type: THREE.FloatType })
        const copyScene = new THREE.Scene(), copyCamera = new THREE.Camera()
        const copy = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
          uniforms: { map: { value: target.depthTexture } },
          vertexShader: "varying vec2 v; void main(){v=uv;gl_Position=vec4(position,1.0);}",
          fragmentShader: "uniform sampler2D map; varying vec2 v; void main(){gl_FragColor=vec4(texture2D(map,v).r,0.0,0.0,1.0);}",
        })); copyScene.add(copy)
        const beforeZ = new Float32Array(size * size * 4), afterZ = beforeZ.slice()
        const capture = (pixels, depth) => {
          gl.setRenderTarget(target); gl.render(scene, camera); gl.readRenderTargetPixels(target, 0, 0, size, size, pixels)
          gl.setRenderTarget(ztarget); gl.render(copyScene, copyCamera); gl.readRenderTargetPixels(ztarget, 0, 0, size, size, depth)
        }
        gl.setSize(size, size); gl.setRenderTarget(target)
        const before = new Uint8Array(size * size * 4), after = before.slice()
        for (let view = 0; view < 8; view++) for (const offset of [0, .021]) {
          const yaw = view * Math.PI / 4
          camera.position.set(Math.sin(yaw) * 20 + offset, 14, Math.cos(yaw) * 20 + offset)
          camera.lookAt(offset, 0, offset); camera.updateMatrixWorld()
          surface.array.fill(0); surface.needsUpdate = true
          capture(before, beforeZ)
          masks.forEach((mask, i) => surface.setY(i, mask * 2)); surface.needsUpdate = true
          capture(after, afterZ)
          for (let i = 0; i < before.length; i += 4) {
            if (!before[i + 3]) continue
            compared++
            if (Math.abs(beforeZ[i] - afterZ[i]) > 1e-6) depthMismatches++
            if ([0, 1, 2, 3].every(c => before[i + c] === after[i + c])) continue
            const x = i / 4 % size, y = Math.floor(i / 4 / size)
            point.set((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1, beforeZ[i] * 2 - 1).unproject(camera)
            // Coincident faces can win a different colour tie along the exact
            // shared tile edge (within 1/64 screen pixel of rasterizer rounding).
            // Depth and all surface-interior colours stay exact.
            const seam = Math.min(Math.abs(point.x + .5 - Math.round(point.x + .5)), Math.abs(point.z + .5 - Math.round(point.z + .5))) < (8 / size) / 64
            if (seam) seams++
            else { mismatches++; if (differences.length < 12) differences.push({ size, view, offset, x, y, point: point.toArray() }) }
          }
          // Compare actual submissions against the same shader-masked boxes,
          // including a completely enclosed batch that needs only two top triangles.
          for (const uniformMask of [false, true]) {
            if (uniformMask) for (let i = 0; i < count; i++) surface.setY(i, 30)
            surface.needsUpdate = true
            capture(before, beforeZ)
            compactTerrainFaces(geometry, count)
            if (uniformMask && geometry.drawRange.count !== 6) throw new Error("Enclosed terrain must submit only its top")
            capture(after, afterZ)
            for (let i = 0; i < before.length; i++) if (before[i] !== after[i] || Math.abs(beforeZ[i] - afterZ[i]) > 1e-6) compactMismatches++
            geometry.index.array.set(originalIndex); geometry.index.needsUpdate = true; geometry.setDrawRange(0, 36)
          }
        }
        target.dispose(); ztarget.dispose(); copy.geometry.dispose(); copy.material.dispose()
      }
      geometry.dispose(); material.dispose(); slab.geometry.dispose(); slab.material.dispose(); gl.dispose()
      return { compared, seams, mismatches, depthMismatches, compactMismatches, differences, hiddenFaces: [...masks].reduce((n, mask) => n + mask.toString(2).replaceAll("0", "").length, 0) }
    })
    assert.equal(terrain.compactMismatches, 0, `compacted terrain must preserve every pixel and depth: ${JSON.stringify(terrain)}`)
    assert.ok(terrain.compared > 10000 && terrain.hiddenFaces > 20, JSON.stringify(terrain))
    assert.ok(terrain.seams / terrain.compared < .001, JSON.stringify(terrain))
    assert.equal(terrain.depthMismatches, 0, `buried walls must retain terrain depth: ${JSON.stringify(terrain)}`)
    assert.equal(terrain.mismatches, 0, `buried tile walls must not change visible terrain pixels: ${JSON.stringify(terrain)}`)
    const roads = await page.evaluate(async () => {
      const THREE = await import("/three.module.js")
      const { RoadSegmentTexture } = await import("/batch-road-segment-texture.js")
      const storage = new RoadSegmentTexture(), gl = new THREE.WebGLRenderer()
      const scene = new THREE.Scene(), camera = new THREE.Camera()
      const target = new THREE.WebGLRenderTarget(64, 1, { depthBuffer: false })
      const uniforms = { records: { value: null }, dimensions: { value: new THREE.Vector2() }, count: { value: 1 } }
      const material = new THREE.ShaderMaterial({ uniforms,
        vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
        fragmentShader: `uniform sampler2D records; uniform vec2 dimensions; uniform float count;
          void main() { float i = floor((gl_FragCoord.x - .5) / 63.0 * (count - 1.0));
            gl_FragColor = texture2D(records, (vec2(mod(i, dimensions.x), floor(i / dimensions.x)) + .5) / dimensions); }` })
      const geometry = new THREE.PlaneGeometry(2, 2)
      scene.add(new THREE.Mesh(geometry, material))
      gl.setRenderTarget(target); gl.clear()
      const context = gl.getContext(), original = context.texStorage2D
      let allocations = 0, expectedAllocations = 0, capacity = 0, mismatches = 0, compared = 0
      context.texStorage2D = function (...args) { allocations++; return original.apply(this, args) }
      for (const [revision, count] of [80, 72, 81, 160, 79, 2048, 1800, 2049].entries()) {
        const data = new Float32Array(count * 4)
        for (let i = 0; i < data.length; i++) data[i] = ((i * 13 + revision * 37) % 256) / 255
        if (count > capacity) { expectedAllocations++; capacity = 2 ** Math.ceil(Math.log2(count)) }
        const texture = storage.update(data)
        uniforms.records.value = texture; uniforms.dimensions.value.set(texture.image.width, texture.image.height); uniforms.count.value = count
        gl.render(scene, camera)
        const pixels = new Uint8Array(64 * 4)
        gl.readRenderTargetPixels(target, 0, 0, 64, 1, pixels)
        for (let x = 0; x < 64; x++) for (let c = 0; c < 4; c++) {
          const index = Math.floor(x / 63 * (count - 1)), expected = Math.round(data[index * 4 + c] * 255)
          if (Math.abs(pixels[x * 4 + c] - expected) > 1) mismatches++
          compared++
        }
      }
      storage.dispose(); target.dispose(); geometry.dispose(); material.dispose(); gl.dispose()
      return { compared, mismatches, allocations, expectedAllocations }
    })
    assert.equal(roads.mismatches, 0, `road updates must reach the GPU across reuse and growth: ${JSON.stringify(roads)}`)
    assert.equal(roads.allocations, roads.expectedAllocations, `ordinary road wear must reuse GPU storage: ${JSON.stringify(roads)}`)
    const uploads = await page.evaluate(async () => {
      const THREE = await import("/three.module.js")
      const { spriteTextureView } = await import("/batch-sprite-texture.js")
      const atlas = await new THREE.TextureLoader().loadAsync("/pose-walk.png")
      const gl = new THREE.WebGLRenderer(), scene = new THREE.Scene()
      gl.setSize(64, 64)
      const camera = new THREE.OrthographicCamera(-2, 2, 2, -2, .1, 100)
      camera.position.z = 10
      const add = i => {
        const texture = spriteTextureView(atlas)
        texture.repeat.set(1 / 20, 1 / 8); texture.offset.x = i / 20
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }))
        scene.add(sprite)
      }
      add(0); gl.render(scene, camera)
      const context = gl.getContext(), original = context.texSubImage2D, originalImage = context.texImage2D
      let calls = 0
      context.texSubImage2D = function (...args) { calls++; return original.apply(this, args) }
      context.texImage2D = function (...args) { calls++; return originalImage.apply(this, args) }
      const version = atlas.source.version
      for (let i = 1; i < 20; i++) { add(i); gl.render(scene, camera) }
      const cloned = calls, preserved = atlas.source.version === version
      atlas.needsUpdate = true; add(0); gl.render(scene, camera)
      const changed = calls - cloned
      scene.children.forEach(sprite => { sprite.material.map.dispose(); sprite.material.dispose() })
      atlas.dispose(); gl.dispose()
      return { cloned, changed, preserved }
    })
    assert.equal(uploads.cloned, 0, `new figures must reuse resident atlas images: ${JSON.stringify(uploads)}`)
    assert.ok(uploads.preserved && uploads.changed > 0, `real atlas changes must still upload: ${JSON.stringify(uploads)}`)
    assert.ok(scenery.compared > 10000, JSON.stringify(scenery))
    assert.equal(scenery.mismatches, 0, `visible scenery batches must preserve lighting and overlap pixels: ${JSON.stringify(scenery)}`)
    assert.ok(batched.visible > 10000, JSON.stringify(batched))
    assert.equal(batched.mismatches, 0, `batched color and ID pixels must match individual sprites: ${JSON.stringify(batched)}`)
    assert.ok(foliage.cropCompared > 1000, JSON.stringify(foliage))
    assert.equal(foliage.cropMismatches, 0, `cropping transparent foliage padding must retain visible pixels: ${JSON.stringify(foliage)}`)
    assert.equal(foliage.cropDepthMismatches, 0, `cropping foliage must retain depth: ${JSON.stringify(foliage)}`)
    assert.ok(foliage.overlap > 1000 && foliage.picked > 1000 && foliage.holes > 1000, JSON.stringify(foliage))
    assert.equal(foliage.mismatches, 0, `instanced tree depth must match solo surfaces: ${JSON.stringify(foliage)}`)
    assert.equal(foliage.pickMismatches, 0, `picking must follow visible foliage and leaf holes: ${JSON.stringify(foliage)}`)
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
    assert.ok(result.fadeCompared > 10000, "must test the real snapshot and presentation fade across buffer sizes")
    assert.equal(result.fadeMismatches, 0, "detail fades must blend the preserved world snapshot with the current image")
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
})
