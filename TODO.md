# Kelvin: Hex Worlds Roadmap

## Vision
- Build a Minecraft-style hex-block sandbox where each biome is a distinct "time portal" to natural eras and human civilizations.
- Make exploration fun first, then layer educational storytelling into terrain, structures, artifacts, NPC dialogue, and quests.
- Connect biomes through discoverable portals so players move between places/eras in one continuous adventure.

## Core Experience Goals
- Keep block building/destruction responsive and satisfying.
- Make each biome visually and mechanically unique, not just a texture swap.
- Teach through interaction: players learn by building, uncovering, repairing, and comparing worlds.
- Support solo creative play and guided mission play in the same world.

## Biome Concepts (Initial Set)
- Grassland Origins: beginner biome for controls, base building, and first portal discovery.
- Ancient Egypt (Pyramid Construction): quarrying stone, transport/logistics puzzles, monument assembly.
- Ice Age: survival mechanics (cold, scarce resources), prehistoric fauna encounters, glacial terrain shaping.
- Ancient Rome (Colosseum): engineering challenges, arena events, crowd/city simulation flavor.
- Industrial/Modern Paris (Eiffel Tower): metalworking progression, scaffold/build sequencing.
- New York Harbor (Statue of Liberty): modular assembly, maritime logistics, restoration tasks.

## Portal System
- Place "Chrono Portals" in each biome with activation requirements.
- Require milestone completion (quest, artifact set, structure phase) before opening next portal.
- Preserve return travel so players can revisit and bring resources between eras.
- Add portal lore logs to explain historical context and transitions.

## Gameplay Systems To Build
- Biome generation rules:
- Hex terrain presets per biome (height profile, palette, block sets, weather).
- Landmark generator for signature structures and surrounding settlement layouts.
- Biome-specific block libraries:
- Stone variants, decorative motifs, tools/materials per era.
- Interactive education layer:
- "Learn nodes" (signposts, NPCs, artifacts) with concise factual content.
- Optional guided missions tied to historical construction steps.
- Progression:
- Player journal tracking discovered facts, unlocked portals, and completed objectives.
- Reward loop:
- New tools/materials/recipes unlocked by finishing biome milestones.

## Technical TODO (Near-Term)
- Add deterministic simulation hook improvements for automated testing (`advanceTime` currently basic).
- Add in-game toggle for grass animation intensity (off/low/high).
- Improve lighting presets per biome (daylight, fog, ambient color, sky gradient).
- Add asset pipeline conventions:
- `textures/<biome>/...`, `sounds/<biome>/...`, and manifest JSON per biome.
- Add save/load for world edits and portal progression.
- Add biome manager module to swap terrain rules, block palettes, and ambience.

## Content TODO (Near-Term)
- Define educational design doc format:
- 5-10 key facts per biome.
- 3 player activities that demonstrate those facts.
- 1 capstone build/quest to unlock portal.
- Draft first playable mission chain for:
- Grassland Origins -> Ancient Egypt -> Ice Age.

## Quality/Testing TODO
- Automated visual seam checks for all repeating textures.
- Multi-angle inspect snapshots for each block type on every texture update.
- Playwright action scenarios for:
- movement/build/remove loops,
- portal activation flow,
- save/load integrity checks.

## Stretch Ideas
- NPC historians/engineers as guides.
- Co-op building mode.
- "Then vs now" overlay views comparing eras.
- Classroom mode with curated lesson paths and progress export.
