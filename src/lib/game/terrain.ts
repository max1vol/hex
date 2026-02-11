import { SOLID_BLOCKS, WORLD_MIN_RADIUS } from './constants';
import { fbm, hash2, hexDist } from './hex';
import type {
	BiomeManifest,
	BlockPlacement,
	BlockType,
	GeneratedBiomeData,
	PortalLink,
	AxialCoord
} from './types';

const ANCHOR_VECTORS: Record<PortalLink['anchor'], AxialCoord> = {
	north: { q: 0, r: -1 },
	south: { q: 0, r: 1 },
	east: { q: 1, r: 0 },
	west: { q: -1, r: 0 },
	northEast: { q: 1, r: -1 },
	southWest: { q: -1, r: 1 }
};

function key(q: number, r: number, y: number): string {
	return `${q},${r},${y}`;
}

function columnKey(q: number, r: number): string {
	return `${q},${r}`;
}

interface BuildCtx {
	setBlock: (q: number, r: number, y: number, type: BlockType) => void;
	getTopSolidY: (q: number, r: number) => number;
	getTopAnyY: (q: number, r: number) => number;
	manifest: BiomeManifest;
}

function fillHexDisc(
	ctx: BuildCtx,
	centerQ: number,
	centerR: number,
	radius: number,
	y: number,
	type: BlockType
): void {
	for (let q = centerQ - radius; q <= centerQ + radius; q++) {
		for (let r = centerR - radius; r <= centerR + radius; r++) {
			if (hexDist(centerQ, centerR, q, r) > radius) continue;
			ctx.setBlock(q, r, y, type);
		}
	}
}

function fillHexColumn(
	ctx: BuildCtx,
	centerQ: number,
	centerR: number,
	radius: number,
	y0: number,
	y1: number,
	type: BlockType
): void {
	for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
		fillHexDisc(ctx, centerQ, centerR, radius, y, type);
	}
}

function addGrasslandLandmarks(ctx: BuildCtx): void {
	const yBase = Math.max(2, ctx.getTopSolidY(0, 0));
	for (let i = 0; i < 6; i++) {
		const angle = (i / 6) * Math.PI * 2;
		const q = Math.round(Math.cos(angle) * 6);
		const r = Math.round(Math.sin(angle) * 6);
		const y = Math.max(yBase, ctx.getTopSolidY(q, r));
		fillHexColumn(ctx, q, r, 0, y + 1, y + 4, 'stone');
	}
	fillHexDisc(ctx, 0, 0, 1, yBase + 1, 'stone');
}

function addEgyptLandmarks(ctx: BuildCtx): void {
	const baseY = Math.max(2, ctx.getTopSolidY(0, 0));
	for (let y = 0; y < 14; y++) {
		const radius = Math.max(1, 10 - Math.floor(y * 0.7));
		fillHexDisc(ctx, 0, 0, radius, baseY + 1 + y, y < 3 ? 'stone' : 'sand');
	}

	for (let q = -6; q <= 6; q++) {
		for (let r = -3; r <= 3; r++) {
			if (Math.abs(q) + Math.abs(r) > 8) continue;
			const y = baseY + 1;
			ctx.setBlock(q + 15, r + 3, y, 'sand');
			ctx.setBlock(q + 15, r + 3, y + 1, 'sand');
		}
	}
	fillHexColumn(ctx, 17, 3, 1, baseY + 2, baseY + 4, 'stone');
}

function addIceAgeLandmarks(ctx: BuildCtx): void {
	for (let i = -9; i <= 9; i++) {
		const q = i;
		const r = Math.round(Math.sin(i * 0.45) * 4);
		const y = Math.max(3, ctx.getTopSolidY(q, r));
		fillHexColumn(ctx, q, r, 1, y + 1, y + 8, i % 2 === 0 ? 'ice' : 'snow');
	}
	fillHexColumn(ctx, -14, 5, 2, 5, 10, 'snow');
	fillHexColumn(ctx, -14, 6, 1, 5, 9, 'snow');
}

function addRomeLandmarks(ctx: BuildCtx): void {
	const baseY = Math.max(2, ctx.getTopSolidY(0, 0));
	for (let q = -12; q <= 12; q++) {
		for (let r = -12; r <= 12; r++) {
			const d = hexDist(0, 0, q, r);
			if (d < 6 || d > 9) continue;
			for (let y = baseY + 1; y <= baseY + 7; y++) {
				if (y <= baseY + 3 || ((q + r + y) & 1) === 0) ctx.setBlock(q, r, y, 'brick');
			}
		}
	}
	fillHexDisc(ctx, 0, 0, 5, baseY + 1, 'sand');
	for (let q = -14; q <= 14; q++) {
		ctx.setBlock(q, -13, baseY + 1, 'stone');
		ctx.setBlock(q, -12, baseY + 1, 'stone');
	}
}

