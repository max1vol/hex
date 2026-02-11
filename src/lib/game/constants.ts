import type { PaletteItem } from './types';

export const HEX_RADIUS = 1.0;
export const BLOCK_H = 1.0;
export const MAX_Y = 48;
export const WORLD_RADIUS = 18;
export const EPS = 1e-4;
export const STEP_ACROSS_SIDE = Math.sqrt(3) * HEX_RADIUS;
export const LOOK_SENS = 0.0022;

export const PALETTE: PaletteItem[] = [
	{ key: 'grass', label: 'Grass', color: 0x3aa35b, tex: '/textures/grass_top.png' },
	{ key: 'dirt', label: 'Dirt', color: 0x7a5c3a, tex: '/textures/dirt.png' },
	{ key: 'stone', label: 'Stone', color: 0x8c9098, tex: '/textures/stone.png' },
	{ key: 'sand', label: 'Sand', color: 0xe8d9a6, tex: '/textures/sand.png' }
];
