import * as THREE from 'three';
import { BLOCK_H, MAX_Y } from './constants';
import { axialToWorld } from './hex';
import type { BlockMaterialMap, BlockType, BlockUserData } from './types';

export type BlockMesh = THREE.Mesh<THREE.CylinderGeometry, THREE.Material | THREE.Material[]>;

export class World {
	readonly blocks = new Map<string, BlockMesh>();

	constructor(
		private readonly group: THREE.Group,
		private readonly geometry: THREE.CylinderGeometry,
		private readonly materials: BlockMaterialMap
	) {}

	key(q: number, r: number, y: number): string {
		return `${q},${r},${y}`;
	}

	has(q: number, r: number, y: number): boolean {
		return this.blocks.has(this.key(q, r, y));
	}

	get(q: number, r: number, y: number): BlockMesh | null {
		return this.blocks.get(this.key(q, r, y)) ?? null;
	}

	add(q: number, r: number, y: number, typeKey: BlockType): boolean {
		if (y < 0 || y > MAX_Y) return false;
		const k = this.key(q, r, y);
		if (this.blocks.has(k)) return false;

		const pos = axialToWorld(q, r);
		const mesh: BlockMesh = new THREE.Mesh(this.geometry, this.materials[typeKey] ?? this.materials.dirt);
		mesh.position.set(pos.x, (y + 0.5) * BLOCK_H, pos.z);
		mesh.frustumCulled = true;
		(mesh.userData as BlockUserData) = { q, r, y, typeKey, isBlock: true };

		this.group.add(mesh);
		this.blocks.set(k, mesh);
		return true;
	}

	remove(q: number, r: number, y: number): boolean {
		const k = this.key(q, r, y);
		const mesh = this.blocks.get(k);
		if (!mesh) return false;
		this.group.remove(mesh);
		this.blocks.delete(k);
		return true;
	}

	clear(): void {
		for (const mesh of this.blocks.values()) {
			this.group.remove(mesh);
		}
		this.blocks.clear();
	}
}
