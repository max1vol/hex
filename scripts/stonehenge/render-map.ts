import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { getBiomeOrDefault } from '../../src/lib/game/biomes';
import { axialToWorld } from '../../src/lib/game/hex';
import { generateBiomeTerrain } from '../../src/lib/game/terrain';
import type { BlockType } from '../../src/lib/game/types';

interface TopCell {
	q: number;
	r: number;
	y: number;
	type: BlockType;
}

const OUT_DIR = 'docs/stonehenge-renders';
const TOP_SVG = 'docs/stonehenge-renders/top-map.svg';
const SLICE_Q_SVG = 'docs/stonehenge-renders/slice-q0.svg';
const SLICE_R_SVG = 'docs/stonehenge-renders/slice-r0.svg';
const TOP_PNG = 'docs/stonehenge-renders/top-map.png';
const SLICE_Q_PNG = 'docs/stonehenge-renders/slice-q0.png';
const SLICE_R_PNG = 'docs/stonehenge-renders/slice-r0.png';
const META_JSON = 'docs/stonehenge-renders/meta.json';

const COLOR_BY_TYPE: Record<string, string> = {
	grass: '#7eb75f',
	dirt: '#7a5f3e',
	stone: '#9da8b6',
	sand: '#e2cf98',
	water: '#4b89d8',
	bedrock: '#2f3540',
	brick: '#b1644e',
	snow: '#e8f0fb',
	ice: '#98c9e8',
	metal: '#909ead',
	asphalt: '#3f444d',
	art: '#cb5db3',
	timber: '#8a5b38',
	thatch: '#c3a46b',
	fire: '#f28e3c'
};

function colorHexToRgb(hex: string): { r: number; g: number; b: number } {
	const cleaned = hex.replace('#', '');
	const value = Number.parseInt(cleaned, 16);
	return {
		r: (value >> 16) & 0xff,
		g: (value >> 8) & 0xff,
		b: value & 0xff
	};
}

function setPixel(png: PNG, x: number, y: number, rgb: { r: number; g: number; b: number }): void {
	if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
	const idx = (y * png.width + x) * 4;
	png.data[idx] = rgb.r;
	png.data[idx + 1] = rgb.g;
	png.data[idx + 2] = rgb.b;
	png.data[idx + 3] = 255;
}

function drawDisc(
	png: PNG,
	cx: number,
	cy: number,
	radius: number,
	rgb: { r: number; g: number; b: number }
): void {
	const minX = Math.max(0, Math.floor(cx - radius));
	const maxX = Math.min(png.width - 1, Math.ceil(cx + radius));
	const minY = Math.max(0, Math.floor(cy - radius));
	const maxY = Math.min(png.height - 1, Math.ceil(cy + radius));
	for (let y = minY; y <= maxY; y++) {
		for (let x = minX; x <= maxX; x++) {
			if (Math.hypot(x - cx, y - cy) > radius) continue;
			setPixel(png, x, y, rgb);
		}
	}
}

function fillRect(
	png: PNG,
	x: number,
	y: number,
	w: number,
	h: number,
	rgb: { r: number; g: number; b: number }
): void {
	for (let py = Math.max(0, y); py < Math.min(png.height, y + h); py++) {
		for (let px = Math.max(0, x); px < Math.min(png.width, x + w); px++) {
			setPixel(png, px, py, rgb);
		}
	}
}

