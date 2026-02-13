import * as THREE from 'three';
import { BLOCK_H, MAX_Y, SOLID_BLOCKS } from './constants';
import { axialToWorld, hexDist } from './hex';
import type { BlockMaterialMap, BlockType, BlockUserData } from './types';

export type BlockMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

function createFireCrossGeometry(): THREE.BufferGeometry {
	const halfWidth = 0.68;
	const halfHeight = 0.76;
	const diagonal = Math.SQRT1_2 * halfWidth;
	const planes: Array<{ x: number; z: number }> = [
		{ x: diagonal, z: diagonal },
		{ x: diagonal, z: -diagonal }
	];
	const pos: number[] = [];
	const uv: number[] = [];
	const idx: number[] = [];
	let v = 0;

	for (const p of planes) {
		pos.push(
			-p.x, -halfHeight, -p.z,
			p.x, -halfHeight, p.z,
			p.x, halfHeight, p.z,
			-p.x, halfHeight, -p.z
		);
		uv.push(0, 0, 1, 0, 1, 1, 0, 1);
		idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
		v += 4;
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	geometry.setIndex(idx);
	geometry.computeVertexNormals();
	return geometry;
}

const FIRE_CROSS_GEOMETRY = createFireCrossGeometry();

export class World {
	readonly blocks = new Map<string, BlockMesh>();
	private readonly columnData = new Map<string, Map<number, BlockType>>();
	private batchDepth = 0;
	private readonly dirtyVisibility = new Set<string>();
	private renderCenterQ = 0;
	private renderCenterR = 0;
	private renderRadius = Number.POSITIVE_INFINITY;

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
		const col = this.columnData.get(this.columnKey(q, r));
		return col?.has(y) ?? false;
	}

	get(q: number, r: number, y: number): BlockMesh | null {
		return this.blocks.get(this.key(q, r, y)) ?? null;
	}

	getType(q: number, r: number, y: number): BlockType | null {
		const col = this.columnData.get(this.columnKey(q, r));
		return col?.get(y) ?? null;
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

	setRenderWindow(centerQ: number, centerR: number, radius: number): void {
		const nextRadius =
			Number.isFinite(radius) && radius >= 0 ? Math.floor(radius) : Number.POSITIVE_INFINITY;
		if (
			nextRadius === this.renderRadius &&
			centerQ === this.renderCenterQ &&
			centerR === this.renderCenterR
		) {
			return;
		}
		this.renderCenterQ = centerQ;
		this.renderCenterR = centerR;
		this.renderRadius = nextRadius;
		this.rebuildRenderWindow();
	}

	beginBatch(): void {
		this.batchDepth++;
	}

	endBatch(): void {
		if (this.batchDepth <= 0) return;
		this.batchDepth--;
		if (this.batchDepth === 0) this.flushVisibility();
	}

	add(q: number, r: number, y: number, typeKey: BlockType): boolean {
		if (y < 0 || y > MAX_Y) return false;
		const ck = this.columnKey(q, r);
		const col = this.columnData.get(ck) ?? new Map<number, BlockType>();
		if (col.has(y)) return false;
		col.set(y, typeKey);
		this.columnData.set(ck, col);
		this.markVisibilityAround(q, r, y);

		return true;
	}

	remove(q: number, r: number, y: number): boolean {
		const ck = this.columnKey(q, r);
		const col = this.columnData.get(ck);
		if (!col || !col.has(y)) return false;
		col.delete(y);
		if (!col.size) this.columnData.delete(ck);

		const k = this.key(q, r, y);
		const mesh = this.blocks.get(k);
		if (mesh) {
			this.group.remove(mesh);
			this.blocks.delete(k);
		}
		this.markVisibilityAround(q, r, y);
		return true;
	}

	clear(): void {
		for (const mesh of this.blocks.values()) {
			this.group.remove(mesh);
		}
		this.blocks.clear();
		this.columnData.clear();
		this.dirtyVisibility.clear();
		this.batchDepth = 0;
	}

	private markVisibilityAround(q: number, r: number, y: number): void {
		this.markVisibilityDirty(q, r, y);
		this.markVisibilityDirty(q, r, y + 1);
		this.markVisibilityDirty(q, r, y - 1);
		const sideOffsets: Array<[number, number]> = [
			[1, 0],
			[1, -1],
			[0, -1],
			[-1, 0],
			[-1, 1],
			[0, 1]
		];
		for (const [dq, dr] of sideOffsets) {
			this.markVisibilityDirty(q + dq, r + dr, y);
		}
	}

	private markVisibilityDirty(q: number, r: number, y: number): void {
		if (y < 0 || y > MAX_Y) return;
		if (!this.isInRenderWindow(q, r, 1)) {
			if (this.batchDepth > 0) return;
			const existing = this.blocks.get(this.key(q, r, y));
			if (existing) {
				this.group.remove(existing);
				this.blocks.delete(this.key(q, r, y));
			}
			return;
		}
		const k = this.key(q, r, y);
		if (this.batchDepth > 0) {
			this.dirtyVisibility.add(k);
			return;
		}
		this.syncRenderForCell(q, r, y);
	}

	private flushVisibility(): void {
		if (!this.dirtyVisibility.size) return;
		const pending = [...this.dirtyVisibility];
		this.dirtyVisibility.clear();
		for (const k of pending) {
			const [q, r, y] = k.split(',').map((part) => Number.parseInt(part, 10));
			this.syncRenderForCell(q, r, y);
		}
	}

	private syncRenderForCell(q: number, r: number, y: number): void {
		const k = this.key(q, r, y);
		if (!this.isInRenderWindow(q, r, 1)) {
			const outsideMesh = this.blocks.get(k);
			if (outsideMesh) {
				this.group.remove(outsideMesh);
				this.blocks.delete(k);
			}
			return;
		}
		const type = this.getType(q, r, y);
		const current = this.blocks.get(k);
		if (!type) {
			if (current) {
				this.group.remove(current);
				this.blocks.delete(k);
			}
			return;
		}

		const shouldRender = this.isCellVisible(q, r, y, type);
		if (!shouldRender) {
			if (current) {
				this.group.remove(current);
				this.blocks.delete(k);
			}
			return;
		}
		if (current) return;

		const pos = axialToWorld(q, r);
		const geometry = type === 'fire' ? FIRE_CROSS_GEOMETRY : this.geometry;
		const material =
			type === 'fire'
				? (this.materials.fire[0] as THREE.Material)
				: (this.materials[type] ?? this.materials.dirt);
		const mesh: BlockMesh = new THREE.Mesh(geometry, material);
		const yOffset = type === 'fire' ? 0.26 : 0;
		mesh.position.set(pos.x, (y + 0.5 + yOffset) * BLOCK_H, pos.z);
		mesh.frustumCulled = true;
		(mesh.userData as BlockUserData) = { q, r, y, typeKey: type, isBlock: true };
		this.group.add(mesh);
		this.blocks.set(k, mesh);
	}

	private isCellVisible(q: number, r: number, y: number, type: BlockType): boolean {
		if (type === 'fire') return true;
		const neighbors: Array<[number, number, number]> = [
			[q, r, y + 1],
			[q, r, y - 1],
			[q + 1, r, y],
			[q + 1, r - 1, y],
			[q, r - 1, y],
			[q - 1, r, y],
			[q - 1, r + 1, y],
			[q, r + 1, y]
		];
		for (const [nq, nr, ny] of neighbors) {
			if (!this.isFaceOccluded(type, this.getType(nq, nr, ny))) return true;
		}
		return false;
	}

	private isFaceOccluded(type: BlockType, neighbor: BlockType | null): boolean {
		if (!neighbor) return false;
		if (type === 'water' && (neighbor === 'water' || neighbor === 'ice')) return true;
		if (type === 'ice' && (neighbor === 'water' || neighbor === 'ice')) return true;
		if (type === 'fire') return neighbor === 'fire';
		if (SOLID_BLOCKS.has(type) && SOLID_BLOCKS.has(neighbor)) return true;
		return false;
	}

	private isInRenderWindow(q: number, r: number, margin = 0): boolean {
		if (!Number.isFinite(this.renderRadius)) return true;
		return hexDist(this.renderCenterQ, this.renderCenterR, q, r) <= this.renderRadius + margin;
	}

	private rebuildRenderWindow(): void {
		if (!this.blocks.size && !this.columnData.size) return;

		for (const [k, mesh] of this.blocks.entries()) {
			const ud = mesh.userData as BlockUserData;
			if (this.isInRenderWindow(ud.q, ud.r, 1)) continue;
			this.group.remove(mesh);
			this.blocks.delete(k);
		}

		if (!Number.isFinite(this.renderRadius)) {
			for (const [ck, col] of this.columnData.entries()) {
				const [q, r] = ck.split(',').map((part) => Number.parseInt(part, 10));
				for (const y of col.keys()) this.syncRenderForCell(q, r, y);
			}
			return;
		}

		this.forEachCellInDisc(this.renderCenterQ, this.renderCenterR, this.renderRadius + 1, (q, r) => {
			const col = this.columnData.get(this.columnKey(q, r));
			if (!col) return;
			for (const y of col.keys()) this.syncRenderForCell(q, r, y);
		});
	}

	private forEachCellInDisc(
		centerQ: number,
		centerR: number,
		radius: number,
		cb: (q: number, r: number) => void
	): void {
		const r = Math.max(0, Math.floor(radius));
		for (let dq = -r; dq <= r; dq++) {
			const drMin = Math.max(-r, -dq - r);
			const drMax = Math.min(r, -dq + r);
			for (let dr = drMin; dr <= drMax; dr++) cb(centerQ + dq, centerR + dr);
		}
	}
}
