# Stonehenge Mapping Notes

This file documents how reference images were translated into block coordinates for `grassland-origins`.

## Source references used

- `static/references/stonehenge/minecraftstyle_topdown_map_of_st.png`
- `static/references/stonehenge/voxelgame_architectural_sketch_o.png`
- `static/references/stonehenge/minecraftstyle_stonehenge_side_e.png`
- `static/references/stonehenge/minecraftstyle_side_cutaway_of_s.png`
- `static/references/stonehenge/minecraftstyle_stonehenge_scene_.png`
- `static/references/stonehenge/minecraftstyle_prehistory_villag.png`

## Geometry mapping

- Ceremonial flattening zone:
  - Radius `22` around `(0,0)` is normalized to avoid floating megaliths.
  - Ditch ring near radius `~16.3` is lowered by 1-2 blocks.
  - Outer bank near radius `~19.2` is raised by 1-2 blocks.
- Sarsen outer ring:
  - Radius `11`, `34` sample positions, with an avenue-facing gap.
  - Uprights heights vary (`6-7`) and are grounded to local fixed snapshot terrain.
  - Lintels connect adjacent uprights except across the entrance gap.
- Bluestone inner ring:
  - Radius `6`, `22` positions, heights `3-4`.
- Inner trilithon horseshoe:
  - Five paired uprights with lintels.
  - Approximate coordinate pairs:
    - `(-1,4)` `(1,4)`
    - `(-3,2)` `(-1,2)`
    - `(-4,-1)` `(-2,-1)`
    - `(-3,-4)` `(-1,-4)`
    - `(0,-6)` `(2,-6)`
- Heel stone and avenue:
  - Avenue lines from near center to `(28,-28)` and `(30,-29)`.
  - Heel stone at `(32,-32)` with radius `1`, height `8`.
- Settlements and paths:
  - Village hubs around: `(-24,10)`, `(-20,18)`, `(-10,20)`, `(18,14)`, `(26,20)`, `(12,-18)`.
  - Roundhouse and pen templates applied per hub.
  - Paths connect hubs to monument center.

## Validation strategy

- Unit test `tests/unit/terrain.test.ts` checks stone anchoring:
  - Ensures large stone-column count.
  - Caps unsupported stone columns (currently expected `<=14`, actual debug metric is `0` in current run).
- Debug endpoint:
  - `http://127.0.0.1:4173/debug/stonehenge`
  - Shows:
    - Top-down generated block map.
    - Side slice by `r`.
    - Side slice by `q`.
    - Unsupported stone markers (red).
