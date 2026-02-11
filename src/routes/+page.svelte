<script lang="ts">
	import { onMount } from 'svelte';
	import { HexWorldGame } from '$lib/game/hexWorldGame';

	let canvasEl: HTMLCanvasElement;
	let overlayEl: HTMLDivElement;
	let ctaEl: HTMLButtonElement;
	let hudEl: HTMLDivElement;
	let toastEl: HTMLDivElement;
	let crosshairEl: HTMLDivElement;
	let hotbarEl: HTMLDivElement;
	let hintEl: HTMLDivElement;

	onMount(() => {
		const game = new HexWorldGame({
			canvas: canvasEl,
			overlay: overlayEl,
			cta: ctaEl,
			hud: hudEl,
			toast: toastEl,
			crosshair: crosshairEl,
			hotbar: hotbarEl,
			hint: hintEl
		});

		game.start();
		return () => game.dispose();
	});
</script>

<svelte:head>
	<title>HexWorld</title>
</svelte:head>

<div class="hexworld-root">
	<canvas id="c" bind:this={canvasEl}></canvas>

	<div id="overlay" bind:this={overlayEl}>
		<div id="panel">
			<div id="panelHeader">
				<h1>HexWorld: Hex Blocks</h1>
				<p class="sub">Build, break, and fly across a hex-prism voxel world</p>
			</div>
			<div id="panelBody">
				<div id="kbd">
					<div class="box">
						<h2>Move</h2>
						<ul>
							<li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> strafe</li>
							<li><kbd>Space</kbd> up, <kbd>Shift</kbd> down (creative fly)</li>
							<li><kbd>Mouse</kbd> look (pointer lock)</li>
						</ul>
					</div>
					<div class="box">
						<h2>Build</h2>
						<ul>
							<li><kbd>LMB</kbd> remove block</li>
							<li><kbd>RMB</kbd> place block</li>
							<li><kbd>1</kbd>-<kbd>4</kbd> select material</li>
							<li><kbd>R</kbd> regenerate world</li>
						</ul>
					</div>
				</div>
				<div id="ctaRow">
					<button id="cta" bind:this={ctaEl}>Click to Play</button>
					<div id="hint" bind:this={hintEl}>
						If imports fail via <code>file://</code>, run:
						<code>npm run dev</code> and open <code>http://localhost:5173</code>.
					</div>
				</div>
			</div>
		</div>
	</div>

	<div id="hud" bind:this={hudEl}></div>
	<div id="toast" bind:this={toastEl}></div>
	<div id="crosshair" bind:this={crosshairEl}></div>
	<div id="hotbar" bind:this={hotbarEl}></div>
</div>