function addParisLandmarks(ctx: BuildCtx): void {
	const baseY = Math.max(2, ctx.getTopSolidY(0, 0));
	for (const leg of [
		{ q: -3, r: 0 },
		{ q: 3, r: 0 },
		{ q: 0, r: -3 },
		{ q: 0, r: 3 }
	]) {
		fillHexColumn(ctx, leg.q, leg.r, 0, baseY + 1, baseY + 11, 'metal');
	}
	for (let y = 6; y <= 18; y++) {
		const radius = Math.max(0, 5 - Math.floor((y - 6) / 3));
		fillHexDisc(ctx, 0, 0, radius, baseY + y, 'metal');
	}
	for (let q = -14; q <= 14; q++) {
		ctx.setBlock(q, 10, baseY + 1, 'asphalt');
		ctx.setBlock(q, 11, baseY + 1, 'asphalt');
	}
}

function addNewYorkLandmarks(ctx: BuildCtx): void {
	const baseY = Math.max(2, ctx.getTopSolidY(0, 0));
	fillHexColumn(ctx, 0, 0, 3, baseY + 1, baseY + 4, 'stone');
	fillHexColumn(ctx, 0, 0, 2, baseY + 5, baseY + 11, 'brick');
	fillHexColumn(ctx, 0, 0, 1, baseY + 12, baseY + 17, 'metal');
	fillHexColumn(ctx, 0, 0, 0, baseY + 18, baseY + 20, 'metal');
	fillHexDisc(ctx, 0, 0, 0, baseY + 21, 'art');

	for (let i = -12; i <= 12; i++) {
		ctx.setBlock(i, -9, baseY + 1, 'asphalt');
		if ((i & 1) === 0) ctx.setBlock(i, -10, baseY + 1, 'metal');
	}
}

function addLondonLandmarks(ctx: BuildCtx): void {
	const baseY = Math.max(2, ctx.getTopSolidY(0, 0));
	for (let q = -15; q <= 15; q++) {
		for (let r = -3; r <= 3; r++) {
			for (let y = baseY + 1; y <= baseY + 6; y++) {
				if (Math.abs(q) === 15 || Math.abs(r) === 3 || y <= baseY + 2) ctx.setBlock(q, r, y, 'brick');
			}
		}
	}
	fillHexColumn(ctx, 12, 0, 1, baseY + 1, baseY + 15, 'stone');
	fillHexColumn(ctx, 12, 0, 0, baseY + 16, baseY + 19, 'metal');
	fillHexDisc(ctx, 12, 0, 0, baseY + 20, 'art');

	for (let q = -18; q <= 18; q++) {
		ctx.setBlock(q, 6, baseY + 1, 'asphalt');
		if (q % 4 === 0) ctx.setBlock(q, 7, baseY + 1, 'metal');
	}
}

function addSanFranciscoLandmarks(ctx: BuildCtx): void {
	const baseY = Math.max(2, ctx.getTopSolidY(-20, 0));
	fillHexColumn(ctx, -20, 0, 1, baseY + 1, baseY + 18, 'brick');
	fillHexColumn(ctx, 20, 0, 1, baseY + 1, baseY + 18, 'brick');

	for (let q = -20; q <= 20; q++) {
		const y = baseY + 10 + Math.floor(Math.sin((q / 20) * Math.PI) * 3);
		ctx.setBlock(q, 0, y, 'metal');
		ctx.setBlock(q, 1, y, 'metal');
		if ((q + 20) % 4 === 0) {
			for (let k = 0; k < 7; k++) {
				ctx.setBlock(q, 0, y - 1 - k, 'metal');
			}
		}
	}

	for (let q = -10; q <= 10; q++) {
		const streetY = Math.max(ctx.getTopSolidY(q, 12), baseY + 1);
		ctx.setBlock(q, 12, streetY + 1, 'asphalt');
		ctx.setBlock(q, 13, streetY + 1, 'asphalt');
		if (q % 3 === 0) ctx.setBlock(q, 11, streetY + 2, 'art');
	}
	for (let q = -8; q <= 8; q++) {
		const streetY = Math.max(ctx.getTopSolidY(q, 18), baseY + 3);
		ctx.setBlock(q, 18, streetY + 1, 'asphalt');
		if (q % 2 === 0) ctx.setBlock(q, 17, streetY + 2, 'art');
	}
}

function applyLandmarks(ctx: BuildCtx): void {
	switch (ctx.manifest.id) {
		case 'grassland-origins':
			addGrasslandLandmarks(ctx);
			return;
		case 'ancient-egypt':
			addEgyptLandmarks(ctx);
			return;
		case 'ice-age':
			addIceAgeLandmarks(ctx);
			return;
		case 'ancient-rome':
			addRomeLandmarks(ctx);
			return;
		case 'paris-industrial':
			addParisLandmarks(ctx);
			return;
		case 'new-york-harbor':
			addNewYorkLandmarks(ctx);
			return;
		case 'london-westminster':
			addLondonLandmarks(ctx);
			return;
		case 'san-francisco-bay':
			addSanFranciscoLandmarks(ctx);
			return;
	}
}

