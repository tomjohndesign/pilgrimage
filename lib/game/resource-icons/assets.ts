import type { IconTheme, IconSize, IllustratedIcon } from "./design"

/** Versioned, pre-baked PNGs; gameplay never imports the playground's WebGL baker. */
export const GAME_ICON_VERSION = "v2"
export function gameIconUrl(icon: IllustratedIcon, size: IconSize, theme: IconTheme): string {
  return `/game-icons/${GAME_ICON_VERSION}/${theme}/${icon}-${size}.png`
}
