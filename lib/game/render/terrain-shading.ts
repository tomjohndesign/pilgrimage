import { skipInactiveLights } from "./active-lighting"

/** One final dither includes sun, local lights and canopy attenuation together. */
export function terrainShadingShader(shader: { fragmentShader: string }) {
  skipInactiveLights(shader)
  shader.fragmentShader = shader.fragmentShader.replace("#include <opaque_fragment>", `
    outgoingLight = surfaceDitherColor(outgoingLight, terrainDetail);
    #include <opaque_fragment>`)
}
