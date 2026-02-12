<script lang="ts">
	import { onMount } from 'svelte';
	import { WORLD_MIN_RADIUS } from '$lib/game/constants';
	import { getBiomeOrDefault } from '$lib/game/biomes';
	import { generateBiomeTerrain } from '$lib/game/terrain';
	import type { BlockType } from '$lib/game/types';

	type BlockMap = Map<string, BlockType>;
	type ColumnTop = Map<string, { y: number; type: BlockType }>;

	const TYPE_COLOR: Record<BlockType, string> = {
		grass: '#5ea45a',
		dirt: '#7c5b3b',
		stone: '#8f959e',
		sand: '#d6c089',
		water: '#4a79b8',
		bedrock: '#282b30',
		brick: '#a35143',
		snow: '#edf4ff',
		ice: '#9dd4ee',
		metal: '#7f8c9b',
		asphalt: '#3a3f44',
		art: '#d768aa',
		timber: '#8d613e',
		thatch: '#c9ab72',
		fire: '#f19245'
	};

	let topCanvas: HTMLCanvasElement;
	let sliceRCanvas: HTMLCanvasElement;
	let sliceQCanvas: HTMLCanvasElement;

	let seed = 0;
	let radius = 0;
	let maxY = 0;
	let totalBlocks = 0;
	let stoneColumns = 0;
	let exposedStoneColumns = 0;
	let unsupportedStoneColumns = 0;
	let ceremonialStoneColumns = 0;
	let sliceR = 0;
	let sliceQ = 0;

	let blockMap: BlockMap = new Map();
	let topByColumn: ColumnTop = new Map();
	let minQ = 0;
	let maxQ = 0;
	let minR = 0;
	let maxR = 0;

	const referenceImages = [
		'/references/stonehenge/minecraftstyle_topdown_map_of_st.png',
		'/references/stonehenge/voxelgame_architectural_sketch_o.png',
		'/references/stonehenge/minecraftstyle_stonehenge_side_e.png',
		'/references/stonehenge/minecraftstyle_stonehenge_scene_.png',
		'/references/stonehenge/minecraftstyle_prehistory_villag.png',
		'/references/stonehenge/minecraftstyle_side_cutaway_of_s.png'
	];

	function hashSeed(id: string): number {
		let h = 2166136261;
		for (let i = 0; i < id.length; i++) {
			h ^= id.charCodeAt(i);
			h = Math.imul(h, 16777619);
		}
		return Math.abs(h >>> 0);
	}

	function bkey(q: number, r: number, y: number): string {
		return `${q},${r},${y}`;
	}

	function ckey(q: number, r: number): string {
		return `${q},${r}`;
	}

	function getBlock(q: number, r: number, y: number): BlockType | null {
		return blockMap.get(bkey(q, r, y)) ?? null;
	}

	function getTopSolidY(q: number, r: number): number {
		const top = topByColumn.get(ckey(q, r));
		return top?.y ?? -1;
	}

	function analyzeTerrain(): void {
		const biome = getBiomeOrDefault('grassland-origins');
		seed = hashSeed(biome.id);
		radius = Math.max(WORLD_MIN_RADIUS, biome.radius);

		const data = generateBiomeTerrain(biome, seed);
		totalBlocks = data.blocks.length;
		blockMap = new Map();
		topByColumn = new Map();
		maxY = 0;
		minQ = Number.POSITIVE_INFINITY;
		maxQ = Number.NEGATIVE_INFINITY;
		minR = Number.POSITIVE_INFINITY;
		maxR = Number.NEGATIVE_INFINITY;

		for (const b of data.blocks) {
			blockMap.set(bkey(b.q, b.r, b.y), b.type);
			maxY = Math.max(maxY, b.y);
			minQ = Math.min(minQ, b.q);
			maxQ = Math.max(maxQ, b.q);
			minR = Math.min(minR, b.r);
			maxR = Math.max(maxR, b.r);

			const ck = ckey(b.q, b.r);
			const prev = topByColumn.get(ck);
			if (!prev || b.y > prev.y) topByColumn.set(ck, { y: b.y, type: b.type });
		}

		let stoneCols = 0;
		let exposedCols = 0;
		let unsupportedCols = 0;
		let ceremonialCols = 0;
		const checked = new Set<string>();
		for (const [k, type] of blockMap.entries()) {
			if (type !== 'stone') continue;
			const [sq, sr, sy] = k.split(',').map((v) => Number.parseInt(v, 10));
			const ck = ckey(sq, sr);
			if (checked.has(ck)) continue;
			checked.add(ck);
			stoneCols++;
			if (Math.hypot(sq, sr) <= 24) ceremonialCols++;

			let minStoneY = Number.POSITIVE_INFINITY;
			for (let y = 1; y <= maxY; y++) {
				if (getBlock(sq, sr, y) === 'stone') {
					minStoneY = y;
					break;
				}
			}
			if (!Number.isFinite(minStoneY)) continue;
			if (!getBlock(sq, sr, minStoneY - 1)) unsupportedCols++;
		}
		for (const [, top] of topByColumn.entries()) {
			if (top.type === 'stone') exposedCols++;
		}
		stoneColumns = stoneCols;
		exposedStoneColumns = exposedCols;
		unsupportedStoneColumns = unsupportedCols;
		ceremonialStoneColumns = ceremonialCols;
	}

	function drawTopdown(): void {
		const ctx = topCanvas.getContext('2d');
		if (!ctx) return;
		const width = topCanvas.width;
		const height = topCanvas.height;
		ctx.fillStyle = '#0f141c';
		ctx.fillRect(0, 0, width, height);

		const spanQ = Math.max(1, maxQ - minQ + 1);
		const spanR = Math.max(1, maxR - minR + 1);
		const cell = Math.max(1, Math.floor(Math.min(width / spanQ, height / spanR)));
		const originX = Math.floor((width - cell * spanQ) / 2);
		const originY = Math.floor((height - cell * spanR) / 2);

		for (const [ck, top] of topByColumn.entries()) {
			const [q, r] = ck.split(',').map((v) => Number.parseInt(v, 10));
			const x = originX + (q - minQ) * cell;
			const y = originY + (r - minR) * cell;
			ctx.fillStyle = TYPE_COLOR[top.type] ?? '#ffffff';
			ctx.fillRect(x, y, cell, cell);

			if (top.type === 'stone') {
				const stoneBase = (() => {
					for (let iy = 1; iy <= maxY; iy++) {
						if (getBlock(q, r, iy) === 'stone') return iy;
					}
					return -1;
				})();
				if (stoneBase > 0 && !getBlock(q, r, stoneBase - 1)) {
					ctx.fillStyle = 'rgba(255, 64, 64, 0.9)';
					ctx.fillRect(x + 1, y + 1, Math.max(1, cell - 2), Math.max(1, cell - 2));
				}
			}
		}

		ctx.strokeStyle = 'rgba(220,230,245,0.8)';
		ctx.lineWidth = 1;
		ctx.strokeRect(originX, originY, cell * spanQ, cell * spanR);
		ctx.fillStyle = '#dce6f5';
		ctx.font = '12px monospace';
		ctx.fillText('Top map (red = unsupported stone column)', 10, 20);
	}

	function drawSliceByR(): void {
		const ctx = sliceRCanvas.getContext('2d');
		if (!ctx) return;
		const width = sliceRCanvas.width;
		const height = sliceRCanvas.height;
		ctx.fillStyle = '#0f141c';
		ctx.fillRect(0, 0, width, height);

		const spanQ = Math.max(1, maxQ - minQ + 1);
		const cellW = Math.max(1, Math.floor(width / spanQ));
		const cellH = Math.max(1, Math.floor(height / Math.max(1, maxY + 1)));
		const originX = Math.floor((width - cellW * spanQ) / 2);

		for (let q = minQ; q <= maxQ; q++) {
			for (let y = 0; y <= maxY; y++) {
				const t = getBlock(q, sliceR, y);
				if (!t) continue;
				ctx.fillStyle = TYPE_COLOR[t] ?? '#fff';
				const x = originX + (q - minQ) * cellW;
				const py = height - (y + 1) * cellH;
				ctx.fillRect(x, py, cellW, cellH);
			}
		}

		ctx.fillStyle = '#dce6f5';
		ctx.font = '12px monospace';
		ctx.fillText(`Side slice by r = ${sliceR}`, 10, 20);
	}

	function drawSliceByQ(): void {
		const ctx = sliceQCanvas.getContext('2d');
		if (!ctx) return;
		const width = sliceQCanvas.width;
		const height = sliceQCanvas.height;
		ctx.fillStyle = '#0f141c';
		ctx.fillRect(0, 0, width, height);

		const spanR = Math.max(1, maxR - minR + 1);
		const cellW = Math.max(1, Math.floor(width / spanR));
		const cellH = Math.max(1, Math.floor(height / Math.max(1, maxY + 1)));
		const originX = Math.floor((width - cellW * spanR) / 2);

		for (let r = minR; r <= maxR; r++) {
			for (let y = 0; y <= maxY; y++) {
				const t = getBlock(sliceQ, r, y);
				if (!t) continue;
				ctx.fillStyle = TYPE_COLOR[t] ?? '#fff';
				const x = originX + (r - minR) * cellW;
				const py = height - (y + 1) * cellH;
				ctx.fillRect(x, py, cellW, cellH);
			}
		}

		ctx.fillStyle = '#dce6f5';
		ctx.font = '12px monospace';
		ctx.fillText(`Side slice by q = ${sliceQ}`, 10, 20);
	}

	function redraw(): void {
		drawTopdown();
		drawSliceByR();
		drawSliceByQ();
	}

	function regenerate(): void {
		analyzeTerrain();
		sliceR = 0;
		sliceQ = 0;
		redraw();
	}

	$: if (topCanvas && sliceRCanvas && sliceQCanvas) {
		redraw();
	}

	onMount(() => {
		regenerate();
	});
