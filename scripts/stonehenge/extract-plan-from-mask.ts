import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { HEX_RADIUS } from '../../src/lib/game/constants';
import { axialToWorld, hexDist } from '../../src/lib/game/hex';

type Feature = 'grass' | 'stone' | 'path' | 'hut' | 'hearth' | 'water';

interface AxialCell {
	q: number;
	r: number;
}

const DEFAULT_INPUT = 'docs/stonehenge-references/masks-nanobanana/nanobanana-output/topdown_voxel_stonehenge_site_pl.png';
const OUTPUT_TS = 'src/lib/game/stonehengePlan.generated.ts';
const OUTPUT_JSON = 'docs/stonehenge-references/stonehenge-plan.json';
const OUTPUT_SVG = 'docs/stonehenge-references/stonehenge-plan-debug.svg';
const OUTPUT_PNG = 'docs/stonehenge-references/stonehenge-plan-debug.png';
const STONE_OUTER_RING_WORLD_RADIUS = 11;
const SAMPLE_JITTER = 0.26;
const FEATURE_RADIUS_FALLBACK = 30;
const NEIGHBOR_DIRECTIONS: AxialCell[] = [
	{ q: 1, r: 0 },
	{ q: 1, r: -1 },
	{ q: 0, r: -1 },
	{ q: -1, r: 0 },
	{ q: -1, r: 1 },
	{ q: 0, r: 1 }
];

function readPng(file: string): PNG {
	const buf = fs.readFileSync(file);
	const decoded = PNG.sync.read(buf);
	return decoded;
}

function rgbAt(png: PNG, x: number, y: number): { r: number; g: number; b: number } {
	const px = Math.max(0, Math.min(png.width - 1, Math.round(x)));
	const py = Math.max(0, Math.min(png.height - 1, Math.round(y)));
	const idx = (py * png.width + px) * 4;
	const data = png.data;
	return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
}

function rgbToHsv({ r, g, b }: { r: number; g: number; b: number }): { h: number; s: number; v: number } {
	const nr = r / 255;
	const ng = g / 255;
	const nb = b / 255;
	const mx = Math.max(nr, ng, nb);
	const mn = Math.min(nr, ng, nb);
	const d = mx - mn;
	let h = 0;
	if (d > 1e-6) {
		if (mx === nr) h = ((ng - nb) / d) % 6;
		else if (mx === ng) h = (nb - nr) / d + 2;
		else h = (nr - ng) / d + 4;
		h *= 60;
		if (h < 0) h += 360;
	}
	const s = mx === 0 ? 0 : d / mx;
	const v = mx;
	return { h, s, v };
}

function classify({ r, g, b }: { r: number; g: number; b: number }): Feature {
	const { h, s, v } = rgbToHsv({ r, g, b });
	if (h >= 188 && h <= 250 && s > 0.33 && v > 0.33) return 'water';
	if (h >= 14 && h <= 40 && s > 0.45 && v > 0.64) return 'hearth';
	if (h >= 18 && h <= 48 && s > 0.34 && v > 0.29 && v < 0.78) return 'hut';
	if (h >= 34 && h <= 62 && s > 0.11 && s < 0.5 && v > 0.62) return 'path';
	const stoneLike =
		Math.abs(r - g) < 32 &&
		Math.abs(g - b) < 32 &&
		s < 0.24 &&
		v > 0.45 &&
		v < 0.9 &&
		!(h >= 170 && h <= 260 && s > 0.08);
	if (stoneLike) return 'stone';
	return 'grass';
}

function quantile(values: number[], t: number): number {
	if (!values.length) return 1;
	const idx = Math.min(values.length - 1, Math.max(0, Math.floor(t * (values.length - 1))));
	return values[idx];
}