function hashSeed(id: string): number {
	let h = 2166136261;
	for (let i = 0; i < id.length; i++) {
		h ^= id.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return Math.abs(h >>> 0);
}

function blockKey(q: number, r: number, y: number): string {
	return `${q},${r},${y}`;
}

function topMap(blocks: Array<{ q: number; r: number; y: number; type: BlockType }>): Map<string, TopCell> {
	const out = new Map<string, TopCell>();
	for (const b of blocks) {
		const k = `${b.q},${b.r}`;
		const prev = out.get(k);
		if (!prev || b.y >= prev.y) out.set(k, { q: b.q, r: b.r, y: b.y, type: b.type });
	}
	return out;
}

function renderTopSvg(cells: TopCell[]): string {
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	const points = cells.map((c) => {
		const w = axialToWorld(c.q, c.r);
		minX = Math.min(minX, w.x);
		maxX = Math.max(maxX, w.x);
		minY = Math.min(minY, w.z);
		maxY = Math.max(maxY, w.z);
		return { ...c, x: w.x, y: w.z };
	});
	const scale = 9;
	const pad = 26;
	const width = Math.ceil((maxX - minX) * scale + pad * 2);
	const height = Math.ceil((maxY - minY) * scale + pad * 2);
	const circles = points.map((p) => {
		const sx = (p.x - minX) * scale + pad;
		const sy = (p.y - minY) * scale + pad;
		const fill = COLOR_BY_TYPE[p.type] ?? '#ffffff';
		return `<circle cx="${sx.toFixed(2)}" cy="${sy.toFixed(2)}" r="3.6" fill="${fill}" />`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#14201a" />
  ${circles.join('\n  ')}
</svg>`;
}

function renderTopPng(cells: TopCell[]): Buffer {
	let minX = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;
	const points = cells.map((c) => {
		const w = axialToWorld(c.q, c.r);
		minX = Math.min(minX, w.x);
		maxX = Math.max(maxX, w.x);
		minY = Math.min(minY, w.z);
		maxY = Math.max(maxY, w.z);
		return { ...c, x: w.x, y: w.z };
	});
	const scale = 9;
	const pad = 26;
	const width = Math.ceil((maxX - minX) * scale + pad * 2);
	const height = Math.ceil((maxY - minY) * scale + pad * 2);
	const png = new PNG({ width, height });
	const bg = colorHexToRgb('#14201a');
	fillRect(png, 0, 0, width, height, bg);

	for (const p of points) {
		const sx = Math.round((p.x - minX) * scale + pad);
		const sy = Math.round((p.y - minY) * scale + pad);
		const fill = colorHexToRgb(COLOR_BY_TYPE[p.type] ?? '#ffffff');
		drawDisc(png, sx, sy, 4, fill);
	}
	return PNG.sync.write(png);
}

function renderSliceSvg(
	blocks: Array<{ q: number; r: number; y: number; type: BlockType }>,
	mode: 'q' | 'r',
	value: number
): string {
	const filtered = blocks.filter((b) => (mode === 'q' ? b.q === value : b.r === value));
	let minAxis = Number.POSITIVE_INFINITY;
	let maxAxis = Number.NEGATIVE_INFINITY;
	let maxY = 0;
	for (const b of filtered) {
		const axis = mode === 'q' ? b.r : b.q;
		minAxis = Math.min(minAxis, axis);
		maxAxis = Math.max(maxAxis, axis);
		maxY = Math.max(maxY, b.y);
	}
	if (!filtered.length) {
		return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="220"><rect width="100%" height="100%" fill="#081019"/></svg>`;
	}
	const cellW = 8;
	const cellH = 6;
	const pad = 20;
	const width = (maxAxis - minAxis + 1) * cellW + pad * 2;
	const height = (maxY + 1) * cellH + pad * 2;
	const rects = filtered.map((b) => {
		const axis = mode === 'q' ? b.r : b.q;
		const x = (axis - minAxis) * cellW + pad;
		const y = height - (b.y + 1) * cellH - pad;
		const fill = COLOR_BY_TYPE[b.type] ?? '#fff';
		return `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" />`;
	});
	return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="#081019" />
  ${rects.join('\n  ')}
</svg>`;
}

function renderSlicePng(
	blocks: Array<{ q: number; r: number; y: number; type: BlockType }>,
	mode: 'q' | 'r',
	value: number
): Buffer {
	const filtered = blocks.filter((b) => (mode === 'q' ? b.q === value : b.r === value));
	let minAxis = Number.POSITIVE_INFINITY;
	let maxAxis = Number.NEGATIVE_INFINITY;
	let maxY = 0;
	for (const b of filtered) {
		const axis = mode === 'q' ? b.r : b.q;
		minAxis = Math.min(minAxis, axis);
		maxAxis = Math.max(maxAxis, axis);
		maxY = Math.max(maxY, b.y);
	}
	if (!filtered.length) {
		const png = new PNG({ width: 800, height: 220 });
		fillRect(png, 0, 0, png.width, png.height, colorHexToRgb('#081019'));
		return PNG.sync.write(png);
	}
	const cellW = 8;
	const cellH = 6;
	const pad = 20;
	const width = (maxAxis - minAxis + 1) * cellW + pad * 2;
	const height = (maxY + 1) * cellH + pad * 2;
	const png = new PNG({ width, height });
	fillRect(png, 0, 0, width, height, colorHexToRgb('#081019'));

	for (const b of filtered) {
		const axis = mode === 'q' ? b.r : b.q;
		const x = (axis - minAxis) * cellW + pad;
		const y = height - (b.y + 1) * cellH - pad;
		const fill = colorHexToRgb(COLOR_BY_TYPE[b.type] ?? '#fff');
		fillRect(png, x, y, cellW, cellH, fill);
	}
	return PNG.sync.write(png);
}

function main(): void {
	const biome = getBiomeOrDefault('grassland-origins');
	const seed = hashSeed(biome.id);
	const data = generateBiomeTerrain(biome, seed);
	const top = [...topMap(data.blocks).values()];

	fs.mkdirSync(path.resolve(OUT_DIR), { recursive: true });
	fs.writeFileSync(path.resolve(TOP_SVG), renderTopSvg(top));
	fs.writeFileSync(path.resolve(SLICE_Q_SVG), renderSliceSvg(data.blocks, 'q', 0));
	fs.writeFileSync(path.resolve(SLICE_R_SVG), renderSliceSvg(data.blocks, 'r', 0));
	fs.writeFileSync(path.resolve(TOP_PNG), renderTopPng(top));
	fs.writeFileSync(path.resolve(SLICE_Q_PNG), renderSlicePng(data.blocks, 'q', 0));
	fs.writeFileSync(path.resolve(SLICE_R_PNG), renderSlicePng(data.blocks, 'r', 0));

	const byKey = new Map<string, BlockType>();
	for (const b of data.blocks) byKey.set(blockKey(b.q, b.r, b.y), b.type);
	let unsupportedStoneColumns = 0;
	const seenStone = new Set<string>();
	for (const b of data.blocks) {
		if (b.type !== 'stone') continue;
		const ck = `${b.q},${b.r}`;
		if (seenStone.has(ck)) continue;
		seenStone.add(ck);
		let minStoneY = Number.POSITIVE_INFINITY;
		for (let y = 1; y <= 80; y++) {
			if (byKey.get(blockKey(b.q, b.r, y)) === 'stone') {
				minStoneY = y;
				break;
			}
		}
		if (!Number.isFinite(minStoneY)) continue;
		if (!byKey.has(blockKey(b.q, b.r, minStoneY - 1))) unsupportedStoneColumns++;
	}

	const meta = {
		biome: biome.id,
		seed,
		blocks: data.blocks.length,
		columns: top.length,
		stoneColumns: seenStone.size,
		unsupportedStoneColumns
	};
	fs.writeFileSync(path.resolve(META_JSON), JSON.stringify(meta, null, 2));

	console.log(`Wrote ${TOP_SVG}`);
	console.log(`Wrote ${SLICE_Q_SVG}`);
	console.log(`Wrote ${SLICE_R_SVG}`);
	console.log(`Wrote ${TOP_PNG}`);
	console.log(`Wrote ${SLICE_Q_PNG}`);
	console.log(`Wrote ${SLICE_R_PNG}`);
	console.log(`Wrote ${META_JSON}`);
}

main();
