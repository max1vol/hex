import { MAX_Y, SOLID_BLOCKS, WORLD_MIN_RADIUS } from './constants';
import { axialRound, axialToWorld, fbm, hash2, hexDist, worldToAxial } from './hex';
import { STONEHENGE_PLAN, STONEHENGE_PLAN_META } from './stonehengePlan.generated';
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

const STONEHENGE_PLAN_SCALE = 1.35;

const AXIAL_DIRECTIONS: AxialCoord[] = [
	{ q: 1, r: 0 },
	{ q: 1, r: -1 },
	{ q: 0, r: -1 },
	{ q: -1, r: 0 },
	{ q: -1, r: 1 },
	{ q: 0, r: 1 }
];

function key(q: number, r: number, y: number): string {
	return `${q},${r},${y}`;
}

function columnKey(q: number, r: number): string {
	return `${q},${r}`;
}

interface BuildCtx {
	setBlock: (q: number, r: number, y: number, type: BlockType) => void;
	removeBlock: (q: number, r: number, y: number) => void;
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

function smoothStep01(t: number): number {
	const x = Math.max(0, Math.min(1, t));
	return x * x * (3 - 2 * x);
}

function axialLineCells(q0: number, r0: number, q1: number, r1: number): Array<{ q: number; r: number }> {
	const steps = Math.max(Math.abs(q1 - q0), Math.abs(r1 - r0), Math.abs((q1 + r1) - (q0 + r0)));
	const out: Array<{ q: number; r: number }> = [];
	const seen = new Set<string>();
	for (let i = 0; i <= Math.max(1, steps); i++) {
		const t = steps === 0 ? 0 : i / steps;
		const q = q0 + (q1 - q0) * t;
		const r = r0 + (r1 - r0) * t;
		const a = axialRound(q, r);
		const k = `${a.q},${a.r}`;
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(a);
	}
	return out;
}

function paintTrail(
	ctx: BuildCtx,
	q0: number,
	r0: number,
	q1: number,
	r1: number,
	width: number,
	type: BlockType,
	resolveY?: (q: number, r: number) => number
): void {
	for (const cell of axialLineCells(q0, r0, q1, r1)) {
		const y = resolveY ? resolveY(cell.q, cell.r) : ctx.getTopSolidY(cell.q, cell.r) + 1;
		fillHexDisc(ctx, cell.q, cell.r, width, y, type);
	}
}

function upliftColumnTo(
	ctx: BuildCtx,
	q: number,
	r: number,
	targetTopY: number,
	subsurface: BlockType,
	surface: BlockType
): void {
	const top = ctx.getTopSolidY(q, r);
	if (top >= targetTopY) return;
	for (let y = top + 1; y < targetTopY; y++) {
		ctx.setBlock(q, r, y, subsurface);
	}
	ctx.setBlock(q, r, targetTopY, surface);
}

function trimColumnToTop(ctx: BuildCtx, q: number, r: number, targetTopY: number): void {
	const cappedTop = Math.max(1, targetTopY);
	for (let y = ctx.getTopAnyY(q, r); y > cappedTop; y--) {
		ctx.removeBlock(q, r, y);
	}
}

function setColumnTop(
	ctx: BuildCtx,
	q: number,
	r: number,
	targetTopY: number,
	subsurface: BlockType,
	surface: BlockType
): void {
	const cappedTop = Math.max(1, targetTopY);
	trimColumnToTop(ctx, q, r, cappedTop);
	upliftColumnTo(ctx, q, r, cappedTop, subsurface, surface);
	ctx.setBlock(q, r, cappedTop, surface);
}

function circularCells(radius: number): Array<{ q: number; r: number }> {
	const cells: Array<{ q: number; r: number }> = [];
	for (let q = -radius; q <= radius; q++) {
		for (let r = -radius; r <= radius; r++) {
			if (hexDist(0, 0, q, r) > radius) continue;
			cells.push({ q, r });
		}
	}
	return cells;
}

function ringCells(radius: number, count: number, phase = 0): Array<{ q: number; r: number }> {
	const out: Array<{ q: number; r: number }> = [];
	const seen = new Set<string>();
	for (let i = 0; i < count; i++) {
		const a = phase + (i / count) * Math.PI * 2;
		const q = Math.round(Math.cos(a) * radius);
		const r = Math.round(Math.sin(a) * radius);
		const k = `${q},${r}`;
		if (seen.has(k)) continue;
		seen.add(k);
		out.push({ q, r });
	}
	return out;
}

function cellSet(cells: ReadonlyArray<{ q: number; r: number }>): Set<string> {
	const set = new Set<string>();
	for (const c of cells) set.add(`${c.q},${c.r}`);
	return set;
}

function isInCellSet(cells: Set<string>, q: number, r: number): boolean {
	return cells.has(`${q},${r}`);
}

function scalePlanCells(cells: ReadonlyArray<AxialCoord>, scale: number): AxialCoord[] {
	const out: AxialCoord[] = [];
	const seen = new Set<string>();
	for (const c of cells) {
		const w = axialToWorld(c.q, c.r);
		const a = worldToAxial(w.x * scale, w.z * scale);
		const k = `${a.q},${a.r}`;
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(a);
	}
	return out;
}

function addStonehengeLandmarks(ctx: BuildCtx): void {
	const scaledPathCells = scalePlanCells(STONEHENGE_PLAN.pathCells, STONEHENGE_PLAN_SCALE);
	const scaledWaterCells = scalePlanCells(STONEHENGE_PLAN.waterCells, STONEHENGE_PLAN_SCALE);
	const scaledHutCenters = scalePlanCells(STONEHENGE_PLAN.hutCenters, STONEHENGE_PLAN_SCALE);
	const scaledHearthCenters = scalePlanCells(STONEHENGE_PLAN.hearthCenters, STONEHENGE_PLAN_SCALE);
	const scaledStoneMaskCells = scalePlanCells(STONEHENGE_PLAN.stoneMaskCells, STONEHENGE_PLAN_SCALE * 1.08);

	const plazaY = Math.max(6, ctx.getTopSolidY(0, 0));
	const featureRadius = Math.max(28, Math.round(STONEHENGE_PLAN_META.worldFeatureRadius * STONEHENGE_PLAN_SCALE));
	const flattenRadius = featureRadius + 4;
	const waterLevel = plazaY - 1;

	const pathMask = cellSet(scaledPathCells);
	const waterMask = cellSet(scaledWaterCells);
	const hutCenterMask = cellSet(scaledHutCenters);

	// Terrain first: flatten the ceremonial plain, carve ditch/bank rings, and apply map water.
	for (const cell of circularCells(flattenRadius)) {
		const d = hexDist(0, 0, cell.q, cell.r);
		let target = plazaY;
		if (d > 14.7 && d < 16.8) target -= 2; // ditch ring
		if (d > 17.8 && d < 19.8) target += 1; // bank ring
		if (d > 22) target += Math.min(3, Math.floor((d - 22) / 5)); // gentle rise outside ritual core
		if (isInCellSet(pathMask, cell.q, cell.r)) target = Math.min(target, plazaY);

		if (isInCellSet(waterMask, cell.q, cell.r)) {
			target = Math.min(target, waterLevel - 2);
			setColumnTop(ctx, cell.q, cell.r, target, 'dirt', 'sand');
			for (let y = target + 1; y <= waterLevel; y++) {
				ctx.setBlock(cell.q, cell.r, y, 'water');
			}
			continue;
		}

		const surface: BlockType = d > 20 && d < 24 ? 'dirt' : 'grass';
		setColumnTop(ctx, cell.q, cell.r, target, 'dirt', surface);
	}

	// Widen path mask to produce readable processional routes in top-down debug output.
	const widenedPathCells: Array<{ q: number; r: number }> = [];
	const widenedSet = new Set<string>();
	for (const p of scaledPathCells) {
		const toAdd = [p, ...AXIAL_DIRECTIONS.map((d) => ({ q: p.q + d.q, r: p.r + d.r }))];
		for (const c of toAdd) {
			if (hexDist(0, 0, c.q, c.r) > flattenRadius) continue;
			const k = `${c.q},${c.r}`;
			if (widenedSet.has(k)) continue;
			widenedSet.add(k);
			widenedPathCells.push(c);
		}
	}
	for (const p of widenedPathCells) {
		if (isInCellSet(waterMask, p.q, p.r)) continue;
		const y = ctx.getTopSolidY(p.q, p.r);
		setColumnTop(ctx, p.q, p.r, y, 'dirt', 'sand');
	}

	// Sand banks around water channels.
	for (const water of scaledWaterCells) {
		for (const dir of AXIAL_DIRECTIONS) {
			const q = water.q + dir.q;
			const r = water.r + dir.r;
			if (isInCellSet(waterMask, q, r)) continue;
			if (hexDist(0, 0, q, r) > flattenRadius) continue;
			const y = ctx.getTopSolidY(q, r);
			ctx.setBlock(q, r, y, 'sand');
		}
	}

	const stoneTopByColumn = new Map<string, number>();
	const setStoneTop = (q: number, r: number, top: number): void => {
		stoneTopByColumn.set(`${q},${r}`, top);
	};
	const getStoneTop = (q: number, r: number): number => stoneTopByColumn.get(`${q},${r}`) ?? -1;

	const placeStoneColumn = (q: number, r: number, h: number, radius = 0): void => {
		const baseY = ctx.getTopSolidY(q, r) + 1;
		fillHexColumn(ctx, q, r, radius, baseY, baseY + h, 'stone');
		setStoneTop(q, r, baseY + h);
	};

	// Main sarsen ring with an opening aligned to the avenue.
	const outerRing = ringCells(11, 30, Math.PI / 28).filter((c) => !(c.r < -8 && Math.abs(c.q) <= 3));
	const outerRingTops: Array<{ q: number; r: number; top: number; angle: number }> = [];
	for (let i = 0; i < outerRing.length; i++) {
		const c = outerRing[i];
		const h = i % 5 === 0 ? 7 : 6;
		placeStoneColumn(c.q, c.r, h, 0);
		const w = axialToWorld(c.q, c.r);
		outerRingTops.push({ q: c.q, r: c.r, top: getStoneTop(c.q, c.r), angle: Math.atan2(w.z, w.x) });
	}
	outerRingTops.sort((a, b) => a.angle - b.angle);
	for (let i = 0; i < outerRingTops.length; i++) {
		const a = outerRingTops[i];
		const b = outerRingTops[(i + 1) % outerRingTops.length];
		if (hexDist(a.q, a.r, b.q, b.r) > 3) continue;
		const lintelY = Math.min(a.top, b.top);
		for (const c of axialLineCells(a.q, a.r, b.q, b.r)) {
			ctx.setBlock(c.q, c.r, lintelY, 'stone');
		}
	}

	// Inner bluestone ring and selected fallen stones from the extracted mask.
	const innerRing = ringCells(7, 18, Math.PI / 18);
	for (let i = 0; i < innerRing.length; i++) {
		const c = innerRing[i];
		const h = i % 2 === 0 ? 4 : 5;
		placeStoneColumn(c.q, c.r, h, 0);
	}
	for (const stone of scaledStoneMaskCells) {
		const d = hexDist(0, 0, stone.q, stone.r);
		if (d < 5 || d > 13) continue;
		if (hexDist(0, 0, stone.q, stone.r) > 10 && isInCellSet(pathMask, stone.q, stone.r)) continue;
		const lowY = ctx.getTopSolidY(stone.q, stone.r) + 1;
		ctx.setBlock(stone.q, stone.r, lowY, 'stone');
	}

	const placeTrilithon = (left: AxialCoord, right: AxialCoord, h: number): void => {
		const leftBase = ctx.getTopSolidY(left.q, left.r) + 1;
		const rightBase = ctx.getTopSolidY(right.q, right.r) + 1;
		fillHexColumn(ctx, left.q, left.r, 0, leftBase, leftBase + h, 'stone');
		fillHexColumn(ctx, right.q, right.r, 0, rightBase, rightBase + h, 'stone');
		const lintelY = Math.min(leftBase + h, rightBase + h);
		const line = axialLineCells(left.q, left.r, right.q, right.r);
		for (let i = 0; i < line.length; i++) {
			const c = line[i];
			if (i === 0 || i === line.length - 1) continue;
			ctx.setBlock(c.q, c.r, lintelY, 'stone');
		}
	};

	// Central pi-shaped trilithons and inner horseshoe.
	placeTrilithon({ q: -2, r: -1 }, { q: 2, r: -1 }, 8);
	placeTrilithon({ q: -3, r: 4 }, { q: 1, r: 4 }, 8);
	placeTrilithon({ q: -5, r: 2 }, { q: -2, r: 2 }, 7);
	placeTrilithon({ q: -6, r: -1 }, { q: -3, r: -1 }, 7);
	placeTrilithon({ q: -5, r: -4 }, { q: -2, r: -4 }, 6);
	placeTrilithon({ q: -2, r: -6 }, { q: 1, r: -6 }, 6);

	const altarY = ctx.getTopSolidY(0, 0) + 1;
	fillHexDisc(ctx, 0, 0, 0, altarY, 'stone');

	const resolveGround = (q: number, r: number): number => ctx.getTopSolidY(q, r);

	// Processional avenue and heel stone.
	paintTrail(ctx, 0, -8, 0, -30, 1, 'sand', resolveGround);
	paintTrail(ctx, 1, -8, 1, -30, 1, 'sand', resolveGround);
	const heelBase = ctx.getTopSolidY(1, -32) + 1;
	fillHexColumn(ctx, 1, -32, 1, heelBase, heelBase + 8, 'stone');

	// Roundhouse villages from extracted hut centers.
	for (let i = 0; i < scaledHutCenters.length; i++) {
		const hut = scaledHutCenters[i];
		const floorY = ctx.getTopSolidY(hut.q, hut.r);
		fillHexDisc(ctx, hut.q, hut.r, 2, floorY, 'dirt');

		const doorQ = hut.q + Math.sign(-hut.q || 1);
		const doorR = hut.r + Math.sign(-hut.r || -1);
		for (let q = hut.q - 3; q <= hut.q + 3; q++) {
			for (let r = hut.r - 3; r <= hut.r + 3; r++) {
				const d = hexDist(hut.q, hut.r, q, r);
				if (d < 2 || d > 3) continue;
				if (hexDist(doorQ, doorR, q, r) <= 1) continue;
				fillHexColumn(ctx, q, r, 0, floorY + 1, floorY + 2, 'timber');
			}
		}

		const roofBase = floorY + 3;
		fillHexDisc(ctx, hut.q, hut.r, 2, roofBase, 'thatch');
		fillHexDisc(ctx, hut.q, hut.r, 1, roofBase + 1, 'thatch');
		fillHexDisc(ctx, hut.q, hut.r, 0, roofBase + 2, 'thatch');

		if (i % 3 === 0) {
			ctx.setBlock(hut.q, hut.r, floorY + 1, 'fire');
		}

		paintTrail(ctx, hut.q, hut.r, 0, 0, 0, 'sand', resolveGround);
	}

	// Hearth clusters with animated fire blocks.
	for (const hearthCell of scaledHearthCenters) {
		let q = hearthCell.q;
		let r = hearthCell.r;
		if (isInCellSet(hutCenterMask, q, r)) {
			q += 1;
			r -= 1;
		}
		const y = ctx.getTopSolidY(q, r) + 1;
		for (const dir of AXIAL_DIRECTIONS) {
			ctx.setBlock(q + dir.q, r + dir.r, y, 'stone');
		}
		ctx.setBlock(q, r, y, 'stone');
		ctx.setBlock(q, r, y + 1, 'fire');
	}

	// Cross-paths through the ceremonial rings.
	paintTrail(ctx, -9, 0, 9, 0, 1, 'sand', resolveGround);
	paintTrail(ctx, 0, -9, 0, 9, 1, 'sand', resolveGround);
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
			addStonehengeLandmarks(ctx);
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

	const recomputeColumnTops = (q: number, r: number): void => {
		const ck = columnKey(q, r);
		let topAny = -1;
		let topSolid = -1;
		for (let y = MAX_Y; y >= 0; y--) {
			const t = blockMap.get(key(q, r, y));
			if (!t) continue;
			if (topAny === -1) topAny = y;
			if (topSolid === -1 && SOLID_BLOCKS.has(t)) topSolid = y;
			if (topAny !== -1 && topSolid !== -1) break;
		}
		if (topAny >= 0) topAnyByColumn.set(ck, topAny);
		else topAnyByColumn.delete(ck);
		if (topSolid >= 0) topSolidByColumn.set(ck, topSolid);
		else topSolidByColumn.delete(ck);
	};

	const removeBlock = (q: number, r: number, y: number): void => {
		if (y <= 0) return; // preserve bedrock floor
		const k = key(q, r, y);
		if (!blockMap.has(k)) return;
		blockMap.delete(k);
		recomputeColumnTops(q, r);
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

			if (manifest.id === 'grassland-origins') {
				const centerNoise = fbm((q + seedQ) * 0.06, (r + seedR) * 0.06);
				const ceremonialBase = manifest.seaLevel + 5 + Math.floor((centerNoise - 0.5) * 2);
				const ceremonialBlend = smoothStep01(d / 24);
				h = Math.round(ceremonialBase * (1 - ceremonialBlend) + h * ceremonialBlend);

				const ditchBand = Math.abs(d - 16.3);
				if (ditchBand < 1.0) h -= 2;
				else if (ditchBand < 1.8) h -= 1;

				const bankBand = Math.abs(d - 19.2);
				if (bankBand < 1.2) h += 1;
				if (bankBand < 0.55) h += 1;

				const avenueCross = Math.abs(q + r);
				const avenueAlong = q - r;
				if (avenueAlong > 8 && avenueAlong < 70 && avenueCross < 2.4) {
					h = Math.min(h, ceremonialBase);
				}
				h = Math.max(2, Math.min(h, 34));
			}

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

			const spawnThreshold = manifest.id === 'grassland-origins' ? 0.979 : 0.988;
			if (hash2(q + seedQ * 1.7, r + seedR * 1.3) > spawnThreshold) {
				npcSpawns.push({ q, r });
			}
		}
	}

	const ctx: BuildCtx = {
		setBlock,
		removeBlock,
		getTopSolidY,
		getTopAnyY,
		manifest
	};
	applyLandmarks(ctx);

	if (manifest.id === 'grassland-origins') {
		// Keep Stonehenge world lively around villages, hearths, and the ritual core.
		const scaledHutCenters = scalePlanCells(STONEHENGE_PLAN.hutCenters, STONEHENGE_PLAN_SCALE);
		const scaledHearthCenters = scalePlanCells(STONEHENGE_PLAN.hearthCenters, STONEHENGE_PLAN_SCALE);
		const extraSpawns: AxialCoord[] = [];
		for (const hut of scaledHutCenters) {
			extraSpawns.push({ q: hut.q, r: hut.r });
			extraSpawns.push({ q: hut.q + 1, r: hut.r });
		}
		for (const hearth of scaledHearthCenters) {
			extraSpawns.push({ q: hearth.q - 1, r: hearth.r + 1 });
		}
		extraSpawns.push({ q: 0, r: 0 }, { q: -2, r: 3 }, { q: 2, r: -3 }, { q: 1, r: -12 }, { q: 4, r: -18 });
		for (const s of extraSpawns) npcSpawns.push(s);
	}

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
