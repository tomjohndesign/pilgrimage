"use client"

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react"
import { Canvas, useFrame, type CanvasProps } from "@react-three/fiber"
import * as THREE from "three"
import { CHARACTER_COLOR_LAYER, tagPixelCharacters, withoutPixelCharacters } from "@/lib/game/render/pixel-characters"

import { CHARACTER_PIXELS_PER_UNIT } from "@/lib/game/render/pixel-scale"

export interface PixelationProps {
  /** Rendered pixels per world unit. Lower is chunkier and cheaper. Default: native character density.
   * Clamped to 1–64 and GPU texture limits. */
  pixelsPerUnit?: number
  /** Turn off the low-resolution world render for comparison. Default: true. */
  pixelated?: boolean
  /** Display pixel ratio for characters and the final upscale. Default: 1; use 2 for Retina.
   * Clamped to 0.5–2. */
  outputDpr?: number
}

export interface PixelSceneStage {
  phase: "world" | "characters" | "all"
  /** World-buffer crop, shared by colour, depth, and outline IDs. */
  scale: THREE.Vector2
  offset: THREE.Vector2
}
type RenderScene = (camera: THREE.Camera, target: THREE.WebGLRenderTarget | null, stage: PixelSceneStage) => void
interface PixelRenderer {
  scene: { current: RenderScene | null }
  frame: { current: (() => void) | null }
  characters: Set<THREE.Object3D>
  worldTexel: { value: number }
}
const PixelRenderContext = createContext<PixelRenderer | null>(null)
const NATIVE_WORLD_TEXEL = { value: 0 }

/** World-space size of an enlarged scenery texel during the character pass. */
export function usePixelWorldTexel() {
  return useContext(PixelRenderContext)?.worldTexel ?? NATIVE_WORLD_TEXEL
}

const NO_CHARACTERS: ReadonlySet<THREE.Object3D> = new Set()

/** The live character roots, so effects can prepare passes only when people are on screen. */
export function usePixelCharacterRoots(): ReadonlySet<THREE.Object3D> {
  return useContext(PixelRenderContext)?.characters ?? NO_CHARACTERS
}

/** Character roots keep their original layers for picking and the unpixelated view. */
export function PixelCharacters({ children }: { children: ReactNode }) {
  const renderer = useContext(PixelRenderContext)
  const root = useRef<THREE.Group>(null)
  useLayoutEffect(() => {
    const group = root.current
    if (!group || !renderer) return
    renderer.characters.add(group)
    return () => { renderer.characters.delete(group) }
  }, [renderer])
  return <group ref={root}>{children}</group>
}

/** Register scene effects for both the world pass and the display-resolution characters. */
export function usePixelScene(render: RenderScene) {
  const renderer = useContext(PixelRenderContext)
  if (!renderer) throw new Error("usePixelScene requires PixelCanvas")
  const callback = useRef(render)
  callback.current = render
  useEffect(() => {
    renderer.scene.current = (camera, target, stage) => callback.current(camera, target, stage)
    return () => {
      renderer.scene.current = null
    }
  }, [renderer])
  return renderer.frame
}

/** Reallocate only at capacity boundaries, not for every step of a zoom tween. */
const BUFFER_STEP = 128

