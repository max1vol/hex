# HexWorld TODO

## Current state

- Core sandbox is playable with hex-prism blocks.
- SvelteKit + TypeScript structure is in place.
- Seamless block textures are wired for grass top/side, dirt, stone, and sand.
- Building/destruction sound effects are active (with mute toggle).
- Click-to-capture mouse and pointer-lock look controls are active.

## Product direction

Build HexWorld into a multi-biome educational adventure where each biome is a high-quality, playable representation of an era or place in natural history and human civilization.

### Biome concept

- Each biome should feel mechanically and visually distinct, not just recolored.
- Each biome should teach through interaction (building, repairing, exploration, quests), not walls of text.
- Travel between biomes should happen through discoverable portal structures.

### Candidate biomes

- Grassland Origins (onboarding + first portal)
- Ancient Egypt (pyramid construction era)
- Ice Age world
- Ancient Rome (Colosseum district)
- Industrial/modern Paris (Eiffel Tower)
- New York Harbor (Statue of Liberty)

## Near-term engineering tasks

- [ ] Split game logic into domain modules (`input`, `camera`, `blocks`, `terrain`, `audio`, `inspect`).
- [ ] Add biome manifest format (`id`, palettes, block set, ambience, portal requirements).
- [ ] Implement biome manager to load/swap terrain generation and atmosphere per biome.
- [ ] Add save/load for world edits and unlocked biome portals.
- [ ] Add test scenario scripts for movement, place/remove loop, and world regeneration.
- [ ] Add per-biome lighting/fog presets and ambient sound layers.
- [ ] Improve HUD readability and mobile-safe controls.

## Near-term design/content tasks

- [ ] Define concise learning goals per biome (5-10 facts each).
- [ ] Define 2-3 interactive tasks that demonstrate each biome's learning goals.
- [ ] Design first portal quest chain: Grassland Origins -> Ancient Egypt -> Ice Age.
- [ ] Create landmark block kits and props for historical structures.

## Quality bar

- Texture seams are visually clean from all camera angles.
- Pointer-lock controls and build actions are deterministic and responsive.
- Each biome introduces a new mechanic and a meaningful educational interaction.
