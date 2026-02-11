import { describe, expect, it } from 'vitest';
import { BIOMES, BIOME_BY_ID } from '../../src/lib/game/biomes';

describe('biome manifest coverage', () => {
	it('includes London Westminster and San Francisco Bay biomes', () => {
		expect(BIOME_BY_ID.has('london-westminster')).toBe(true);
		expect(BIOME_BY_ID.has('san-francisco-bay')).toBe(true);
	});

	it('defines quizzes and portal links for each biome', () => {
		for (const biome of BIOMES) {
			expect(biome.portalLinks.length).toBeGreaterThan(0);
			expect(biome.quizzes.length).toBeGreaterThanOrEqual(3);
			expect(biome.yearLabel.length).toBeGreaterThan(0);
			expect(biome.place.length).toBeGreaterThan(0);
		}
	});
});
