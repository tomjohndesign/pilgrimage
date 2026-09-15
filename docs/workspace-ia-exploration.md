# Workspace IA exploration

**Status: proposed design, not implemented.** September 15, 2026.

The [Paper UI page](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0)
contains sixteen exploration frames below the current application captures, named
**IA 01–16**. UI layers are editable; scene previews use captured game imagery.
The tuning scene illustrates proposed preview context, not an existing live balance preview.

## Three areas, three responsibilities

| Area | Responsibility | Contents |
| --- | --- | --- |
| Left sidebar | Choose what to work on | Pages, entities, explorations; then the current level's children |
| Middle canvas | View the selection | Scene, sprite, comparison, catalogue or document |
| Right sidebar | Edit the selection | Properties, rig, sound and tuning controls |

There is no application-wide header or status footer in this mode. A compact
canvas header owns its title, view controls and both sidebar toggles. An optional
canvas footer owns orientation, sprite sequences or simulation playback.
The game link lives at the bottom of the left sidebar.

## Navigation and selection

1. Open the workspace: the left sidebar lists Entities, Explorations and Pages.
2. Select Characters: that list is replaced by the character list, with a
   **Back to Workspace** action at the top. On a first visit, the canvas asks
   for a selection and the properties sidebar stays closed.
3. Select Storybook: highlight its row, load its preview, and show its properties
   on the right. The left sidebar stays on the character list.
4. Select another character: replace the canvas and inspector together while
   preserving the previous character's draft.
5. Back moves up one navigation level. Restore that level's selection, search
   and scroll position; preserve drafts, canvas settings and panel widths.

A branch opens another list; a leaf selects content. Search filters the current
list. Long lists scroll independently. The Paper character list shows representative
entries from presets, road characters and settlement jobs; the implemented list
would include every available character.

Navigation depth belongs on the left. Property groups such as Body, Outfit,
Walking and Sounds stay on the right as simple sections, with optional disclosure
for secondary groups. They do not create another set of page tabs. View choices
such as Character, Sprite sheet and Show rig belong to the canvas.

## Apply the model across the workspace

| Destination | Left sidebar after entering | Canvas | Right properties |
| --- | --- | --- | --- |
| Characters | Characters, grouped by source | Selected character / sprite sheet | Body, outfit, appearance, walking, sounds; selected rig joint |
| Animals | Species / variants | Selected animal | Appearance, gait, rig, sounds |
| Buildings | Buildings | Selected building / map context | Shape, layout, appearance, placement, cost and availability |
| Ents | Species | Selected ent | Foliage, walking and rig |
| Trees | Species | Selected species / lineup / forest | Foliage and generation settings |
| Maps | Available map presets | Generated map | Seed, woodland, clearings and paths |
| Textures | Materials, Characters, Environment, Water; then assets | Selected asset / catalogue | Asset metadata; editable values only where supported |
| Paths | Reinforcement, Wear & regrowth, Grow a town | Scenario / comparison | Layout, path rules, demand and selected tile |
| Village journeys | Residents, workplaces and buildings | Village / selected resident | Journey and selected-entity settings |
| Building placement | Placement scenarios / structures | Placement preview | Terrain, levelling and selected structure |
| Rendering | Comparisons / experiments | Synchronized render views | Scene and render settings |
| Sprite pipeline | Bake stages | Selected stage's output | Character, pose and bake inputs |
| Game tuning | Global rule sections | Relevant preview context | Selected global rules |
| Design document / game specifications | Document sections | Reading surface | Hidden |
| Changelog | Releases | Release details | Hidden |

Entity-specific tuning belongs to the entity inspector. Game tuning's Buildings
entry is a shortcut to the same building browser and inspector, with
**Back to Game tuning** as its return context. Building costs do not get a
second editor. The preview proposed for global tuning requires implementation;
it should show applicable effects and explain rules that affect new settlements only.

## Sidebars and canvas

- Collapse each sidebar independently using the buttons at the leading and
  trailing edges of the canvas header. Keep those buttons available when closed;
  label them through tooltips and accessible names. The property toggle is disabled
  before selection and omitted for reference content without an inspector.
- Drag either inner sidebar edge to resize it. Reveal a grip and resize cursor
  on hover or keyboard focus; double-click restores its default width.
- Starting widths: navigation 248 px, properties 300 px. Explore navigation
  bounds of 200–360 px and property bounds of 260–420 px.
