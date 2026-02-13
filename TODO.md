# HexWorld TODO / Progress

## Completion summary (2026-02-11)

All previously listed near-term engineering and design tasks are implemented in this branch.

## Latest update (2026-02-11, mobile + Stonehenge pass)

- [x] Replaced startup controls dialog with direct gameplay entry.
- [x] Added touchscreen joystick-left + jump-right + swipe-look camera controls.
- [x] Added touch gestures: one-finger tap breaks highlighted block, two-finger tap places selected block.
- [x] Made material hotbar slots tappable and wrapped for narrow screens.
- [x] Converted first biome into a much larger Stonehenge world with era-appropriate structures, villagers, and animals.
- [x] Regenerated Stonehenge-facing terrain textures (grass/soil/stone/sand/water) using Nano Banana workflow.
- [x] Added Stonehenge biome music track and attribution.

## Latest update (2026-02-12, Stonehenge geometry correction pass)

- [x] Generated a larger Stonehenge reference pack (top maps, side elevations, cutaways, village scenes) with Nano Banana and kept all artifacts under `docs/stonehenge-references/`.
- [x] Added a dedicated split-view debug endpoint (`/debug/stonehenge`) that renders top map + side slices and flags unsupported stone columns.
- [x] Reworked Stonehenge terrain/landmark algorithm to ground megaliths on flattened ceremonial terrain (ditch + bank + avenue), removing floating stone clusters.
- [x] Added a unit regression test to detect unsupported/floating Stonehenge stone columns.
- [x] Added Playwright debug screenshot coverage for the Stonehenge debug endpoint.

## Latest update (2026-02-12, FPS + HUD pass)

- [x] Switched gameplay HUD default to a single FPS line; full debug overlay now behind URL params (`?hud=full` or `?overlay=1`).
- [x] Added dynamic render-window culling around the player (full world data retained, only nearby blocks rendered) to improve FPS and initial load time.
- [x] Reduced render cost defaults (no antialias by default, capped pixel ratio, shorter camera far plane) with URL overrides for captures.
- [x] Removed startup controls toast/dialog noise from default gameplay flow.
- [x] Added unit coverage for render-window behavior and stabilized Playwright startup timeout handling.

## Latest update (2026-02-12, realistic texture + foliage FX pass)

- [x] Replaced Stonehenge core terrain textures with high-resolution realistic Nano Banana outputs (`grass`, `dirt`, `stone`, `sand`, `water`, `timber`, `thatch`), plus generated side blend for `grass_side`.
- [x] Added texture preparation pipeline script (`scripts/textures/prepare-realistic-textures.ts`) to derive usable runtime assets (alpha-cut foliage cards, smoke sprite, fire FX frame).
- [x] Switched fire block rendering to realistic fire texture (`fire_fx.png`) and removed old UV-scroll artifacting for fire.
- [x] Added plane/sprite-based environmental FX layer in-game:
  - grass tuft overlay cards on exposed grass tops (auto-removed when covered),
  - tree leaf cards + trunk instancing for Stonehenge outskirts,
  - animated fire + smoke sprites anchored to hearth/fire blocks.
- [x] Fixed floating NPCs by grounding mesh origins and adding per-species ground offsets.
- [x] Improved Stonehenge NPC behavior with role-based activity anchors (`ritual`, `hearth`, `village`, `grazing`) so movement is tied to visible landmarks instead of random roaming.
- [x] Re-ran validation (`npm run test:unit`, `npm run check`, Playwright touch + gameplay/debug coverage).

## Latest update (2026-02-12, fire/render-distance/NPC animation correction pass)

- [x] Fixed fire block texture presentation: fire now uses side-only textured faces with transparent caps to avoid distorted top-face artifacts.
- [x] Added repeatable block-angle rendering workflow with Playwright inspect captures (`tests/e2e/block-inspect.spec.ts`) and npm script `render:block-angles` for side/top/natural screenshots.
- [x] Increased default block render distance by roughly 4x and extended camera far plane so distant terrain persists correctly.
- [x] Aligned visibility distances across blocks, decorative props, and NPCs to avoid mismatched far-distance rendering.
- [x] Switched Stonehenge trees to block-based generation (trunk + leaf block clusters) instead of billboard leaf planes.
- [x] Added articulated procedural walking animation for villagers and animals (limb swing), plus heading-first movement to avoid side-sliding.

## Latest update (2026-02-13, fire inspect fix + NPC interaction pass)

- [x] Fixed fire block rendering path to use explicit crossed `X`-aligned vertical planes (custom fire geometry + single fire material binding).
- [x] Fixed inspect camera math so captures use real eye height and target block center; regenerated side/top/natural fire block screenshots under `docs/images/block-inspect/`.
- [x] Removed duplicate sprite-fire overlay and kept smoke as the additive fire ambience layer.
- [x] Added basic NPC combat + reaction loop:
  - player can hit villagers/animals via center reticle (mouse and touch single-tap),
  - NPC health, flee behavior, and defeat removal,
  - villagers can enquire when player approaches; animals react and flee.
- [x] Added synthesized NPC voice SFX variants (`enquire`, `hurt`, `death`, `flee`, `animal`, `alert`) and hooked them into behavior transitions.
- [x] Revalidated with automated checks (`npm run test:unit`, `npm run check`, `npm run test:e2e`).

## Current state

- [x] Core sandbox rebuilt into a modular multi-biome game loop.
- [x] Quiz-gated teleport portals for entering and exiting biomes.
- [x] Larger and richer biome generation with landmarks and NPCs.
- [x] Gravity movement, day/night cycle, and weather system.
- [x] Animated nature blocks (grass/sand/water) and bedrock floor.
- [x] Era/place banner always visible in gameplay HUD.
- [x] Save/load for biome edits and unlocked portals.
- [x] New London Westminster and San Francisco Bay worlds.
- [x] KS2 quizzes tied to visible landmarks and era clues.
- [x] Playwright scenario/screenshot attempt and unit test coverage.

## Engineering tasks

- [x] Split game logic into domain modules (`input`, `camera`, `blocks`, `terrain`, `audio`, `inspect`).
- [x] Add biome manifest format (`id`, palettes, block set, ambience, portal requirements).
- [x] Implement biome manager to load/swap terrain generation and atmosphere per biome.
- [x] Add save/load for world edits and unlocked biome portals.
- [x] Add test scenario scripts for movement, place/remove loop, and world regeneration.
- [x] Add per-biome lighting/fog presets and ambient sound layers.
- [x] Improve HUD readability and mobile-safe controls.

## Design/content tasks

- [x] Define concise learning goals per biome.
- [x] Define interactive tasks demonstrating biome learning goals.
- [x] Design portal quest chain and portal travel logic across multiple worlds.
- [x] Create landmark block kits and props for historical structures.

## Notes

- Playwright screenshot capture via native page/canvas screenshot can time out in headless WebGL on this environment.
- Fallback screenshot export via canvas `toDataURL` is saved to `docs/images/hexworld-playwright-canvas-dataurl.png`.
