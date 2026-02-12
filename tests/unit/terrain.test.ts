import { describe, expect, it } from 'vitest';
import { getBiomeOrDefault } from '../../src/lib/game/biomes';
import { generateBiomeTerrain } from '../../src/lib/game/terrain';

describe('terrain generation', () => {
	it('lays bedrock at y=0 in every generated column and creates portal anchors', () => {
		const biome = getBiomeOrDefault('san-francisco-bay');
		const data = generateBiomeTerrain(biome, 424242);

		const columns = new Set<string>();
		for (const [k] of data.baseBlocks.entries()) {
			const [q, r] = k.split(',');
			columns.add(`${q},${r}`);
		}

		for (const col of columns) {
			expect(data.baseBlocks.get(`${col},0`)).toBe('bedrock');
		}
		expect(data.portalAnchors.length).toBe(biome.portalLinks.length);
		expect(data.npcSpawns.length).toBeGreaterThan(0);
	});

	it('includes water blocks in a coastal biome', () => {
		const biome = getBiomeOrDefault('new-york-harbor');
		const data = generateBiomeTerrain(biome, 12345);
		const hasWater = [...data.baseBlocks.values()].some((type) => type === 'water');
		expect(hasWater).toBe(true);
	});

	it('keeps Stonehenge stones anchored near terrain (no major floating clusters)', () => {
		const biome = getBiomeOrDefault('grassland-origins');
		const data = generateBiomeTerrain(biome, 777);
		const blocks = data.blocks;
		const byKey = new Map<string, string>();
		for (const b of blocks) byKey.set(`${b.q},${b.r},${b.y}`, b.type);

		const stoneColumns = new Set<string>();
		let unsupportedStoneColumns = 0;
		for (const b of blocks) {
			if (b.type !== 'stone') continue;
			const ck = `${b.q},${b.r}`;
			if (stoneColumns.has(ck)) continue;
			stoneColumns.add(ck);

			let minStoneY = Number.POSITIVE_INFINITY;
			for (let y = 1; y <= 80; y++) {
				if (byKey.get(`${b.q},${b.r},${y}`) === 'stone') {
					minStoneY = y;
					break;
				}
			}
			if (!Number.isFinite(minStoneY)) continue;
			if (!byKey.has(`${b.q},${b.r},${minStoneY - 1}`)) unsupportedStoneColumns++;
		}

		expect(stoneColumns.size).toBeGreaterThan(120);
		expect(unsupportedStoneColumns).toBeLessThanOrEqual(14);
	});
});