function findCenterAndScale(png: PNG): { cx: number; cy: number; scalePxPerWorld: number; worldFeatureRadius: number } {
	let sx = 0;
	let sy = 0;
	let n = 0;
	const stoneDists: number[] = [];
	const featureDists: number[] = [];
	for (let y = 0; y < png.height; y++) {
		for (let x = 0; x < png.width; x++) {
			const f = classify(rgbAt(png, x, y));
			if (f === 'stone') {
				sx += x;
				sy += y;
				n++;
			}
		}
	}
	if (!n) {
		return {
			cx: png.width * 0.5,
			cy: png.height * 0.5,
			scalePxPerWorld: Math.min(png.width, png.height) * 0.012,
			worldFeatureRadius: FEATURE_RADIUS_FALLBACK
		};
	}
	const cx = sx / n;
	const cy = sy / n;

	for (let y = 0; y < png.height; y++) {
		for (let x = 0; x < png.width; x++) {
			const f = classify(rgbAt(png, x, y));
			if (f === 'grass') continue;
			const d = Math.hypot(x - cx, y - cy);
			featureDists.push(d);
			if (f === 'stone') stoneDists.push(d);
		}
	}
	stoneDists.sort((a, b) => a - b);
	featureDists.sort((a, b) => a - b);
	const outerStonePx = quantile(stoneDists, 0.93);
	const featureRadiusPx = quantile(featureDists, 0.985);
	const scalePxPerWorld = Math.max(5, outerStonePx / STONE_OUTER_RING_WORLD_RADIUS);
	const worldFeatureRadius = Math.max(24, Math.min(42, Math.round(featureRadiusPx / scalePxPerWorld + 2)));

	return { cx, cy, scalePxPerWorld, worldFeatureRadius };
}

function cellKey(q: number, r: number): string {
	return `${q},${r}`;
}

function connectedComponents(cells: AxialCell[]): AxialCell[][] {
	const set = new Set<string>(cells.map((c) => cellKey(c.q, c.r)));
	const seen = new Set<string>();
	const out: AxialCell[][] = [];
	for (const cell of cells) {
		const k0 = cellKey(cell.q, cell.r);
		if (seen.has(k0)) continue;
		const queue = [cell];
		seen.add(k0);
		const comp: AxialCell[] = [];
		while (queue.length) {
			const c = queue.pop() as AxialCell;
			comp.push(c);
			for (const d of NEIGHBOR_DIRECTIONS) {
				const q2 = c.q + d.q;
				const r2 = c.r + d.r;
				const k2 = cellKey(q2, r2);
				if (!set.has(k2) || seen.has(k2)) continue;
				seen.add(k2);
				queue.push({ q: q2, r: r2 });
			}
		}
		out.push(comp);
	}
	return out;
}

function componentCenter(cells: AxialCell[]): AxialCell {
	let sq = 0;
	let sr = 0;
	for (const c of cells) {
		sq += c.q;
		sr += c.r;
	}
	return { q: Math.round(sq / cells.length), r: Math.round(sr / cells.length) };
}

function dedupeSparse(cells: AxialCell[], minDist: number): AxialCell[] {
	const sorted = [...cells].sort((a, b) => {
		const da = hexDist(0, 0, a.q, a.r);
		const db = hexDist(0, 0, b.q, b.r);
		if (Math.abs(da - db) > 0.01) return da - db;
		return Math.atan2(a.r, a.q) - Math.atan2(b.r, b.q);
	});
	const kept: AxialCell[] = [];
	for (const c of sorted) {
		let near = false;
		for (const k of kept) {
			if (hexDist(c.q, c.r, k.q, k.r) < minDist) {
				near = true;
				break;
			}
		}
		if (!near) kept.push(c);
	}
	return kept;
}

function writeGeneratedTs(
	outputPath: string,
	sourceImage: string,
	worldFeatureRadius: number,
	features: Record<Feature, AxialCell[]>
): void {
	const hutComponents = connectedComponents(features.hut);
	const hearthComponents = connectedComponents(features.hearth);
	const waterComponents = connectedComponents(features.water);
	const hutCenters = hutComponents.filter((c) => c.length >= 4).map(componentCenter);
	const hearthCenters = hearthComponents.map(componentCenter);
	const standingStoneSeeds = dedupeSparse(features.stone, 1.5);

	const source = `// AUTO-GENERATED by scripts/stonehenge/extract-plan-from-mask.ts
// Source image: ${sourceImage}

export interface StonehengePlanCell {
	q: number;
	r: number;
}

export const STONEHENGE_PLAN_META = {
	sourceImage: ${JSON.stringify(sourceImage)},
	worldFeatureRadius: ${worldFeatureRadius}
} as const;

export const STONEHENGE_PLAN = {
	stoneMaskCells: ${JSON.stringify(features.stone)},
	standingStoneSeeds: ${JSON.stringify(standingStoneSeeds)},
	pathCells: ${JSON.stringify(features.path)},
	waterCells: ${JSON.stringify(features.water)},
	hutMaskCells: ${JSON.stringify(features.hut)},
	hutCenters: ${JSON.stringify(hutCenters)},
	hearthCenters: ${JSON.stringify(hearthCenters)},
	waterComponents: ${JSON.stringify(waterComponents.map((c) => c.length))}
} as const;
`;
	fs.writeFileSync(outputPath, source);

	const payload = {
		sourceImage,
		meta: {
			worldFeatureRadius
		},
		counts: {
			stoneMask: features.stone.length,
			standingSeeds: standingStoneSeeds.length,
			path: features.path.length,
			water: features.water.length,
			hutMask: features.hut.length,
			hutCenters: hutCenters.length,
			hearthCenters: hearthCenters.length
		},
		plan: {
			stoneMaskCells: features.stone,
			standingStoneSeeds,
			pathCells: features.path,
			waterCells: features.water,
			hutMaskCells: features.hut,
			hutCenters,
			hearthCenters
		}
	};
	fs.writeFileSync(OUTPUT_JSON, JSON.stringify(payload, null, 2));

	const svg = renderSvgPreview({
		stone: features.stone,
		path: features.path,
		water: features.water,
		hut: features.hut,
		hearth: features.hearth
	});
	fs.writeFileSync(OUTPUT_SVG, svg);

	const png = renderPngPreview({
		stone: features.stone,
		path: features.path,
		water: features.water,
		hut: features.hut,
		hearth: features.hearth
	});
	fs.writeFileSync(OUTPUT_PNG, png);
}