</script>

<svelte:head>
	<title>Stonehenge Debug</title>
</svelte:head>

<main>
	<h1>Stonehenge Debug Views</h1>
	<p>Split-view inspection endpoint for top map and side slices of the generated Stonehenge biome.</p>
	<div class="metrics">
		<div><b>Seed:</b> {seed}</div>
		<div><b>Radius:</b> {radius}</div>
		<div><b>Total blocks:</b> {totalBlocks}</div>
		<div><b>Max y:</b> {maxY}</div>
		<div><b>Stone columns:</b> {stoneColumns}</div>
		<div><b>Exposed stone columns:</b> {exposedStoneColumns}</div>
		<div><b>Ceremonial stone columns:</b> {ceremonialStoneColumns}</div>
		<div><b>Unsupported stone columns:</b> {unsupportedStoneColumns}</div>
	</div>

	<div class="controls">
		<label>Slice r: {sliceR} <input type="range" min={minR} max={maxR} bind:value={sliceR} /></label>
		<label>Slice q: {sliceQ} <input type="range" min={minQ} max={maxQ} bind:value={sliceQ} /></label>
		<button on:click={regenerate}>Regenerate</button>
	</div>

	<section class="canvases">
		<canvas bind:this={topCanvas} width="1024" height="1024"></canvas>
		<canvas bind:this={sliceRCanvas} width="1024" height="340"></canvas>
		<canvas bind:this={sliceQCanvas} width="1024" height="340"></canvas>
	</section>

	<h2>Reference Images</h2>
	<p>Generated with Nano Banana and used to map landmark shapes into block templates.</p>
	<section class="refs">
		{#each referenceImages as src}
			<figure>
				<img src={src} alt={src} loading="lazy" />
				<figcaption>{src}</figcaption>
			</figure>
		{/each}
	</section>
</main>

<style>
	main {
		padding: 16px;
		color: #e7ecf2;
		background: #0a0d12;
		min-height: 100vh;
		font-family: 'SF Mono', ui-monospace, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
	}

	h1,
	h2 {
		margin: 0 0 8px;
	}

	p {
		margin: 0 0 12px;
		color: #b8c4d3;
	}

	.metrics {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 8px;
		margin-bottom: 12px;
	}

	.metrics > div {
		padding: 8px 10px;
		background: #141a22;
		border: 1px solid #2a3748;
		border-radius: 8px;
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
		gap: 8px;
		margin-bottom: 12px;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding: 8px 10px;
		background: #141a22;
		border: 1px solid #2a3748;
		border-radius: 8px;
	}

	button {
		justify-self: start;
		padding: 10px 12px;
		border-radius: 8px;
		border: 1px solid #486285;
		background: #1b2a3f;
		color: #f4f7fc;
		cursor: pointer;
	}

	.canvases {
		display: grid;
		gap: 12px;
		margin: 12px 0 16px;
	}

	canvas {
		width: min(100%, 1024px);
		height: auto;
		border: 1px solid #2a3748;
		border-radius: 8px;
		background: #0f141c;
	}

	.refs {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(360px, 1fr));
		gap: 12px;
	}

	figure {
		margin: 0;
		padding: 8px;
		background: #141a22;
		border: 1px solid #2a3748;
		border-radius: 8px;
	}

	img {
		display: block;
		width: 100%;
		height: auto;
		border-radius: 6px;
	}

	figcaption {
		margin-top: 6px;
		font-size: 12px;
		color: #9fb0c6;
		word-break: break-all;
	}
</style>
