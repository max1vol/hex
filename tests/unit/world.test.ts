import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createBlockMaterials } from '../../src/lib/game/blocks';
import { World } from '../../src/lib/game/world';

describe('World render window', () => {
	it('keeps full block data while culling meshes outside render window', () => {
		const group = new THREE.Group();
		const geo = new THREE.CylinderGeometry(1, 1, 1, 6, 1, false);
		const world = new World(group, geo, createBlockMaterials());

		world.setRenderWindow(0, 0, 2);
		world.beginBatch();
		world.add(0, 0, 1, 'grass');
		world.add(10, 0, 1, 'grass');
		world.endBatch();

		expect(world.has(0, 0, 1)).toBe(true);
		expect(world.has(10, 0, 1)).toBe(true);
		expect(world.get(0, 0, 1)).not.toBeNull();
		expect(world.get(10, 0, 1)).toBeNull();

		world.setRenderWindow(10, 0, 2);
		expect(world.has(0, 0, 1)).toBe(true);
		expect(world.has(10, 0, 1)).toBe(true);
		expect(world.get(0, 0, 1)).toBeNull();
		expect(world.get(10, 0, 1)).not.toBeNull();

		geo.dispose();
	});
});