- Resizing changes available canvas space while preserving camera zoom, pose,
  selection and animation state. Keep the animation timeline at a readable maximum width.
- Remember widths and collapsed state across pages. On narrow windows, collapse
  panels before the canvas becomes unusable; open them as independent drawers.
- Make resize handles keyboard-operable separators; arrow keys adjust width.
- Keep status beside the operation it describes: draft/apply state in properties,
  playback state in the canvas footer, and validation beside its field.

The existing Geist font, olive workspace surfaces, grass canvas background,
stacked field labels and shared tooltip style remain the visual foundation.

## Refined visual system

The user-edited [resized character frame](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CCL-0)
is the dark-mode reference. IA 01–10 use its exact surfaces and secondary controls.

| Role | Dark | Light exploration |
| --- | --- | --- |
| Panels and canvas chrome | `#171810` | `#F1F1E8` |
| Filled fields and selected rows | `#252B1D` | `#E3E7D7` |
| Active timeline step | `#334127` | `#CBD5B7` |
| Main text | `#F2E8D5` | `#24291D` |
| Secondary text and icons | `#B5B5A1` | `#626B54` |
| Slider fill | `#66734E` | `#AAB995` |
| Grass canvas | `#556835` | `#556835` |

Secondary buttons, search and canvas dropdowns use transparent backgrounds,
4 px corners and a quiet one-pixel outline. Selected rows and property inputs
use filled surfaces. Panel toggles sit on the surrounding surface. The animation
footer shares the canvas chrome, with filled direction tiles and a single inset
timeline strip. Light mode changes UI surfaces and contrast, preserving scene
artwork and grass. These palettes are Paper proposals; they do not enable an
application theme switch.

### Character row sprites

Replace the generic person icon with the entry's actual sprite in a fixed
16 × 16 px slot. Fit the visible silhouette inside the slot without stretching,
keep a consistent ground anchor and pixelated rendering, and retain a 36 px row
hit target. Rows show presets, Merchant cart, Knight and existing settlement
workers; Tavern worker and Shepherd replace the earlier placeholder Farmer and
Stonemason entries.

- At rest, show the idle pose facing southwest.
- Hovering the row or focusing it by keyboard loops that character's existing
  walk clip at its metadata timing. Keep navigation and selection independent.
- Leaving or blurring the row returns to idle. Selection alone does not animate.
- Share the existing atlas and animation clock; animate only the hovered/focused
  visible row, pause when hidden, and respect reduced motion with the idle pose.
- Use one framing transform based on the clip's full bounds so the sprite does
  not change size or jump between frames. Carts use their existing travel clip.

Paper shows static sprite poses; hover playback is an implementation requirement,
not working animation in these frames.

## Main game concepts

IA 11–13 carry the same visual system into the existing contextual HUD: compact
resources at top left, music/world/menu controls at top right, build actions at
bottom left, time and traffic controls near the bottom, and the minimap at right.
There is no full-width header or footer. Build mode opens a compact list with
rotation and cancel controls; selection opens details above the minimap. Labels
sit above property values. Icon-only actions use accessible names and tooltips.

The main-game scene images are captures from `/play`; resource values, inspection
values, minimap geography and placement overlays illustrate the proposed UI.
They are not a recorded simulation state. IA 14–16 compare light mode for the
character editor, game tuning and normal gameplay. These are design explorations,
not implemented gameplay or navigation changes.

## Paper frames

- [IA 01 · Workspace navigation](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/B67-0)
- [IA 02 · Characters · browse](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BA2-0)
- [IA 03 · Character · properties](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BEA-0)
- [IA 04 · Character · pose editing](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BO4-0)
- [IA 05 · Buildings · Tavern](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/BX2-0)
- [IA 06 · Game tuning · construction](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/C2E-0)
- [IA 07 · Reference · section navigation](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/C6L-0)
- [IA 08 · Character · sidebars collapsed](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/C99-0)
- [IA 09 · Character · resized sidebars](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CCL-0)
- [IA 10 · Exploration · path reinforcement](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CLC-0)

- [IA 11 · Game · Playing](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/D4R-0)
- [IA 12 · Game · Building placement](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/D7K-0)
- [IA 13 · Game · Building selected](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/DC0-0)
- [IA 14 · Light · Character properties](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/CTF-0)
- [IA 15 · Light · Game tuning](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/D1K-0)
- [IA 16 · Light · Playing](https://app.paper.design/file/01M1QTYBYHXP4H1BXFQ79N18AP/2-0/DFN-0)