<style>
	:global(html),
	:global(body) {
		height: 100%;
		margin: 0;
		overflow: hidden;
		background:
			radial-gradient(1000px 700px at 20% 10%, #1a2b7a 0%, rgba(26, 43, 122, 0.1) 45%, rgba(7, 10, 15, 0) 60%),
			radial-gradient(900px 600px at 80% 0%, rgba(0, 174, 255, 0.22) 0%, rgba(0, 174, 255, 0) 60%),
			linear-gradient(180deg, #0c1330 0%, #070a0f 60%, #03050a 100%);
	}

	:global(*) {
		box-sizing: border-box;
	}

	.hexworld-root {
		--ink: rgba(240, 246, 255, 0.92);
		--ink-dim: rgba(240, 246, 255, 0.68);
		--danger: #ff4d6d;
		color: var(--ink);
		font-family:
			ui-sans-serif,
			system-ui,
			-apple-system,
			Segoe UI,
			Roboto,
			Helvetica,
			Arial,
			'Apple Color Emoji',
			'Segoe UI Emoji';
	}

	#c {
		display: block;
		width: 100vw;
		height: 100vh;
	}

	#overlay {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 24px;
		background: radial-gradient(800px 600px at 50% 20%, rgba(5, 8, 20, 0.72), rgba(5, 8, 20, 0.9));
		backdrop-filter: blur(8px);
	}

	#panel {
		width: min(820px, 96vw);
		border-radius: 18px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: linear-gradient(180deg, rgba(10, 14, 24, 0.9), rgba(10, 14, 24, 0.65));
		box-shadow: 0 30px 90px rgba(0, 0, 0, 0.55);
		overflow: hidden;
	}

	#panelHeader {
		padding: 18px 18px 14px;
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	#panelHeader h1 {
		margin: 0;
		font-size: 18px;
		letter-spacing: 0.2px;
		font-weight: 700;
	}

	#panelHeader .sub {
		margin: 0;
		font-size: 12px;
		color: var(--ink-dim);
	}

	#panelBody {
		padding: 16px 18px 18px;
		display: grid;
		gap: 12px;
	}

	#kbd {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
	}

	.box {
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 14px;
		padding: 12px;
	}

	.box h2 {
		margin: 0 0 8px;
		font-size: 12px;
		color: var(--ink-dim);
		font-weight: 700;
		letter-spacing: 0.3px;
		text-transform: uppercase;
	}

	ul {
		margin: 0;
		padding-left: 18px;
		font-size: 13px;
		line-height: 1.35;
	}

	li {
		margin: 6px 0;
	}

	kbd {
		font:
			12px ui-monospace,
			SFMono-Regular,
			Menlo,
			Monaco,
			Consolas,
			'Liberation Mono',
			'Courier New',
			monospace;
		background: rgba(0, 0, 0, 0.35);
		border: 1px solid rgba(255, 255, 255, 0.18);
		padding: 2px 6px;
		border-radius: 6px;
	}

	#ctaRow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-top: 2px;
	}

	#cta {
		cursor: pointer;
		border: 0;
		border-radius: 12px;
		padding: 10px 14px;
		font-weight: 800;
		color: #0b1022;
		background: linear-gradient(180deg, #ffe183, #ffc944);
		box-shadow: 0 12px 30px rgba(255, 213, 74, 0.25);
	}

	#hint {
		font-size: 12px;
		color: var(--ink-dim);
	}

	#hud {
		position: absolute;
		left: 14px;
		top: 12px;
		padding: 10px 12px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		background: rgba(10, 14, 24, 0.45);
		font:
			12px ui-monospace,
			SFMono-Regular,
			Menlo,
			Monaco,
			Consolas,
			'Liberation Mono',
			'Courier New',
			monospace;
		color: rgba(240, 246, 255, 0.86);
		user-select: none;
		pointer-events: none;
		display: none;
		min-width: 250px;
	}

	#hud :global(.row) {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		margin: 2px 0;
	}

	#hud :global(.label) {
		color: rgba(240, 246, 255, 0.66);
	}

	#hud :global(.warn) {
		color: var(--danger);
	}

	#hotbar {
		position: absolute;
		left: 50%;
		bottom: 14px;
		transform: translateX(-50%);
		display: none;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 14px;
		border: 1px solid rgba(255, 255, 255, 0.12);
		background: rgba(10, 14, 24, 0.5);
		user-select: none;
		pointer-events: none;
	}

	#hotbar :global(.slot) {
		width: 46px;
		height: 42px;
		border-radius: 12px;
		border: 1px solid rgba(255, 255, 255, 0.14);
		background: rgba(255, 255, 255, 0.05);
		display: grid;
		place-items: center;
		position: relative;
		overflow: hidden;
	}

	#hotbar :global(.slot .num) {
		position: absolute;
		left: 6px;
		top: 5px;
		font:
			11px ui-monospace,
			SFMono-Regular,
			Menlo,
			Monaco,
			Consolas,
			'Liberation Mono',
			'Courier New',
			monospace;
		color: rgba(240, 246, 255, 0.6);
	}

	#hotbar :global(.slot .swatch) {
		width: 22px;
		height: 22px;
		border-radius: 7px;
		border: 1px solid rgba(255, 255, 255, 0.18);
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.35);
	}

	#hotbar :global(.slot.active) {
		border-color: rgba(255, 213, 74, 0.75);
		box-shadow: 0 0 0 2px rgba(255, 213, 74, 0.2);
		background: rgba(255, 213, 74, 0.1);
	}

	#crosshair {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 18px;
		height: 18px;
		margin-left: -9px;
		margin-top: -9px;
		pointer-events: none;
		display: none;
	}

	#crosshair::before,
	#crosshair::after {
		content: '';
		position: absolute;
		left: 50%;
		top: 50%;
		background: rgba(240, 246, 255, 0.7);
		border-radius: 2px;
		transform: translate(-50%, -50%);
		box-shadow: 0 0 18px rgba(255, 255, 255, 0.18);
	}

	#crosshair::before {
		width: 2px;
		height: 18px;
	}

	#crosshair::after {
		width: 18px;
		height: 2px;
	}

	#toast {
		position: absolute;
		left: 50%;
		top: 16px;
		transform: translateX(-50%);
		padding: 8px 12px;
		border-radius: 999px;
		border: 1px solid rgba(255, 255, 255, 0.2);
		background: rgba(11, 17, 35, 0.72);
		color: rgba(245, 250, 255, 0.95);
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.1px;
		display: none;
		pointer-events: none;
	}

	@media (max-width: 760px) {
		#kbd {
			grid-template-columns: 1fr;
		}
		#panel {
			width: 96vw;
		}
		#ctaRow {
			flex-direction: column;
			align-items: flex-start;
		}
	}
</style>
