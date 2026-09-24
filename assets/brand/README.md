# Manuscript branding

Approved designs:

- [Green reliquary app icon](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/E7H-1)
- [Selected chronicle wordmark](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBI-1)
- [Production OG card](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBK-0)
- [Social header](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBN-0)
- [Social cover](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBQ-0)
- [Social scene — The relic settlement](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBT-0)
- [Twitter scene cover](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBW-0)
- [Profile picture with crop margin](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/p-5-1/EBZ-0)

`icon.png` and `banner.png` are exports of the approved artwork.
`wordmark.png` preserves the original UnifrakturCook outlines, green pigment,
gold accents and reliquary on a transparent layer. `icon-maskable.png` places
the same initial inside the central safe area for rounded or circular crops.

The built-in image generation tool adapted the blank manuscript frame into
`og-background.png` and `cover-background.png`; prompts are in `prompts.json`.
Lettering is composited from the approved source, never regenerated.

`settlement-scene.png` is a separate illustration without lettering: pilgrims
arriving at the relic chapel, surrounded by a market, shepherd and builders.
It was generated with the built-in image tool using the wordmark cover as a
style reference. Its full prompt is in `scene-prompt.json`.
`twitter-scene.png` adapts this scene to 3:1 with the complete border visible;
the built-in image editing prompt is in `twitter-scene-prompt.json`.

Run `node scripts/export-brand.mjs` to reproduce:

- Favicon: 16, 32 and 48 px in one ICO; painted SVG fallback.
- Apple icon: 180 px; PWA icons: 192 and 512 px; maskable: 512 px.
- `app/opengraph-image.png`: 1200 × 630, discovered by Next.js metadata.
- `public/brand/pilgrimage-og.png`: downloadable copy of the OG image.
- `public/brand/pilgrimage-banner-wide.png`: 1500 × 500 social header.
- `public/brand/pilgrimage-banner-cover.png`: 1640 × 624 social cover.
- `public/brand/pilgrimage-social-scene.png`: 1640 × 624 illustrated social cover.
- `public/brand/pilgrimage-twitter-cover.png`: 1500 × 500 Twitter/X scene cover.
- `public/brand/pilgrimage-profile.png`: 400 × 400 profile image with extra green
  margin around the same initial, using the maskable icon source for circular crops.

PNG exports use an optimized palette to retain fine painted detail at a modest
download size. Social networks may crop headers around profile pictures; these
files include the complete artwork for platform-specific positioning.
