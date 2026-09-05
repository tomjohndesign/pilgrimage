/** A small projected silhouette, stored separately so it never becomes an opaque outline. */
export function personCastShadow(source: HTMLCanvasElement, anchor: number[], opacity: number) {
  const size = source.width
  const silhouette = document.createElement("canvas")
  silhouette.width = size; silhouette.height = size
  const ink = silhouette.getContext("2d")!
  ink.drawImage(source, 0, 0)
  ink.globalCompositeOperation = "source-in"
  ink.fillStyle = "#30251e"; ink.fillRect(0, 0, size, size)
  const shadow = document.createElement("canvas")
  shadow.width = size; shadow.height = size
  const context = shadow.getContext("2d")!
  context.globalAlpha = opacity
  context.filter = "blur(0.35px)"
  // Project down and to the right from the fixed ground anchor. Lighting is
  // screen-relative, matching the directional light used to render the body.
  const [x, y] = anchor
  context.setTransform(0.9, 0.03, -0.3, -0.22, x * 0.1 + y * 0.3, y * 1.22 - x * 0.03)
  context.drawImage(silhouette, 0, 0)
  return shadow
}
