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
