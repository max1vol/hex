import type { BlockDefinition, BlockType, PaletteItem } from './types';

export const HEX_RADIUS = 1.0;
export const BLOCK_H = 1.0;
export const MAX_Y = 80;
export const EPS = 1e-4;
export const STEP_ACROSS_SIDE = Math.sqrt(3) * HEX_RADIUS;
export const LOOK_SENS = 0.0022;

export const WORLD_MIN_RADIUS = 26;
export const PLAYER_EYE_HEIGHT = 1.62;
export const PLAYER_RADIUS = 0.32;
export const PLAYER_GRAVITY = -24;
export const PLAYER_JUMP_VELOCITY = 8.6;
export const PLAYER_MOVE_SPEED = 6.8;

export const SAVE_KEY = 'hexworld-save-v2';

export const BLOCK_DEFINITIONS: Record<BlockType, BlockDefinition> = {
	grass: { key: 'grass', label: 'Grass', color: 0x3aa35b, tex: '/textures/grass_top.png' },
	dirt: { key: 'dirt', label: 'Dirt', color: 0x7a5c3a, tex: '/textures/dirt.png' },
	stone: { key: 'stone', label: 'Stone', color: 0x8c9098, tex: '/textures/stone.png' },
	sand: { key: 'sand', label: 'Sand', color: 0xe8d9a6, tex: '/textures/sand.png' },
	water: {
		key: 'water',
		label: 'Water',
		color: 0x63b5ff,
		tex: '/textures/water.png',
		transparent: true,
		opacity: 0.72,
		emissive: 0x08233a
	},
	bedrock: { key: 'bedrock', label: 'Bedrock', color: 0x3d3b3f, tex: '/textures/bedrock.png' },
	brick: { key: 'brick', label: 'Brick', color: 0xb74b3c, tex: '/textures/brick.png' },
	snow: { key: 'snow', label: 'Snow', color: 0xf4f8ff, tex: '/textures/snow.png' },
	ice: {
		key: 'ice',
		label: 'Ice',
		color: 0xb7e5ff,
		tex: '/textures/ice.png',
		transparent: true,
		opacity: 0.82,
		emissive: 0x0f2838
	},
	metal: { key: 'metal', label: 'Metal', color: 0x9aa7b4, tex: '/textures/metal.png' },
	asphalt: { key: 'asphalt', label: 'Asphalt', color: 0x2d3137, tex: '/textures/asphalt.png' },
	art: { key: 'art', label: 'Street Art', color: 0xfc5fa4, tex: '/textures/street_art.png', emissive: 0x2f1236 },
	timber: { key: 'timber', label: 'Timber', color: 0x8a5b38, tex: '/textures/timber.png' },
	thatch: { key: 'thatch', label: 'Thatch', color: 0xd1b27a, tex: '/textures/thatch.png' },
	fire: { key: 'fire', label: 'Fire', color: 0xffa14c, tex: '/textures/fire.png', emissive: 0x8a3100, transparent: true, opacity: 0.88 }
};

const BUILD_KEYS: BlockType[] = [
	'grass',
	'dirt',
	'stone',
	'sand',
	'timber',
	'thatch',
	'brick',
	'metal',
	'asphalt',
	'art',
	'fire'
];

export const PALETTE: PaletteItem[] = BUILD_KEYS.map((key) => BLOCK_DEFINITIONS[key]);

export const WATER_LIKE_BLOCKS = new Set<BlockType>(['water', 'ice']);
export const SOLID_BLOCKS = new Set<BlockType>([
	'grass',
	'dirt',
	'stone',
	'sand',
	'bedrock',
	'brick',
	'snow',
	'metal',
	'asphalt',
	'art',
	'timber',
	'thatch'
]);