function renderSvgPreview(features: Record<Feature, AxialCell[]>): string {
	const pxPerWorld = 10;
	const pad = 30;
	const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	for (const list of Object.values(features)) {
		for (const c of list) {
			const w = axialToWorld(c.q, c.r);
			bounds.minX = Math.min(bounds.minX, w.x);
			bounds.minY = Math.min(bounds.minY, w.z);
			bounds.maxX = Math.max(bounds.maxX, w.x);
			bounds.maxY = Math.max(bounds.maxY, w.z);
		}
	}
	const width = Math.max(400, Math.ceil((bounds.maxX - bounds.minX) * pxPerWorld + pad * 2));
	const height = Math.max(400, Math.ceil((bounds.maxY - bounds.minY) * pxPerWorld + pad * 2));
	const toSvgPoint = (c: AxialCell): { x: number; y: number } => {
		const w = axialToWorld(c.q, c.r);
		return {
			x: (w.x - bounds.minX) * pxPerWorld + pad,
			y: (w.z - bounds.minY) * pxPerWorld + pad
		};
	};
	const colors: Record<Feature, string> = {
		grass: '#8abc5f',
		stone: '#9caeb7',
		path: '#ecdbb4',
		hut: '#a06f48',
		hearth: '#ef8d2e',
		water: '#2f7fd6'
	};
	const featureOrder: Feature[] = ['water', 'path', 'stone', 'hut', 'hearth'];
	const circles: string[] = [];
	for (const f of featureOrder) {
		for (const c of features[f]) {
			const p = toSvgPoint(c);
			circles.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="3.9" fill="${colors[f]}" />`);
		}
	}
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#1a2a1c" />
  ${circles.join('\n  ')}
</svg>`;
}

function colorHexToRgb(hex: string): { r: number; g: number; b: number } {
	const cleaned = hex.replace('#', '');
	const value = Number.parseInt(cleaned, 16);
	return {
		r: (value >> 16) & 0xff,
		g: (value >> 8) & 0xff,
		b: value & 0xff
	};
}

function drawDisc(
	png: PNG,
	cx: number,
	cy: number,
	radius: number,
	color: { r: number; g: number; b: number }
): void {
	const minX = Math.max(0, Math.floor(cx - radius));
	const maxX = Math.min(png.width - 1, Math.ceil(cx + radius));
	const minY = Math.max(0, Math.floor(cy - radius));
	const maxY = Math.min(png.height - 1, Math.ceil(cy + radius));
	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			if (Math.hypot(x - cx, y - cy) > radius) continue;
			const idx = (y * png.width + x) * 4;
			png.data[idx] = color.r;
			png.data[idx + 1] = color.g;
			png.data[idx + 2] = color.b;
			png.data[idx + 3] = 255;
		}
	}
}

