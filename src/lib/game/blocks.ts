import * as THREE from 'three';
import { BLOCK_DEFINITIONS } from './constants';
import { loadTexture } from './texture';
import type { BlockMaterialMap, BlockType } from './types';

const ALL_BLOCK_TYPES: BlockType[] = [
	'grass',
	'dirt',
	'stone',
	'sand',
	'water',
	'bedrock',
	'brick',
	'snow',
	'ice',
	'metal',
	'asphalt',
	'art',
	'timber',
	'thatch',
	'fire'
];

const TEXTURE_PATHS: Record<string, string> = {
	grass_top: '/textures/grass_top.png',
	grass_side: '/textures/grass_side.png',
	dirt: '/textures/dirt.png',
	stone: '/textures/stone.png',
	sand: '/textures/sand.png',
	water: '/textures/water.png',
	bedrock: '/textures/bedrock.png',
	brick: '/textures/brick.png',
	snow: '/textures/snow.png',
	ice: '/textures/ice.png',
	metal: '/textures/metal.png',
	asphalt: '/textures/asphalt.png',
	art: '/textures/street_art.png',
	timber: '/textures/timber.png',
	thatch: '/textures/thatch.png',
	fire: '/textures/fire_fx.png'
};

export interface AnimatedTextureRefs {
	grassTop: THREE.Texture | null;
	grassSide: THREE.Texture | null;
	sand: THREE.Texture | null;
	water: THREE.Texture | null;
	fire: THREE.Texture | null;
}

function createMaterial(type: BlockType): THREE.MeshLambertMaterial {
	const def = BLOCK_DEFINITIONS[type];
	const mat = new THREE.MeshLambertMaterial({
		color: def.color,
		transparent: def.transparent ?? false,
		opacity: def.opacity ?? 1,
		emissive: new THREE.Color(def.emissive ?? 0x000000)
	});
	if (type === 'fire') {
		mat.depthWrite = false;
	}
	return mat;
}

export function createBlockMaterials(): BlockMaterialMap {
	const mats = {} as BlockMaterialMap;
	for (const key of ALL_BLOCK_TYPES) {
		const m = createMaterial(key);
		mats[key] = [m, m.clone(), m.clone()];
	}

	const grassSide = createMaterial('grass');
	const grassTop = createMaterial('grass');
	const dirtBottom = createMaterial('dirt');
	mats.grass = [grassSide, grassTop, dirtBottom];

	const fireSide = createMaterial('fire');
	const fireCap = new THREE.MeshLambertMaterial({
		color: 0xffffff,
		transparent: true,
		opacity: 0,
		depthWrite: false
	});
	mats.fire = [fireSide, fireCap.clone(), fireCap];

	return mats;
}

export async function loadBlockTextures(
	renderer: THREE.WebGLRenderer,
	mats: BlockMaterialMap
): Promise<AnimatedTextureRefs> {
	const loader = new THREE.TextureLoader();
	const refs: AnimatedTextureRefs = {
		grassTop: null,
		grassSide: null,
		sand: null,
		water: null,
		fire: null
	};

	const textureEntries = Object.entries(TEXTURE_PATHS);
	const loaded = await Promise.all(
		textureEntries.map(async ([key, path]) => {
			const tex = await loadTexture(renderer, loader, path, {
				wrapS: key === 'fire' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping,
				wrapT: key === 'fire' ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping,
				minFilter: THREE.LinearMipmapLinearFilter,
				magFilter: THREE.LinearFilter
			});
			if (key === 'grass_side') tex.wrapT = THREE.ClampToEdgeWrapping;
			return [key, tex] as const;
		})
	);

	const texMap = new Map<string, THREE.Texture>(loaded);

	const assign = (type: BlockType, textureKey: string): void => {
		const t = texMap.get(textureKey);
		if (!t) return;
		const materials = mats[type] as THREE.MeshLambertMaterial[];
		for (const mat of materials) {
			mat.map = t;
			mat.color.set(0xffffff);
			mat.needsUpdate = true;
		}
	};

	assign('dirt', 'dirt');
	assign('stone', 'stone');
	assign('sand', 'sand');
	assign('water', 'water');
	assign('bedrock', 'bedrock');
	assign('brick', 'brick');
	assign('snow', 'snow');
	assign('ice', 'ice');
	assign('metal', 'metal');
	assign('asphalt', 'asphalt');
	assign('art', 'art');
	assign('timber', 'timber');
	assign('thatch', 'thatch');

	const grassTop = texMap.get('grass_top') ?? null;
	const grassSide = texMap.get('grass_side') ?? null;
	const grassMats = mats.grass as THREE.MeshLambertMaterial[];
	if (grassTop) {
		grassMats[1].map = grassTop;
		grassMats[1].color.set(0xffffff);
		grassMats[1].needsUpdate = true;
		refs.grassTop = grassTop;
	}
	if (grassSide) {
		grassMats[0].map = grassSide;
		grassMats[0].color.set(0xffffff);
		grassMats[0].needsUpdate = true;
		refs.grassSide = grassSide;
	}
	const dirtTex = texMap.get('dirt');
	if (dirtTex) {
		grassMats[2].map = dirtTex;
		grassMats[2].color.set(0xffffff);
		grassMats[2].needsUpdate = true;
	}

	refs.sand = texMap.get('sand') ?? null;
	refs.water = texMap.get('water') ?? null;
	const fireTex = texMap.get('fire') ?? null;
	if (fireTex) {
		const fireMats = mats.fire as THREE.MeshLambertMaterial[];
		fireMats[0].map = fireTex;
		fireMats[0].color.set(0xffffff);
		fireMats[0].needsUpdate = true;
		for (let i = 1; i < fireMats.length; i++) {
			fireMats[i].map = null;
			fireMats[i].transparent = true;
			fireMats[i].opacity = 0;
			fireMats[i].depthWrite = false;
			fireMats[i].needsUpdate = true;
		}
	}
	refs.fire = fireTex;
	return refs;
}

export function updateNatureTextureAnimation(refs: AnimatedTextureRefs, nowMs: number): void {
	const t = nowMs * 0.001;
	if (refs.grassTop) {
		refs.grassTop.offset.x = 0.007 * Math.sin(t * 0.45);
		refs.grassTop.offset.y = 0.005 * Math.cos(t * 0.39);
	}
	if (refs.grassSide) {
		refs.grassSide.offset.x = 0.01 * Math.sin(t * 0.65 + 0.8);
	}
	if (refs.sand) {
		refs.sand.offset.x = 0.004 * Math.sin(t * 0.2 + 0.5);
		refs.sand.offset.y = 0.004 * Math.cos(t * 0.22);
	}
	if (refs.water) {
		refs.water.offset.x = 0.025 * Math.sin(t * 0.7);
		refs.water.offset.y = 0.03 * Math.cos(t * 0.56);
	}
	if (refs.fire) {
		refs.fire.offset.x = 0;
		refs.fire.offset.y = 0;
	}
}
