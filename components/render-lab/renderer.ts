import * as THREE from "three"
import { applySpriteDepth } from "@/lib/game/render/sprite-depth"
import { cameraOffset, yawForView } from "@/lib/game/render/iso"
import { actorPose, spriteRow, type Character, type LabSettings, type Method } from "@/lib/render-lab/settings"
import { createWorld, disposeScene, lightScene } from "./world"

const ROOT = "/render-lab/sprites/"
const BACKGROUND = "#14100a"
const NEAR = 0.1
const FAR = 400

function renderTarget() {
  return new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
    type: THREE.HalfFloatType, generateMipmaps: false,
    depthTexture: new THREE.DepthTexture(1, 1),
  })
}

/** Color and depth always use the same nearest sample, including the silhouette. */
function imagePass() {
  const uniforms = {
    colorMap: { value: null as THREE.Texture | null }, depthMap: { value: null as THREE.Texture | null },
    crop: { value: new THREE.Vector2(1, 1) }, offset: { value: new THREE.Vector2() },
    rect: { value: new THREE.Vector4(0, 0, 1, 1) }, depthOffset: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({
    uniforms, depthTest: true, depthWrite: true, depthFunc: THREE.LessEqualDepth,
    vertexShader: `varying vec2 vUv;
      uniform vec4 rect;
      void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0 * rect.zw + rect.xy, 0.0, 1.0); }`,
    fragmentShader: `varying vec2 vUv;
      uniform sampler2D colorMap; uniform sampler2D depthMap;
      uniform vec2 crop; uniform vec2 offset; uniform float depthOffset;
      void main() {
        vec2 sampleUv = (vUv - 0.5) * crop + 0.5 + offset;
        vec4 color = texture2D(colorMap, sampleUv);
        if (color.a < 0.5) discard;
        gl_FragColor = color;
        gl_FragDepth = clamp(texture2D(depthMap, sampleUv).x + depthOffset, 0.0, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  })
  const scene = new THREE.Scene()
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
  mesh.frustumCulled = false
  scene.add(mesh)
  return { scene, uniforms }
}

interface Bake {
  target: THREE.WebGLRenderTarget
  center: THREE.Vector3
  cameraPosition: THREE.Vector3
  width: number
  height: number
}

/**
 * Lab-only renderer. Production PixelCanvas stays independent of these experiments.
 * Global sampling mirrors its camera-plane world grid and crop. Hybrid composition
 * transfers the sampled world depth to the display before drawing the characters.
 * Per-asset scenery uses tightly cropped, cached color + depth images, one per prop.
 */
export class LabRenderer {
  private gl: THREE.WebGLRenderer
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, NEAR, FAR)
  private lowCamera = this.camera.clone()
  private screenCamera = new THREE.Camera()
  private world = createWorld()
  private actors = new THREE.Scene()
  private sprites: THREE.Sprite[] = []
  private textures: THREE.Texture[] = []
  private target = renderTarget()
  private pass = imagePass()
  private bakes: Bake[] = []
  private bakeKey = ""
  private viewport = new THREE.Vector4()
  private worldTexel = { value: 0 }
  private right = new THREE.Vector3()
  private up = new THREE.Vector3()
  private back = new THREE.Vector3()
  private scratch = new THREE.Vector3()
  private width = 1
  private height = 1
  private dpr = 0
  private disposed = false
  private character: Character

  constructor(canvas: HTMLCanvasElement, character: Character) {
    this.character = character
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false })
    this.gl.autoClear = false
    // Match R3F's default output, used by the game's PixelCanvas.
    this.gl.toneMapping = THREE.ACESFilmicToneMapping
    this.gl.outputColorSpace = THREE.SRGBColorSpace
    this.gl.setClearColor(BACKGROUND, 1)
  }

  async load() {
    const base = this.character === "base"
    const urls = base ? ["base-person-v8-walk.png", "base-person-v8-idle.png"] : [`${this.character}-v1.png`]
    // allSettled lets a failed or unmounted load release every successful texture.
    const results = await Promise.allSettled(urls.map(url => new THREE.TextureLoader().loadAsync(ROOT + url)))
    const sources = results.flatMap(result => result.status === "fulfilled" ? [result.value] : [])
    if (this.disposed || results.some(result => result.status === "rejected")) {
      sources.forEach(texture => texture.dispose())
      if (!this.disposed) throw new Error("The character artwork could not be loaded. Reload to try again.")
      return
    }
    for (let i = 0; i < 3; i++) {
      for (const source of sources) {
        const texture = source.clone()
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = texture.magFilter = THREE.NearestFilter
        texture.generateMipmaps = false
        texture.needsUpdate = true
        this.textures.push(texture)
      }
      const material = new THREE.SpriteMaterial({ map: this.textures[i * sources.length], alphaTest: 0.5, transparent: false, toneMapped: false })
      material.onBeforeCompile = shader => applySpriteDepth(shader, this.viewport, this.worldTexel)
      material.onBeforeRender = renderer => { renderer.getCurrentViewport(this.viewport) }
      material.customProgramCacheKey = () => "lab-person-depth-v3"
      const sprite = new THREE.Sprite(material)
      sprite.renderOrder = i + 1
      sprite.center.set(0.5, base ? 1 - 48.5 / 64 : 6 / 64)
      this.sprites.push(sprite)
      this.actors.add(sprite)
    }
    sources.forEach(texture => texture.dispose())
  }

  resize(width: number, height: number) {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.gl.setSize(this.width, this.height, false)
  }

  private clear(target: THREE.WebGLRenderTarget | null, transparent = false) {
    this.gl.setRenderTarget(target)
    this.gl.setClearColor(BACKGROUND, transparent ? 0 : 1)
    this.gl.clear(true, true, true)
  }

  private drawWorld(camera: THREE.Camera, scenery: boolean) {
    this.gl.render(this.world.ground.scene, camera)
    if (scenery) this.world.props.forEach(prop => this.gl.render(prop.scene, camera))
  }

  private releaseBakes() {
    this.bakes.forEach(bake => { bake.target.depthTexture?.dispose(); bake.target.dispose() })
    this.bakes = []
  }

  private bakeScenery(density: number, yaw: number) {
    const key = `${density}:${yaw.toFixed(6)}`
    if (this.bakeKey === key) return
    this.releaseBakes()
    this.bakeKey = key
    this.world.props.forEach(prop => {
      prop.scene.updateMatrixWorld(true)
      const bounds = new THREE.Box3().setFromObject(prop.body)
      const viewBounds = new THREE.Box3()
      for (const x of [bounds.min.x, bounds.max.x]) for (const y of [bounds.min.y, bounds.max.y]) for (const z of [bounds.min.z, bounds.max.z]) {
        viewBounds.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(this.camera.matrixWorldInverse))
      }
      const width = Math.ceil((viewBounds.max.x - viewBounds.min.x) * density) + 4
      const height = Math.ceil((viewBounds.max.y - viewBounds.min.y) * density) + 4
      const cx = (viewBounds.min.x + viewBounds.max.x) / 2
      const cy = (viewBounds.min.y + viewBounds.max.y) / 2
      const camera = this.camera.clone()
      camera.zoom = 1
      camera.left = cx - width / density / 2
      camera.right = cx + width / density / 2
      camera.bottom = cy - height / density / 2
      camera.top = cy + height / density / 2
      camera.updateProjectionMatrix()
      const target = renderTarget()
      target.setSize(width, height)
      this.clear(target, true)
      this.gl.render(prop.scene, camera)
      this.bakes.push({ target, center: new THREE.Vector3(cx, cy, 0).applyMatrix4(this.camera.matrixWorld), cameraPosition: this.camera.position.clone(), width: width / density, height: height / density })
    })
  }

  render(settings: LabSettings, method: Method, seconds: number) {
    if (this.disposed || !this.sprites.length) return
    if (settings.dpr !== this.dpr) {
      this.dpr = settings.dpr
      this.gl.setPixelRatio(this.dpr)
      this.gl.setSize(this.width, this.height, false)
    }
    const cam = this.camera
    const yaw = yawForView(settings.view) + (settings.camera === "orbit" ? seconds * 0.16 : 0)
    const pan = settings.camera === "pan" ? Math.sin(seconds * 0.45) * 1.1 : 0
    const zoom = settings.zoom * (settings.camera === "zoom" ? 1 + 0.25 * Math.sin(seconds * 0.45) : 1)
    const height = Math.max(6.5, 10 * this.height / this.width) / zoom
    const width = height * this.width / this.height
    cam.left = -width / 2; cam.right = width / 2; cam.top = height / 2; cam.bottom = -height / 2
    cam.position.set(...cameraOffset(yaw)).add(new THREE.Vector3(pan, 0.45, 0))
    cam.lookAt(pan, 0.45, 0)
    cam.updateProjectionMatrix(); cam.updateMatrixWorld(true)
    this.right.setFromMatrixColumn(cam.matrixWorld, 0)
    this.up.setFromMatrixColumn(cam.matrixWorld, 1)
    this.back.setFromMatrixColumn(cam.matrixWorld, 2)
    lightScene(this.world.ground.sun, yaw)
    this.world.props.forEach(prop => lightScene(prop.sun, yaw))

    const maxSize = Math.floor(this.gl.capabilities.maxTextureSize / 128) * 128
    const density = Math.min(settings.density, (maxSize - 2) / Math.max(width, height))
    this.worldTexel.value = method === "hybrid" || method === "asset" ? 1 / density : 0
    const base = this.character === "base"
    const moving = settings.motion === "walk" || settings.motion === "diagonal"
    const columns = base ? (moving ? 8 : 1) : 4
    this.sprites.forEach((sprite, i) => {
      const pose = actorPose(seconds, settings.motion, i)
      sprite.position.set(pose.x, 0.055, pose.z)
      sprite.scale.setScalar((base ? 0.74 * 64 / 48 : 0.74) * settings.scale)
      if (method === "snapped") {
        const x = sprite.position.dot(this.right), y = sprite.position.dot(this.up)
        sprite.position.addScaledVector(this.right, Math.round(x * density) / density - x)
        sprite.position.addScaledVector(this.up, Math.round(y * density) / density - y)
      }
      const texture = this.textures[base ? i * 2 + (moving ? 0 : 1) : i]
      const frame = moving ? Math.floor(seconds * settings.fps) % columns : base ? 0 : 1
      texture.repeat.set(1 / columns, 1 / 8)
      texture.offset.set(frame / columns, (7 - spriteRow(pose.heading, yaw)) / 8)
      sprite.material.map = texture
    })

    if (method === "native") {
      this.clear(null)
      this.drawWorld(cam, settings.scenery)
      this.gl.render(this.actors, cam)
      return
    }
    if (method === "asset" && settings.scenery) this.bakeScenery(density, yaw)

    // Same grid anchoring and padded crop as PixelCanvas, independently of zoom.
    const bufferWidth = Math.ceil((width * density + 2) / 128) * 128
    const bufferHeight = Math.ceil((height * density + 2) / 128) * 128
    this.target.setSize(bufferWidth, bufferHeight)
    const x = cam.position.dot(this.right), y = cam.position.dot(this.up)
    const dx = Math.round(x * density) / density - x
    const dy = Math.round(y * density) / density - y
    const low = this.lowCamera.copy(cam)
    low.position.addScaledVector(this.right, dx).addScaledVector(this.up, dy)
    low.left = -bufferWidth / density / 2; low.right = -low.left
    low.top = bufferHeight / density / 2; low.bottom = -low.top
    low.updateProjectionMatrix(); low.updateMatrixWorld(true)
    this.clear(this.target)
    this.drawWorld(low, settings.scenery && method !== "asset")
    if (method === "global" || method === "snapped") this.gl.render(this.actors, low)

    this.clear(null)
    const u = this.pass.uniforms
    u.colorMap.value = this.target.texture; u.depthMap.value = this.target.depthTexture
    u.crop.value.set(width * density / bufferWidth, height * density / bufferHeight)
    u.offset.value.set(-dx * density / bufferWidth, -dy * density / bufferHeight)
    u.rect.value.set(0, 0, 1, 1); u.depthOffset.value = 0
    this.gl.render(this.pass.scene, this.screenCamera)

    if (method === "asset" && settings.scenery) {
      u.crop.value.set(1, 1); u.offset.value.set(0, 0)
      for (const bake of this.bakes) {
        const center = this.scratch.copy(bake.center).project(cam)
        u.rect.value.set(center.x, center.y, bake.width / width, bake.height / height)
        u.depthOffset.value = this.scratch.copy(bake.cameraPosition).sub(cam.position).dot(this.back) * cam.projectionMatrix.elements[10] / 2
        u.colorMap.value = bake.target.texture; u.depthMap.value = bake.target.depthTexture
        this.gl.render(this.pass.scene, this.screenCamera)
      }
    }
    if (method === "hybrid" || method === "asset") this.gl.render(this.actors, cam)
  }

  dispose() {
    this.disposed = true
    this.releaseBakes()
    this.target.depthTexture?.dispose(); this.target.dispose()
    disposeScene(this.world.ground.scene)
    this.world.props.forEach(prop => disposeScene(prop.scene))
    disposeScene(this.pass.scene)
    this.sprites.forEach(sprite => sprite.material.dispose())
    this.textures.forEach(texture => texture.dispose())
    this.gl.dispose()
    // React Strict Mode and character changes reuse this canvas immediately.
    // Forcing loss here would asynchronously invalidate the next renderer.
    // Detached canvases (leaving a view) can safely release the context itself.
    if (!this.gl.domElement.isConnected) this.gl.forceContextLoss()
  }
}
