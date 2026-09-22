import type { IconSize, IllustratedIcon } from "@/lib/game/resource-icons/design"
import { gameIconUrl } from "@/lib/game/resource-icons/assets"
import { ICON_THEMES } from "@/lib/game/resource-icons/design"

/** Display the reviewed artwork at native resolution, keeping the parent control's accessible name. */
export function GameIcon({ name, size = 24 }: { name: IllustratedIcon; size?: IconSize }) {
  return <span className="game-themed-icon" aria-hidden="true" style={{ width: size, height: size }}>
    {ICON_THEMES.map(theme => <img key={theme} src={gameIconUrl(name, size, theme)} alt="" data-game-icon={name} data-icon-theme={theme} width={size} height={size} style={{ width: size, height: size }} draggable={false} />)}
  </span>
}
