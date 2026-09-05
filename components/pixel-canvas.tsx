"use client"

import { createContext, useContext, useEffect, useMemo, useRef } from "react"
import { Canvas, useFrame, type CanvasProps } from "@react-three/fiber"
import * as THREE from "three"

export interface PixelationProps {
  /** Rendered pixels per world unit. Lower is chunkier and cheaper. Default: 25.
   * Clamped to 1–64 and GPU texture limits. */
  pixelsPerUnit?: number
  /** Turn off the low-resolution world render for comparison. Default: true. */
  pixelated?: boolean
  /** Display pixel ratio for the final upscale. Default: 0.5; use 2 for Retina.
   * Clamped to 0.5–2. */
  outputDpr?: number
}

type RenderScene = (camera: THREE.Camera, target: THREE.WebGLRenderTarget | null) => void
interface PixelRenderer {
  scene: { current: RenderScene | null }
  frame: { current: (() => void) | null }
}
const PixelRenderContext = createContext<PixelRenderer | null>(null)

/** Register scene effects inside the pixel renderer, before the final upscale. */
export function usePixelScene(render: RenderScene) {
  const renderer = useContext(PixelRenderContext)
  if (!renderer) throw new Error("usePixelScene requires PixelCanvas")
  const callback = useRef(render)
  callback.current = render
  useEffect(() => {
    renderer.scene.current = (camera, target) => callback.current(camera, target)
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
    })
    const uniforms = {
      tScene: { value: target.texture },
      uScale: { value: new THREE.Vector2() },
      uOffset: { value: new THREE.Vector2() },
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3))
    const material = new THREE.ShaderMaterial({
      uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = position.xy * 0.5 + 0.5;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tScene;
        uniform vec2 uScale;
        uniform vec2 uOffset;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(tScene, (vUv - 0.5) * uScale + 0.5 + uOffset);
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
    }
  }, [])

  useEffect(() => () => {
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
      const cam = camera as THREE.OrthographicCamera
      if (!pixelated || !cam.isOrthographicCamera) {
        renderScene(camera, null)
        return
      }

      const r = resources
      const width = (cam.right - cam.left) / cam.zoom
      const height = (cam.top - cam.bottom) / cam.zoom
      const maxSize = Math.floor(gl.capabilities.maxTextureSize / BUFFER_STEP) * BUFFER_STEP
      const density = Math.min(pixelsPerUnit, (maxSize - 2) / Math.max(width, height))
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

      renderScene(r.camera, r.target)
      r.uniforms.uScale.value.set(width * density / bufferWidth, height * density / bufferHeight)
      r.uniforms.uOffset.value.set(-dx * density / bufferWidth, -dy * density / bufferHeight)
      gl.setRenderTarget(null)
      gl.render(r.screen, r.screenCamera)
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
 * The scene and outlines render at low resolution; one cheap display pass does
 * the upscale. Camera picking stays in display coordinates. Neither zoom nor
 * panning writes React state or resizes the display canvas.
 */
export function PixelCanvas({
  children,
  style,
  pixelsPerUnit = 25,
  pixelated = true,
  outputDpr = 0.5,
  ...props
}: Omit<CanvasProps, "dpr" | "gl"> & PixelationProps) {
  const renderer = useMemo<PixelRenderer>(() => ({ scene: { current: null }, frame: { current: null } }), [])
  const density = Number.isFinite(pixelsPerUnit) ? THREE.MathUtils.clamp(pixelsPerUnit, 1, 64) : 25
  const dpr = Number.isFinite(outputDpr) ? THREE.MathUtils.clamp(outputDpr, 0.5, 2) : 0.5
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
