# Game icons

`/assets?asset=icons` contains the shared icon models and previews. The game
uses the reviewed PNGs under `public/game-icons/v2`, through `GameIcon`.
Every illustrated icon has separate `light/` and `dark/` PNGs. `GameIcon` switches
with the workspace theme through CSS, including before hydration. The playground
opens with both variants side by side; exports have an explicit theme selector.
The dark variant has a brighter one-pixel contour; internal marks and highlights
stay intact. Remaining Lucide UI symbols inherit each theme’s foreground color.

Each icon has native 16, 24, 32 and 48 px versions; use those sizes directly
to keep pixel edges crisp. The PNGs include transparency and the authored glow.

## Export a revision

1. Edit the models in `lib/game/resource-icons/model.ts` and review the result
   in the Icons playground at native sizes on light and dark backgrounds.
   Change `DEFAULT_ICON_DESIGN` if new ink or glow defaults are intended to ship.
2. With a dev server running, export to an unused version:

   ```sh
   npm run assets:icons -- v3 --url http://localhost:3197
   ```

   The exporter opens a fresh playground draft, verifies its PNGs, then saves
   all sizes with a manifest of the exported defaults. Existing versions are
   never overwritten. Local preview edits do not change the game automatically.
3. Update `GAME_ICON_VERSION` in `lib/game/resource-icons/assets.ts`.
4. Run `npm test -- lib/game/resource-icons/assets.test.ts` and inspect the
   HUD at desktop and mobile sizes. The playground's **In game** comparison
   uses these same shipped PNGs.

Use `<GameIcon name="gold" size={24} />` in game controls. Icons are decorative;
keep visible labels and accessible names on the surrounding control.
The stone icon is bundled for future resource UI; there is currently no stone
counter in the game.

After changing UI icon imports, run `node scripts/icon-inventory.mjs` to refresh
the playground's remaining outline-icon inventory.
