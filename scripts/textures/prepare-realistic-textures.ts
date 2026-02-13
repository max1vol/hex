import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

const ROOT = process.cwd();
const INPUT_DIR = path.join(
	ROOT,
	'docs/stonehenge-references/textures-nanobanana-v5/nanobanana-output'
);
const OUT_DIR = path.join(ROOT, 'static/textures');

function readPng(filePath: string): PNG {
	return PNG.sync.read(fs.readFileSync(filePath));
}

function writePng(filePath: string, png: PNG): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, PNG.sync.write(png));
}

function resizeNearest(src: PNG, outW: number, outH: number): PNG {
	const out = new PNG({ width: outW, height: outH });
	for (let y = 0; y < outH; y++) {
		for (let x = 0; x < outW; x++) {
			const sx = Math.min(src.width - 1, Math.floor((x / outW) * src.width));
			const sy = Math.min(src.height - 1, Math.floor((y / outH) * src.height));
			const si = (sy * src.width + sx) * 4;
			const di = (y * out.width + x) * 4;
			out.data[di + 0] = src.data[si + 0];
			out.data[di + 1] = src.data[si + 1];
			out.data[di + 2] = src.data[si + 2];
			out.data[di + 3] = src.data[si + 3];
		}
	}
	return out;
}

function copyTexture(inName: string, outName: string): void {
	const src = path.join(INPUT_DIR, inName);
	const dst = path.join(OUT_DIR, outName);
	fs.copyFileSync(src, dst);
}

function clamp8(v: number): number {
	return Math.max(0, Math.min(255, Math.round(v)));
}

function mix(a: number, b: number, t: number): number {
	return a * (1 - t) + b * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
	const t = Math.max(0, Math.min(1, (x - edge0) / Math.max(1e-6, edge1 - edge0)));
	return t * t * (3 - 2 * t);
}

function makeGrassSide(): void {
	const grassTop = readPng(path.join(INPUT_DIR, 'seamless_photorealistic_grass_te.png'));
	const dirt = readPng(path.join(INPUT_DIR, 'realistic_compact_dirt_soil_with.png'));
	const g = resizeNearest(grassTop, 1024, 1024);
	const d = resizeNearest(dirt, 1024, 1024);
	const out = new PNG({ width: 1024, height: 1024 });

	for (let y = 0; y < out.height; y++) {
		const ny = y / (out.height - 1);
		for (let x = 0; x < out.width; x++) {
			const i = (y * out.width + x) * 4;
			const jitter = Math.sin(x * 0.07) * 0.02 + Math.cos(x * 0.025) * 0.01;
			const boundary = 0.3 + jitter;
			const t = smoothstep(boundary - 0.03, boundary + 0.06, ny);
			const fr = mix(g.data[i + 0], d.data[i + 0], t);
			const fg = mix(g.data[i + 1], d.data[i + 1], t);
			const fb = mix(g.data[i + 2], d.data[i + 2], t);
			out.data[i + 0] = clamp8(fr);
			out.data[i + 1] = clamp8(fg);
			out.data[i + 2] = clamp8(fb);
			out.data[i + 3] = 255;
		}
	}

	writePng(path.join(OUT_DIR, 'grass_side.png'), out);
}

function isLikelyCheckerboard(r: number, g: number, b: number): boolean {
	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const sat = max - min;
	const lum = (r + g + b) / 3;
	return sat <= 10 && lum >= 205;
}

function keyOutCheckerboard(imageName: string, outName: string): void {
	const src = readPng(path.join(INPUT_DIR, imageName));
	const out = new PNG({ width: src.width, height: src.height });
	src.data.copy(out.data);

	const visited = new Uint8Array(src.width * src.height);
	const queue: number[] = [];
	const push = (x: number, y: number): void => {
		if (x < 0 || y < 0 || x >= src.width || y >= src.height) return;
		const idx = y * src.width + x;
		if (visited[idx]) return;
		const di = idx * 4;
		if (!isLikelyCheckerboard(src.data[di], src.data[di + 1], src.data[di + 2])) return;
		visited[idx] = 1;
		queue.push(idx);
	};

	for (let x = 0; x < src.width; x++) {
		push(x, 0);
		push(x, src.height - 1);
	}
	for (let y = 0; y < src.height; y++) {
		push(0, y);
		push(src.width - 1, y);
	}

	while (queue.length) {
		const idx = queue.pop() as number;
		const x = idx % src.width;
		const y = Math.floor(idx / src.width);
		const di = idx * 4;
		out.data[di + 3] = 0;
		push(x + 1, y);
		push(x - 1, y);
		push(x, y + 1);
		push(x, y - 1);
	}

	// Soften edge pixels where background and foreground meet.
	for (let y = 1; y < src.height - 1; y++) {
		for (let x = 1; x < src.width - 1; x++) {
			const idx = y * src.width + x;
			const di = idx * 4;
			if (out.data[di + 3] === 0) continue;
			let bgNeighbors = 0;
			for (let oy = -1; oy <= 1; oy++) {
				for (let ox = -1; ox <= 1; ox++) {
					if (!ox && !oy) continue;
					const ni = ((y + oy) * src.width + (x + ox)) * 4;
					if (out.data[ni + 3] === 0) bgNeighbors++;
				}
			}
			if (bgNeighbors > 0) {
				out.data[di + 3] = clamp8(255 - bgNeighbors * 26);
			}
		}
	}

	writePng(path.join(OUT_DIR, outName), out);
}

