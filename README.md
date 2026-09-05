<img src="public/icon.svg" alt="Pilgrimage" width="60" height="60">

# pilgrimage

A medieval settlement builder inspired by RollerCoaster Tycoon & Age of Empires II.

## Releases and documentation

Every merge to `main` gets a patch version and a changelog entry from the
post-merge Release action. Read the [changelog](CHANGELOG.md) and
[release rules](docs/releases.md). Game-doc and GitHub documentation reviews are
batched every ten releases; feature PRs do not manually increment versions.

## Iconography

The mark (a parchment Cinzel Black "P" on forest green) is designed in Paper: https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/G3-0. It lives in the repo as `public/icon.svg` (vector, the source for every raster size), `public/favicon.ico`, `public/apple-icon.png`, the `public/icon-*.png` PWA sizes in `public/manifest.json`, and `app/opengraph-image.png`, which also serves as the GitHub social preview (Settings → General → Social preview).

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_G39IsnKLmJqSmAYFjBQLSAj6qWzc)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Building the shrine

In `/play`, open **Build & buy** in the Shrine panel, choose a structure, then click
flat, open ground within 12 tiles of the founding hovel. The preview turns red on
blocked tiles. Gold and wood are spent only when placement succeeds; Escape cancels.
The brothers provide supplies every ten seconds while the tab is visible, and
shelters, lodges and halls increase income.

Shrine renown combines buildings, resident individuals, scenery and relics. Expand
the renown total to see its sources. A hall unlocks at 40 renown; relic qualities
contribute to the establishment instead of carrying a separate renown stat.
Open **Tune ↗** in the Shrine panel to edit costs, income, radius, unlocks and
renown rules in a second tab. Apply changes to update the open game without
resetting it. Settings persist locally and synchronize across tabs on the same
origin; starting supplies apply to new settlements. JSON presets can be imported
and exported from `/tuning`.

The implemented rules and default tables are documented at `/docs/game-specs`.
`lib/game/balance.ts` owns defaults, field descriptions, limits and preset validation;
`lib/game/settlement.ts` applies them. The existing `/docs` page remains the wider
game design, including features not yet implemented.

Settlement progress currently lasts for the session: reloading, generating a new
map or changing terrain settings resets it. Appearance and camera changes preserve it.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.

<a href="https://v0.app/chat/api/kiro/clone/tomjohndesign/pilgrimage" alt="Open in Kiro"><img src="https://pdgvvgmkdvyeydso.public.blob.vercel-storage.com/open%20in%20kiro.svg?sanitize=true" /></a>
