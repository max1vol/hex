# HexWorld

HexWorld is a 3D hex-prism sandbox adventure built with Three.js, SvelteKit, and TypeScript.

You travel between large educational biomes (historical eras and places) through quiz-gated teleport portals, while building and repairing landmark-rich worlds.

![HexWorld in-game screenshot](./docs/images/hexworld-ingame.png)

## Gameplay

- World style: Minecraft-like sandbox loop, but using vertical hex-prism blocks.
- Building: `LMB` remove, `RMB` place, `1-8` select material.
- Movement: `WASD` move, `Space` jump (gravity enabled), `F` toggle fast mode.
- Travel: approach a portal and press `E`, then answer a KS2-friendly quiz to enter/exit biomes.
- Systems: day/night cycle, weather changes, animated nature textures, bedrock floor, ambient biome music, and procedural SFX.
- NPCs: blocky wandering villagers in biome hubs.

## Biomes

- Stonehenge Ritual Plain (Late Neolithic Britain)
- Ancient Egypt
- Ice Age Tundra
- Ancient Rome
- Paris Industrial Age
- New York Harbor
- London Westminster (Parliament + Big Ben)
- San Francisco Bay (Golden Gate Bridge + street-art streets)

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

Stonehenge geometry debug view: [http://localhost:5173/debug/stonehenge](http://localhost:5173/debug/stonehenge)

## Checks and tests

```bash
npm run check
npm run build
npm run test:unit
npm run test:e2e
```
