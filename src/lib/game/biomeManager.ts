import { BIOME_BY_ID, getBiomeOrDefault } from './biomes';
import { SAVE_KEY } from './constants';
import { generateBiomeTerrain } from './terrain';
import type { BiomeManifest, BlockType, GeneratedBiomeData, SaveState } from './types';
import type { World } from './world';

function hashSeed(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h >>> 0);
}

function makeEmptyEdits(): Record<string, Record<string, BlockType | null>> {
	return {};
}

export class BiomeManager {
	private currentBiomeId = 'grassland-origins';
	private currentBaseBlocks = new Map<string, BlockType>();
	private readonly unlocked = new Set<string>(['grassland-origins']);
	private readonly biomeEdits = new Map<string, Map<string, BlockType | null>>();

	getCurrentBiome(): BiomeManifest {
		return getBiomeOrDefault(this.currentBiomeId);
	}

	getBiome(id: string): BiomeManifest {
		return getBiomeOrDefault(id);
	}

	getCurrentBiomeId(): string {
		return this.currentBiomeId;
	}

	getUnlockedBiomeIds(): string[] {
		return [...this.unlocked];
	}

	isUnlocked(id: string): boolean {
		return this.unlocked.has(id);
	}

	unlock(id: string): void {
		if (!BIOME_BY_ID.has(id)) return;
		this.unlocked.add(id);
	}

	loadIntoWorld(world: World, biomeId: string): { manifest: BiomeManifest; data: GeneratedBiomeData } {
		const manifest = getBiomeOrDefault(biomeId);
		const seed = hashSeed(manifest.id);
		const data = generateBiomeTerrain(manifest, seed);

		world.clear();
		world.beginBatch();
		for (const block of data.blocks) {
			world.add(block.q, block.r, block.y, block.type);
		}
		world.endBatch();

		this.currentBiomeId = manifest.id;
		this.currentBaseBlocks = data.baseBlocks;
		this.applyEditsForCurrentBiome(world);
		return { manifest, data };
	}

	recordEdit(q: number, r: number, y: number, nextType: BlockType | null): void {
		const biomeId = this.currentBiomeId;
		const editMap = this.biomeEdits.get(biomeId) ?? new Map<string, BlockType | null>();
		const k = `${q},${r},${y}`;
		const base = this.currentBaseBlocks.get(k) ?? null;
		if (base === nextType) editMap.delete(k);
		else editMap.set(k, nextType);
		this.biomeEdits.set(biomeId, editMap);
	}

	private applyEditsForCurrentBiome(world: World): void {
		const edits = this.biomeEdits.get(this.currentBiomeId);
		if (!edits) return;
		for (const [k, type] of edits.entries()) {
			const [q, r, y] = k.split(',').map((part) => Number.parseInt(part, 10));
			if (type === null) {
				world.remove(q, r, y);
				continue;
			}
			const existing = world.getType(q, r, y);
			if (existing === type) continue;
			if (existing) world.remove(q, r, y);
			world.add(q, r, y, type);
		}
	}

	loadSave(): string {
		let raw: string | null = null;
		try {
			raw = localStorage.getItem(SAVE_KEY);
		} catch {
			raw = null;
		}
		if (!raw) return this.currentBiomeId;
		let parsed: SaveState | null = null;
		try {
			parsed = JSON.parse(raw) as SaveState;
		} catch {
			parsed = null;
		}
		if (!parsed || typeof parsed !== 'object') return this.currentBiomeId;
		if (!Array.isArray(parsed.unlockedBiomes)) return this.currentBiomeId;

		this.unlocked.clear();
		this.unlocked.add('grassland-origins');
		for (const id of parsed.unlockedBiomes) {
			if (BIOME_BY_ID.has(id)) this.unlocked.add(id);
		}

		this.biomeEdits.clear();
		const saveVersion = Number.isFinite(parsed.version) ? parsed.version : 1;
		for (const [biomeId, edits] of Object.entries(parsed.biomeEdits ?? makeEmptyEdits())) {
			if (!BIOME_BY_ID.has(biomeId)) continue;
			if (saveVersion < 2 && biomeId === 'grassland-origins') continue;
			const m = new Map<string, BlockType | null>();
			for (const [k, val] of Object.entries(edits)) {
				if (val === null || typeof val === 'string') m.set(k, val as BlockType | null);
			}
			if (m.size) this.biomeEdits.set(biomeId, m);
		}

		if (parsed.currentBiomeId && BIOME_BY_ID.has(parsed.currentBiomeId)) {
			this.currentBiomeId = parsed.currentBiomeId;
		}
		return this.currentBiomeId;
	}

	saveCurrentState(currentBiomeId: string): void {
		const editsObj: Record<string, Record<string, BlockType | null>> = {};
		for (const [biomeId, edits] of this.biomeEdits.entries()) {
			if (!edits.size) continue;
			editsObj[biomeId] = {};
			for (const [k, val] of edits.entries()) editsObj[biomeId][k] = val;
		}
		const payload: SaveState = {
			version: 2,
			currentBiomeId,
			unlockedBiomes: [...this.unlocked],
			biomeEdits: editsObj
		};
		try {
			localStorage.setItem(SAVE_KEY, JSON.stringify(payload));
		} catch {
			// ignore storage errors
		}
	}
}