export function generateBiomeTerrain(manifest: BiomeManifest, seed: number): GeneratedBiomeData {
	const radius = Math.max(WORLD_MIN_RADIUS, manifest.radius);
	const blockMap = new Map<string, BlockType>();
	const topSolidByColumn = new Map<string, number>();
	const topAnyByColumn = new Map<string, number>();
	const npcSpawns: AxialCoord[] = [];

	const setBlock = (q: number, r: number, y: number, type: BlockType): void => {
		if (hexDist(0, 0, q, r) > radius) return;
		if (y < 0) return;
		const k = key(q, r, y);
		blockMap.set(k, type);

		const ck = columnKey(q, r);
		topAnyByColumn.set(ck, Math.max(y, topAnyByColumn.get(ck) ?? -1));
		if (SOLID_BLOCKS.has(type)) {
			topSolidByColumn.set(ck, Math.max(y, topSolidByColumn.get(ck) ?? -1));
		}
	};

	const getTopSolidY = (q: number, r: number): number => topSolidByColumn.get(columnKey(q, r)) ?? 0;
	const getTopAnyY = (q: number, r: number): number => topAnyByColumn.get(columnKey(q, r)) ?? 0;

	const seedQ = Math.floor((seed % 10000) - 5000);
	const seedR = Math.floor(((seed / 11) % 10000) - 5000);

	for (let q = -radius; q <= radius; q++) {
		for (let r = -radius; r <= radius; r++) {
			const d = hexDist(0, 0, q, r);
			if (d > radius) continue;

			const edgeFalloff = Math.max(0, 1 - d / (radius + 0.001));
			const n = fbm((q + seedQ) * manifest.noiseScale, (r + seedR) * manifest.noiseScale);
			const ridge = Math.pow(Math.abs(n - 0.5) * 2, 0.7);
			const riverNoise = fbm((q + seedQ) * 0.33, (r + seedR) * 0.33);
			const riverCarve = Math.abs(riverNoise - 0.5) < 0.038 ? 2.8 : 0;
			let h = Math.floor(2 + edgeFalloff * (manifest.heightBoost + 8 * n - riverCarve - ridge * 2.4));
			h = Math.max(1, Math.min(h, 34));

			const shoreBand = edgeFalloff < 0.25 || Math.abs(riverNoise - 0.5) < 0.065;

			setBlock(q, r, 0, manifest.blockSet.bedrock);
			for (let y = 1; y <= h; y++) {
				let type: BlockType;
				if (y < h - 4) type = manifest.blockSet.deep;
				else if (y < h - 1) type = manifest.blockSet.subsurface;
				else type = shoreBand && h <= manifest.seaLevel + 1 ? manifest.blockSet.shore : manifest.blockSet.surface;
				setBlock(q, r, y, type);
			}

			if (h < manifest.seaLevel) {
				setBlock(q, r, h, manifest.blockSet.shore);
				for (let y = h + 1; y <= manifest.seaLevel; y++) {
					setBlock(q, r, y, manifest.blockSet.water);
				}
			}

			if (hash2(q + seedQ * 1.7, r + seedR * 1.3) > 0.988) {
				npcSpawns.push({ q, r });
			}
		}
	}

	const ctx: BuildCtx = {
		setBlock,
		getTopSolidY,
		getTopAnyY,
		manifest
	};
	applyLandmarks(ctx);

	const portalAnchors: GeneratedBiomeData['portalAnchors'] = [];
	for (const link of manifest.portalLinks) {
		const vec = ANCHOR_VECTORS[link.anchor];
		let q = vec.q * (radius - 8);
		let r = vec.r * (radius - 8);

		const top = getTopSolidY(q, r);
		const padY = Math.max(manifest.seaLevel + 1, top + 1);
		for (let pq = q - 2; pq <= q + 2; pq++) {
			for (let pr = r - 2; pr <= r + 2; pr++) {
				if (hexDist(q, r, pq, pr) > 2) continue;
				setBlock(pq, pr, padY - 1, manifest.blockSet.deep);
				setBlock(pq, pr, padY, manifest.blockSet.shore);
			}
		}

		q = Math.round(q);
		r = Math.round(r);
		portalAnchors.push({ q, r, link });
	}

	if (!npcSpawns.length) npcSpawns.push({ q: 0, r: 0 }, { q: 5, r: -2 }, { q: -6, r: 4 });

	const blocks: BlockPlacement[] = [];
	for (const [k, type] of blockMap.entries()) {
		const [q, r, y] = k.split(',').map((part) => Number.parseInt(part, 10));
		blocks.push({ q, r, y, type });
	}

	const baseBlocks = new Map<string, BlockType>(blockMap);
	return {
		blocks,
		baseBlocks,
		npcSpawns,
		portalAnchors
	};
}
