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
});
