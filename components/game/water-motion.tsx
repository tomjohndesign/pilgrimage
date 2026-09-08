"use client"

import { useEffect, useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import * as THREE from "three"
import { terrainCorner } from "@/lib/game/map/cliff-corners"
import { shorelineCorners } from "@/lib/game/map/shoreline"
import { SHORELINE_SHAPE_GLSL } from "@/lib/game/render/shoreline-shape"
import { waterfallTurbulence } from "@/lib/game/map/waterfall-turbulence"
import { DEFAULT_ELEVATION } from "@/lib/game/map/elevation"
import { tileToWorldX, tileToWorldZ, type GameMap } from "@/lib/game/map/types"
import { CHARACTER_PIXEL_SIZE } from "@/lib/game/render/pixel-scale"
import { GROUND_SURFACE_GLSL, GROUND_UV_SCALE } from "@/lib/game/render/ground-surface"
import { useTerrainTexture } from "./use-terrain-texture"
import { TILE_HEIGHT } from "@/lib/game/map/terrain"

/** Sparse ripple sprites cross tile seams; waterfall foam keeps the same pixel grid. */
export function WaterMotion({ map }: { map: GameMap }) {
  const material = useRef<THREE.ShaderMaterial>(null)
  const ripples = useTerrainTexture("/textures/water.png", "#000000")
  useMemo(() => {
    ripples.wrapS = ripples.wrapT = THREE.RepeatWrapping
    ripples.magFilter = THREE.NearestFilter
    ripples.minFilter = THREE.NearestMipmapLinearFilter
  }, [ripples])
  const geometry = useMemo(() => {
    const positions: number[] = [], uv: number[] = [], falling: number[] = [], turbulence: number[] = [], shores: number[] = [], modes: number[] = []
    const field = waterfallTurbulence(map.water, map.tiles.length, map.elevation?.settings.turbulenceReach ?? DEFAULT_ELEVATION.turbulenceReach)
    const quad = (a: number[], b: number[], c: number[], d: number[], fall = 0, current = [0, 0, 0], shore = [0, 0, 0, 0], mode = 1) => {
      for (const p of [a, b, c, c, b, d]) { positions.push(...p); falling.push(fall); turbulence.push(...current); shores.push(...shore); modes.push(mode) }
      uv.push(0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1)
    }
    const water = map.water
    for (let i = 0; i < map.tiles.length; i++) {
      const wet = !!(water?.depth[i] || map.tiles[i] === "water" || map.tiles[i] === "bridge")
      const tx = i % map.width, tz = Math.floor(i / map.width)
      const cut = terrainCorner(map, tx, tz)
      const shore = cut ? [0, 0, 0, 0] : shorelineCorners(map, tx, tz)
      if (cut && (wet || map.tiles[cut.donor] === "water")) shore[cut.corner] = 1
      if (!wet && !shore.some(Boolean)) continue
      const x = tileToWorldX(map, i % map.width), z = tileToWorldZ(map, Math.floor(i / map.width))
      const y = TILE_HEIGHT + (wet ? water?.surface?.[i] ?? map.elevation?.corners[i * 4] ?? 0 : map.elevation?.corners[i * 4] ?? 0) + 0.012
      // Full tile coverage lets the shader's noise cross boundaries without a repeated border.
      const top = (c: number) => TILE_HEIGHT + (wet ? water?.surface?.[i] ?? map.elevation?.corners[i * 4 + c] ?? 0 : cut?.lower[c] ?? map.elevation?.corners[i * 4 + c] ?? 0) + .012
      const current = wet ? i : cut?.donor ?? i
      quad([x - 0.5, top(0), z - 0.5], [x + 0.5, top(1), z - 0.5], [x - 0.5, top(2), z + 0.5], [x + 0.5, top(3), z + 0.5], 0, Array.from(field.subarray(current * 3, current * 3 + 3)), shore, wet ? 1 : -1)
      if (!wet) continue
      const n = water?.downstream?.[i] ?? -1
      if (water?.motion?.[i] !== "waterfall" || n < 0 || !water.surface || !water.flow[i]) continue
      const [dx, dz] = water.flow[i], low = TILE_HEIGHT + water.surface[n] + 0.015
      const point = (along: number, across: number, h: number) => [x + dx * along - dz * across, h, z + dz * along + dx * across]
      quad(point(0.501, -0.5, y), point(0.501, 0.5, y), point(0.501, -0.5, low), point(0.501, 0.5, low), 1)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2))
    g.setAttribute("aTurbulence", new THREE.Float32BufferAttribute(turbulence, 3))
    g.setAttribute("aShoreCorners", new THREE.Float32BufferAttribute(shores, 4))
    g.setAttribute("aShoreMode", new THREE.Float32BufferAttribute(modes, 1))
    g.setAttribute("aFall", new THREE.Float32BufferAttribute(falling, 1))
    return g
  }, [map])
  useEffect(() => () => geometry.dispose(), [geometry])
  const uniforms = useMemo(() => {
    const s = { ...DEFAULT_ELEVATION, ...map.elevation?.settings }
    return {
      turbulenceStrength: { value: s.waterfallTurbulence }, currentSpeed: { value: s.turbulenceSpeed },
      rippleMap: { value: ripples },
      time: { value: 0 }, seed: { value: ((map.seed ?? 0) % 10007) / 97 },
      strength: { value: s.shimmerStrength }, coverage: { value: s.shimmerCoverage },
      groupSize: { value: s.shimmerSize }, speed: { value: s.shimmerSpeed }, foam: { value: s.foam },
    }
  }, [map.elevation, map.seed, ripples])
  useFrame((_, dt) => { if (material.current) material.current.uniforms.time.value += Math.min(dt, 0.1) })
  return <mesh name="water-shimmer" geometry={geometry} frustumCulled={false}>
    <shaderMaterial ref={material} uniforms={uniforms} transparent depthWrite={false} side={THREE.DoubleSide}
      vertexShader={`attribute float aShoreMode; varying float vShoreMode; attribute vec4 aShoreCorners; varying vec4 vShoreCorners; attribute float aFall; attribute vec3 aTurbulence; varying vec3 vTurbulence; varying float vFall; varying float vHeight; varying vec2 vUv; varying vec2 vWorld;
        void main() { vShoreMode = aShoreMode; vShoreCorners = aShoreCorners; vFall = aFall; vTurbulence = aTurbulence; vUv = uv; vWorld = position.xz; vHeight = position.y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`}
      fragmentShader={`varying float vShoreMode; varying vec4 vShoreCorners; ${SHORELINE_SHAPE_GLSL}
        uniform sampler2D rippleMap;
        ${GROUND_SURFACE_GLSL}
        uniform float time, seed, strength, coverage, groupSize, speed, foam, turbulenceStrength, currentSpeed;
        varying vec3 vTurbulence; varying float vFall; varying float vHeight; varying vec2 vUv; varying vec2 vWorld;
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + seed) * 43758.5453); }
        float noise(vec2 p) {
          vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x),
            mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
        }
        void main() {
          float inset = shorelineInset(vUv, vShoreCorners);
          if (vFall < 0.5 && (vShoreMode > 0.0 ? inset > 0.0 : inset <= 0.0)) discard;
          float t = time * speed;
          vec2 world = (floor(vWorld / ${CHARACTER_PIXEL_SIZE}) + 0.5) * ${CHARACTER_PIXEL_SIZE};
          vec2 patchPos = world / groupSize + vec2(seed, seed * 0.31);
          float patches = noise(patchPos + vec2(sin(t * 0.07), cos(t * 0.09)) * 0.2);
          float grouped = smoothstep(1.0 - coverage, 1.12 - coverage, patches);
          float phase = noise(patchPos * 0.6 + 18.0) * 6.283;
          float ebb = smoothstep(0.15, 0.85, 0.5 + 0.5 * sin(t + phase));
          // Drift in whole native pixels, with a gentle ebb across groups of ripples.
          float drift = floor(t * 3.0) * ${CHARACTER_PIXEL_SIZE};
          vec4 ripple = sampleTiled(rippleMap, (world + vec2(drift, 0.0)) * ${GROUND_UV_SCALE}, world);
          float alpha = strength * ripple.r * mix(0.6, 1.0, grouped * ebb) * min(1.0, coverage * 2.0);
          if (vTurbulence.x > 0.0) {
            vec2 direction = vTurbulence.yz;
            vec2 current = vec2(dot(world, direction), dot(world, vec2(-direction.y, direction.x)));
            current.x -= time * currentSpeed;
            float warp = noise(current * 2.2 + vec2(0.0, time * 0.4));
            // Distorted streaks and broken foam flecks travel with the current, without full-width bands.
            float froth = noise(vec2(current.x * 5.0 + warp * 2.0, current.y * 13.0));
            float swirl = noise(current * 7.0 + vec2(warp, -time * 0.6));
            float brokenFoam = smoothstep(0.48, 0.78, froth) * (0.45 + 0.55 * swirl);
            alpha = max(alpha, turbulenceStrength * vTurbulence.x * (0.08 + 0.8 * brokenFoam));
          }
          if (vFall > 0.5) {
            vec2 fallUv = floor(vec2(vUv.x, vHeight) / ${CHARACTER_PIXEL_SIZE}) * ${CHARACTER_PIXEL_SIZE};
            float streak = step(0.5, noise(vec2(fallUv.x * 14.0 + seed, fallUv.y * 22.0 - floor(time * 8.0) * 0.3125)));
            float edge = smoothstep(0.0, 0.1, vUv.x) * smoothstep(0.0, 0.1, 1.0 - vUv.x);
            alpha = foam * edge * (0.3 + 0.6 * streak);
          }
          gl_FragColor = vec4(0.83, 0.94, 0.96, alpha);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`} />
  </mesh>
}
