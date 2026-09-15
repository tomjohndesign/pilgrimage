import { readFile } from 'node:fs/promises'
import { expect, it } from 'vitest'
import { iconInventory, inventorySource } from './icon-inventory.mjs'

it('keeps All icons in sync with every application Lucide import and bundled icon', async () => {
  const inventory = await iconInventory()
  expect(await readFile(new URL('../components/icon-lab/ui-icon-inventory.ts', import.meta.url), 'utf8')).toBe(inventorySource(inventory))
  expect(inventory.lucide.find(icon => icon.name === 'RotateCw')?.sources).toContain('components/game/hud-controls.tsx')
  expect(inventory.artwork.some(icon => icon.url === '/game-icons/timber.svg')).toBe(true)
})
