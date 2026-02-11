import * as THREE from 'three';
import { BLOCK_H, MAX_Y, SOLID_BLOCKS } from './constants';
import { axialToWorld } from './hex';
import type { BlockMaterialMap, BlockType, BlockUserData } from './types';

export type BlockMesh = THREE.Mesh<THREE.CylinderGeometry, THREE.Material | THREE.Material[]>;

export class World {
	readonly blocks = new Map<string, BlockMesh>();
	private readonly columnData = new Map<string, Map<number, BlockType>>();

	constructor(
		private readonly group: THREE.Group,
		private readonly geometry: THREE.CylinderGeometry,
		private readonly materials: BlockMaterialMap
	) {}

	key(q: number, r: number, y: number): string {
		return `${q},${r},${y}`;
	}

	columnKey(q: number, r: number): string {
		return `${q},${r}`;
	}

	has(q: number, r: number, y: number): boolean {
		return this.blocks.has(this.key(q, r, y));
	}

	get(q: number, r: number, y: number): BlockMesh | null {
		return this.blocks.get(this.key(q, r, y)) ?? null;
	}

	getType(q: number, r: number, y: number): BlockType | null {
		const mesh = this.get(q, r, y);
		if (!mesh) return null;
		const ud = mesh.userData as BlockUserData;
		return ud.typeKey;
	}

	getTopAnyY(q: number, r: number): number {
		const col = this.columnData.get(this.columnKey(q, r));
		if (!col || col.size === 0) return -1;
		let top = -1;
		for (const y of col.keys()) top = Math.max(top, y);
		return top;
	}

	getTopSolidY(q: number, r: number): number {
		const col = this.columnData.get(this.columnKey(q, r));
		if (!col || col.size === 0) return -1;
		let top = -1;
		for (const [y, type] of col.entries()) {
			if (!SOLID_BLOCKS.has(type)) continue;
			top = Math.max(top, y);
		}
		return top;
	}

	getGroundY(q: number, r: number): number {
		return this.getTopSolidY(q, r) + BLOCK_H;
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

		const ck = this.columnKey(q, r);
		const col = this.columnData.get(ck) ?? new Map<number, BlockType>();
		col.set(y, typeKey);
		this.columnData.set(ck, col);

		return true;
	}

	remove(q: number, r: number, y: number): boolean {
		const k = this.key(q, r, y);
		const mesh = this.blocks.get(k);
		if (!mesh) return false;

		this.group.remove(mesh);
		this.blocks.delete(k);

		const ck = this.columnKey(q, r);
		const col = this.columnData.get(ck);
		if (col) {
			col.delete(y);
			if (!col.size) this.columnData.delete(ck);
		}
		return true;
	}

	clear(): void {
		for (const mesh of this.blocks.values()) {
			this.group.remove(mesh);
		}
		this.blocks.clear();
		this.columnData.clear();
	}
}