function renderPngPreview(features: Record<Feature, AxialCell[]>): Buffer {
	const pxPerWorld = 10;
	const pad = 30;
	const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
	for (const list of Object.values(features)) {
		for (const c of list) {
			const w = axialToWorld(c.q, c.r);
			bounds.minX = Math.min(bounds.minX, w.x);
			bounds.minY = Math.min(bounds.minY, w.z);
			bounds.maxX = Math.max(bounds.maxX, w.x);
			bounds.maxY = Math.max(bounds.maxY, w.z);
		}
	}
	const width = Math.max(400, Math.ceil((bounds.maxX - bounds.minX) * pxPerWorld + pad * 2));
	const height = Math.max(400, Math.ceil((bounds.maxY - bounds.minY) * pxPerWorld + pad * 2));

	const png = new PNG({ width, height });
	const bg = colorHexToRgb('#1a2a1c');
	for (let i = 0; i < png.data.length; i += 4) {
		png.data[i] = bg.r;
		png.data[i + 1] = bg.g;
		png.data[i + 2] = bg.b;
		png.data[i + 3] = 255;
	}

	const toPngPoint = (c: AxialCell): { x: number; y: number } => {
		const w = axialToWorld(c.q, c.r);
		return {
			x: Math.round((w.x - bounds.minX) * pxPerWorld + pad),
			y: Math.round((w.z - bounds.minY) * pxPerWorld + pad)
		};
	};
	const colors: Record<Feature, { r: number; g: number; b: number }> = {
		grass: colorHexToRgb('#8abc5f'),
		stone: colorHexToRgb('#9caeb7'),
		path: colorHexToRgb('#ecdbb4'),
		hut: colorHexToRgb('#a06f48'),
		hearth: colorHexToRgb('#ef8d2e'),
		water: colorHexToRgb('#2f7fd6')
	};
	const featureOrder: Feature[] = ['water', 'path', 'stone', 'hut', 'hearth'];
	for (const f of featureOrder) {
		for (const c of features[f]) {
			const p = toPngPoint(c);
			drawDisc(png, p.x, p.y, 4.2, colors[f]);
		}
	}

	return PNG.sync.write(png);
}

function extractFromImage(inputPath: string): {
	worldFeatureRadius: number;
	features: Record<Feature, AxialCell[]>;
} {
	const png = readPng(inputPath);
	const { cx, cy, scalePxPerWorld, worldFeatureRadius } = findCenterAndScale(png);
	const features: Record<Feature, AxialCell[]> = {
		grass: [],
		stone: [],
		path: [],
		hut: [],
		hearth: [],
		water: []
	};

	const jitters: Array<[number, number]> = [
		[0, 0],
		[SAMPLE_JITTER, 0],
		[-SAMPLE_JITTER, 0],
		[0, SAMPLE_JITTER],
		[0, -SAMPLE_JITTER],
		[SAMPLE_JITTER * 0.7, SAMPLE_JITTER * 0.7],
		[-SAMPLE_JITTER * 0.7, -SAMPLE_JITTER * 0.7]
	];

	for (let q = -worldFeatureRadius; q <= worldFeatureRadius; q++) {
		for (let r = -worldFeatureRadius; r <= worldFeatureRadius; r++) {
			if (hexDist(0, 0, q, r) > worldFeatureRadius) continue;
			const w = axialToWorld(q, r);
			const votes: Record<Feature, number> = {
				grass: 0,
				stone: 0,
				path: 0,
				hut: 0,
				hearth: 0,
				water: 0
			};
			for (const [jx, jy] of jitters) {
				const px = cx + ((w.x / HEX_RADIUS) + jx) * scalePxPerWorld;
				const py = cy + ((w.z / HEX_RADIUS) + jy) * scalePxPerWorld;
				const f = classify(rgbAt(png, px, py));
				votes[f]++;
			}
			let f: Feature = 'grass';
			let best = votes.grass;
			for (const k of ['stone', 'path', 'hut', 'hearth', 'water'] as const) {
				if (votes[k] > best) {
					best = votes[k];
					f = k;
				}
			}
			if (votes.path >= 3 && f === 'grass') f = 'path';
			if (votes.water >= 3 && f === 'grass') f = 'water';
			features[f].push({ q, r });
		}
	}
	return { worldFeatureRadius, features };
}

function main(): void {
	const inputArg = process.argv[2] ?? DEFAULT_INPUT;
	const inputPath = path.resolve(inputArg);
	if (!fs.existsSync(inputPath)) {
		throw new Error(`Input image not found: ${inputPath}`);
	}

	const extracted = extractFromImage(inputPath);
	writeGeneratedTs(
		path.resolve(OUTPUT_TS),
		path.relative(process.cwd(), inputPath),
		extracted.worldFeatureRadius,
		extracted.features
	);
	console.log(`Generated ${OUTPUT_TS}`);
	console.log(`Generated ${OUTPUT_JSON}`);
	console.log(`Generated ${OUTPUT_SVG}`);
	console.log(`Generated ${OUTPUT_PNG}`);
}

main();