function makeSmokeFromBlack(imageName: string, outName: string): void {
	const src = readPng(path.join(INPUT_DIR, imageName));
	const out = new PNG({ width: src.width, height: src.height });
	for (let i = 0; i < src.data.length; i += 4) {
		const r = src.data[i];
		const g = src.data[i + 1];
		const b = src.data[i + 2];
		const lum = (r + g + b) / 3;
		const alpha = clamp8(Math.max(0, (lum - 8) * 1.7));
		out.data[i + 0] = 232;
		out.data[i + 1] = 232;
		out.data[i + 2] = 232;
		out.data[i + 3] = alpha;
	}
	writePng(path.join(OUT_DIR, outName), out);
}

function makeFireFxFromAtlas(imageName: string, outName: string): void {
	const atlas = readPng(path.join(INPUT_DIR, imageName));
	const cols = 5;
	const rows = 5;
	const tileW = Math.floor(atlas.width / cols);
	const tileH = Math.floor(atlas.height / rows);
	const pickCol = 2;
	const pickRow = 1;
	const out = new PNG({ width: tileW, height: tileH });

	for (let y = 0; y < tileH; y++) {
		for (let x = 0; x < tileW; x++) {
			const sx = pickCol * tileW + x;
			const sy = pickRow * tileH + y;
			const si = (sy * atlas.width + sx) * 4;
			const di = (y * out.width + x) * 4;
			const r = atlas.data[si + 0];
			const g = atlas.data[si + 1];
			const b = atlas.data[si + 2];
			const lum = (r + g + b) / 3;
			const alpha = clamp8(Math.max(0, (lum - 10) * 2.2));
			out.data[di + 0] = r;
			out.data[di + 1] = g;
			out.data[di + 2] = b;
			out.data[di + 3] = alpha;
		}
	}
	writePng(path.join(OUT_DIR, outName), out);
}

function makeFireAtlasFromBlack(imageName: string, outName: string): void {
	const atlas = readPng(path.join(INPUT_DIR, imageName));
	const out = new PNG({ width: atlas.width, height: atlas.height });
	for (let i = 0; i < atlas.data.length; i += 4) {
		const r = atlas.data[i + 0];
		const g = atlas.data[i + 1];
		const b = atlas.data[i + 2];
		// Black background to alpha, preserving bright flame cores.
		const maxCh = Math.max(r, g, b);
		const alpha = clamp8(Math.max(0, (maxCh - 8) * 2.4));
		out.data[i + 0] = r;
		out.data[i + 1] = g;
		out.data[i + 2] = b;
		out.data[i + 3] = alpha;
	}
	writePng(path.join(OUT_DIR, outName), out);
}

function run(): void {
	copyTexture('seamless_photorealistic_grass_te.png', 'grass_top.png');
	copyTexture('realistic_compact_dirt_soil_with.png', 'dirt.png');
	copyTexture('realistic_weathered_limestone_su.png', 'stone.png');
	copyTexture('realistic_fine_sand_with_subtle_.png', 'sand.png');
	copyTexture('shallow_clear_river_water_seen_f.png', 'water.png');
	copyTexture('realistic_timber_wall_planks_wea.png', 'timber.png');
	copyTexture('realistic_straw_thatch_roofing_t.png', 'thatch.png');

	makeGrassSide();
	keyOutCheckerboard('realistic_leafy_branch_cluster_s.png', 'leaf_card.png');
	keyOutCheckerboard('realistic_wild_grass_tuft_sprite.png', 'grass_card.png');
	makeSmokeFromBlack('campfire_smoke_sprite_on_pure_bl.png', 'smoke.png');
	makeFireAtlasFromBlack('realistic_flame_sprite_atlas_on_.png', 'fire_atlas.png');
	makeFireFxFromAtlas('realistic_flame_sprite_atlas_on_.png', 'fire_fx.png');

	console.log('Prepared realistic texture pack in static/textures');
}

run();