function PixelRenderPass({ pixelsPerUnit, pixelated }: Required<Pick<PixelationProps, "pixelsPerUnit" | "pixelated">>) {
  const renderer = useContext(PixelRenderContext)!
  const resources = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      type: THREE.HalfFloatType,
      generateMipmaps: false,
      depthTexture: new THREE.DepthTexture(1, 1),
    })
    const uniforms = {
      tScene: { value: target.texture },
      tDepth: { value: target.depthTexture },
      uScale: { value: new THREE.Vector2() },
      uOffset: { value: new THREE.Vector2() },
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    const material = new THREE.ShaderMaterial({
      uniforms,
      depthTest: true,
      depthWrite: true,
      depthFunc: THREE.AlwaysDepth,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform sampler2D tDepth;
        uniform vec2 uScale;
        uniform vec2 uOffset;
        varying vec2 vUv;
        void main() {
          vec2 sampleUv = (vUv - 0.5) * uScale + 0.5 + uOffset;
          gl_FragColor = texture2D(tScene, sampleUv);
          gl_FragDepth = texture2D(tDepth, sampleUv).x;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
    const screen = new THREE.Scene()
    const triangle = new THREE.Mesh(geometry, material)
    triangle.frustumCulled = false
    screen.add(triangle)
    return {
      target, uniforms, geometry, material, screen,
      camera: new THREE.OrthographicCamera(),
      screenCamera: new THREE.Camera(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      center: new THREE.Vector3(),
      displaySize: new THREE.Vector2(),
      stage: { phase: "all", scale: uniforms.uScale.value, offset: uniforms.uOffset.value } as PixelSceneStage,
    }
  }, [])

  useEffect(() => () => {
    resources.target.depthTexture?.dispose()
    resources.target.dispose()
    resources.geometry.dispose()
    resources.material.dispose()
  }, [resources])

  useFrame(({ camera, gl, scene }) => {
    const renderFrame = () => {
      const renderScene: RenderScene = renderer.scene.current ?? ((cam, target) => {
        gl.setRenderTarget(target)
        gl.render(scene, cam)
      })
      renderer.worldTexel.value = 0
      const cam = camera as THREE.OrthographicCamera
      const r = resources
      if (!pixelated || !cam.isOrthographicCamera) {
        r.stage.phase = "all"
        renderScene(camera, null, r.stage)
        return
      }

      const width = (cam.right - cam.left) / cam.zoom
      const height = (cam.top - cam.bottom) / cam.zoom
      const maxSize = Math.floor(gl.capabilities.maxTextureSize / BUFFER_STEP) * BUFFER_STEP
      gl.getDrawingBufferSize(r.displaySize)
      // Match character detail without drawing pixels smaller than the display.
      const density = Math.min(pixelsPerUnit, r.displaySize.x / width,
        r.displaySize.y / height, (maxSize - 2) / Math.max(width, height))
      // Two extra texels cover the subpixel camera offset at either edge.
      const bufferWidth = Math.ceil((width * density + 2) / BUFFER_STEP) * BUFFER_STEP
      const bufferHeight = Math.ceil((height * density + 2) / BUFFER_STEP) * BUFFER_STEP
      r.target.setSize(bufferWidth, bufferHeight)

      // Rasterise on a fixed world grid. Only the presentation crop changes
      // continuously with zoom; objects never change their texel footprint.
      cam.updateMatrixWorld()
      r.right.setFromMatrixColumn(cam.matrixWorld, 0)
      r.up.setFromMatrixColumn(cam.matrixWorld, 1)
      r.center.copy(cam.position)
        .addScaledVector(r.right, (cam.left + cam.right) / (2 * cam.zoom))
        .addScaledVector(r.up, (cam.top + cam.bottom) / (2 * cam.zoom))
      const x = r.center.dot(r.right)
      const y = r.center.dot(r.up)
      const dx = Math.round(x * density) / density - x
      const dy = Math.round(y * density) / density - y
      r.camera.copy(cam)
      r.camera.position.copy(r.center).addScaledVector(r.right, dx).addScaledVector(r.up, dy)
      r.camera.zoom = 1
      r.camera.left = -bufferWidth / (2 * density)
      r.camera.right = -r.camera.left
      r.camera.top = bufferHeight / (2 * density)
      r.camera.bottom = -r.camera.top
      r.camera.updateProjectionMatrix()
      r.camera.updateMatrixWorld()

      r.uniforms.uScale.value.set(width * density / bufferWidth, height * density / bufferHeight)
      r.uniforms.uOffset.value.set(-dx * density / bufferWidth, -dy * density / bufferHeight)
      tagPixelCharacters(renderer.characters, scene)
      r.stage.phase = "world"
      withoutPixelCharacters(renderer.characters, () => renderScene(r.camera, r.target, r.stage))
      gl.setRenderTarget(null)
      gl.render(r.screen, r.screenCamera)
      if (renderer.characters.size) {
        const background = scene.background
        const mask = camera.layers.mask
        const autoClear = gl.autoClear
        try {
          scene.background = null
          gl.autoClear = false
          camera.layers.set(CHARACTER_COLOR_LAYER)
          renderer.worldTexel.value = 1 / density
          r.stage.phase = "characters"
          renderScene(camera, null, r.stage)
        } finally {
          renderer.worldTexel.value = 0
          scene.background = background
          camera.layers.mask = mask
          gl.autoClear = autoClear
        }
      }
    }
    renderer.frame.current = renderFrame
    renderFrame()
  }, 1)

  useEffect(() => () => {
    renderer.frame.current = null
  }, [renderer])
  return null
}

/**
 * A fixed world pixel grid, cropped and scaled smoothly into the display canvas.
 * Scenery and its outlines render at low resolution; the display pass transfers
 * colour and depth before characters and their outlines render at full resolution.
 * Camera picking stays in display coordinates. Neither zoom nor
 * panning writes React state or resizes the display canvas.
 */
export function PixelCanvas({
  children,
  style,
  pixelsPerUnit = CHARACTER_PIXELS_PER_UNIT,
  pixelated = true,
  outputDpr = 1,
  ...props
}: Omit<CanvasProps, "dpr" | "gl"> & PixelationProps) {
  const renderer = useMemo<PixelRenderer>(() => ({ scene: { current: null }, frame: { current: null }, characters: new Set(), worldTexel: { value: 0 } }), [])
  const density = Number.isFinite(pixelsPerUnit) ? THREE.MathUtils.clamp(pixelsPerUnit, 1, 64) : CHARACTER_PIXELS_PER_UNIT
  const dpr = Number.isFinite(outputDpr) ? THREE.MathUtils.clamp(outputDpr, 0.5, 2) : 1
  return (
    <Canvas
      {...props}
      dpr={dpr}
      gl={{ antialias: false }}
      style={{ ...style, ...(pixelated && { imageRendering: "pixelated" }) }}
    >
      <PixelRenderContext.Provider value={renderer}>
        {children}
        <PixelRenderPass pixelsPerUnit={density} pixelated={pixelated} />
      </PixelRenderContext.Provider>
    </Canvas>
  )
}
