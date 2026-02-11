import * as THREE from 'three';
import {
	BLOCK_H,
	EPS,
	HEX_RADIUS,
	LOOK_SENS,
	MAX_Y,
	PALETTE,
	STEP_ACROSS_SIDE,
	WORLD_RADIUS
} from './constants';
import { HexWorldAudio } from './audio';
import { axialToWorld, fbm, hash2, hexDist, worldToAxial } from './hex';
import { loadTexture } from './texture';
import type {
	BlockMaterialMap,
	BlockType,
	BlockUserData,
	GameStatePayload,
	InspectConfig,
	HexWorldElements
} from './types';
import { buildHotbar, updateHotbar } from './ui';
import { World, type BlockMesh } from './world';

interface PickHit extends THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> {
	object: BlockMesh;
	face: THREE.Face;
	worldNormal: THREE.Vector3;
}

interface NeighborCell {
	q: number;
	r: number;
	y: number;
}

interface TextureRefs {
	grassTop: THREE.Texture | null;
	grassSide: THREE.Texture | null;
}

interface KeyState {
	w: boolean;
	a: boolean;
	s: boolean;
	d: boolean;
	space: boolean;
	shift: boolean;
}

interface DisposeBag {
	dispose(): void;
}

const TEXTURE_PATHS = {
	grass_top: '/textures/grass_top.png',
	grass_side: '/textures/grass_side.png',
	dirt: '/textures/dirt.png',
	stone: '/textures/stone.png',
	sand: '/textures/sand.png'
} as const;

export class HexWorldGame implements DisposeBag {
	private readonly scene: THREE.Scene;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly yawObject = new THREE.Object3D();
	private readonly pitchObject = new THREE.Object3D();
	private readonly blockGroup = new THREE.Group();
	private readonly raycaster = new THREE.Raycaster();
	private readonly rayCenter = new THREE.Vector2(0, 0);
	private readonly tmpMat3 = new THREE.Matrix3();
	private readonly tmpVec3 = new THREE.Vector3();

	private readonly geoBlock: THREE.CylinderGeometry;
	private readonly mats: BlockMaterialMap;
	private readonly world: World;
	private readonly audio = new HexWorldAudio();
	private readonly texRefs: TextureRefs = { grassTop: null, grassSide: null };

	private readonly highlight: BlockMesh;
	private readonly inspect: InspectConfig;
	private readonly urlParams: URLSearchParams;

	private readonly keys: KeyState = {
		w: false,
		a: false,
		s: false,
		d: false,
		space: false,
		shift: false
	};

	private selectedPaletteIdx = 0;
	private menuOpen = false;
	private pointerLocked = false;
	private speed = 8.5;
	private fast = false;
	private lastToastAt = 0;
	private inspectAngle = 0;
	private disposed = false;
	private animationFrame = 0;
	private frame = 0;
	private fps = 0;
	private lastFpsT = performance.now();
	private lastT = performance.now();

	private readonly handlers: Array<() => void> = [];

	constructor(private readonly el: HexWorldElements) {
		this.urlParams = this.readUrlParams();
		this.inspect = this.readInspectConfig(this.urlParams);
		this.inspectAngle = this.inspect.angle0;

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x97b6d3);
		this.scene.fog = new THREE.FogExp2(0x9db6d2, 0.03);

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.el.canvas,
			antialias: true,
			powerPreference: 'high-performance'
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.setSize(window.innerWidth, window.innerHeight, false);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;

		this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 500);
		this.pitchObject.add(this.camera);
		this.yawObject.add(this.pitchObject);
		this.scene.add(this.yawObject);

		this.initLights();
		this.scene.add(this.blockGroup);

		this.geoBlock = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, BLOCK_H, 6, 1, false);
		this.geoBlock.rotateY(Math.PI / 6);

		const matDirt = new THREE.MeshStandardMaterial({ color: 0x7a5c3a, roughness: 0.98, metalness: 0 });
		const matGrassTop = new THREE.MeshStandardMaterial({ color: 0x3aa35b, roughness: 0.92, metalness: 0 });
		const matGrassSide = new THREE.MeshStandardMaterial({ color: 0x6e5a3f, roughness: 0.95, metalness: 0 });
		const matStone = new THREE.MeshStandardMaterial({ color: 0x8c9098, roughness: 0.92, metalness: 0 });
		const matSand = new THREE.MeshStandardMaterial({ color: 0xe8d9a6, roughness: 0.95, metalness: 0 });

		this.mats = {
			grass: [matGrassSide, matGrassTop, matDirt],
			dirt: [matDirt, matDirt, matDirt],
			stone: [matStone, matStone, matStone],
			sand: [matSand, matSand, matSand]
		};

		this.world = new World(this.blockGroup, this.geoBlock, this.mats);

		const highlightMat = new THREE.MeshBasicMaterial({
			color: 0xffd54a,
			wireframe: true,
			transparent: true,
			opacity: 0.9
		});
		this.highlight = new THREE.Mesh(this.geoBlock, highlightMat);
		this.highlight.visible = false;
		this.scene.add(this.highlight);

		this.raycaster.far = 18;
		buildHotbar(this.el.hotbar, PALETTE);
		updateHotbar(this.el.hotbar, this.selectedPaletteIdx);

		this.installGlobalHooks();
		this.bindEvents();
		this.loadTextures();

		if (this.inspect.enabled) {
			this.setupInspect();
			this.enterInspectUiMode();
		} else {
			this.generateWorld();
			this.setMenu(false);
			this.showToast('Click to capture mouse. LMB remove, RMB place. 1-4 selects.', 3200);
		}
	}

	start(): void {
		this.animate();
	}

	dispose(): void {
		this.disposed = true;
		cancelAnimationFrame(this.animationFrame);
		for (const off of this.handlers) off();
		this.handlers.length = 0;

		delete window.render_game_to_text;
		delete window.advanceTime;
		delete window.hexworld_set_inspect_angle;

		this.world.clear();
		this.renderer.dispose();
		this.geoBlock.dispose();
	}

	private initLights(): void {
		const hemi = new THREE.HemisphereLight(0xe6f0ff, 0x95a6bf, 1.18);
		this.scene.add(hemi);

		const sun = new THREE.DirectionalLight(0xffffff, 0.95);
		sun.position.set(18, 30, 10);
		this.scene.add(sun);

		const fill = new THREE.DirectionalLight(0xd8e8ff, 0.88);
		fill.position.set(-16, 18, -20);
		this.scene.add(fill);
	}

	private readUrlParams(): URLSearchParams {
		let params: URLSearchParams;
		try {
			params = new URLSearchParams(window.location.search);
		} catch {
			params = new URLSearchParams();
		}
		return params;
	}

	private readInspectConfig(params: URLSearchParams): InspectConfig {
		return {
			enabled: params.get('inspect') === '1',
			type: (params.get('type') || 'grass').toLowerCase(),
			angle0: Number.parseFloat(params.get('angle') || '0') || 0,
			spin: params.get('spin') === '1',
			ui: params.get('ui') === '1',
			distance: Number.parseFloat(params.get('dist') || '4.8') || 4.8,
			height: Number.parseFloat(params.get('height') || '2.4') || 2.4
		};
	}

	private installGlobalHooks(): void {
		window.advanceTime = (ms: number) => {
			const dt = Math.max(1, Number(ms) || 0) / 1000;
			this.lastT += ms;
			this.stepGame(Math.min(0.05, dt), this.lastT);
		};

		window.render_game_to_text = () => {
			const payload: GameStatePayload = {
				mode: this.inspect.enabled ? 'inspect' : this.menuOpen ? 'menu' : 'play',
				muted: this.audio.isMuted(),
				selected: PALETTE[this.selectedPaletteIdx]?.key ?? null,
				blocks: this.world.blocks.size
			};

			if (this.inspect.enabled) {
				payload.inspect = {
					type: this.normalizeBlockType(this.inspect.type),
					angle: this.inspectAngle,
					spin: this.inspect.spin
				};
			}

			return JSON.stringify(payload);
		};

		window.hexworld_set_inspect_angle = (deg: number) => {
			this.inspectAngle = Number(deg) || 0;
			this.applyInspectCamera(this.inspectAngle);
		};
	}

	private bindEvents(): void {
		const add = (
			target: EventTarget,
			type: string,
			handler: EventListenerOrEventListenerObject,
			opts?: AddEventListenerOptions | boolean
		): void => {
			target.addEventListener(type, handler, opts);
			this.handlers.push(() => target.removeEventListener(type, handler, opts));
		};

		add(document, 'pointerlockchange', () => {
			this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
			this.updateMouseCursor();
			if (!this.pointerLocked && !this.menuOpen) {
				this.showToast('Mouse unlocked. Click to re-lock.', 1800);
			}
		});

		add(window, 'resize', () => this.onResize());
		add(window, 'contextmenu', (e) => e.preventDefault());

		add(this.el.cta, 'click', () => this.startGame());
		add(this.el.overlay, 'click', (e) => {
			if (e.target === this.el.overlay) this.startGame();
		});
		add(this.renderer.domElement, 'click', () => {
			if (!this.inspect.enabled && !this.menuOpen && !this.pointerLocked) this.lockPointer();
		});

		add(document, 'mousemove', (e) => {
			if (this.menuOpen || !this.pointerLocked) return;
			const me = e as MouseEvent;
			this.yawObject.rotation.y -= me.movementX * LOOK_SENS;
			this.pitchObject.rotation.x -= me.movementY * LOOK_SENS;
			this.pitchObject.rotation.x = Math.max(
				-Math.PI / 2 + 0.02,
				Math.min(Math.PI / 2 - 0.02, this.pitchObject.rotation.x)
			);
		});

		add(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
		add(window, 'keyup', (e) => this.onKeyUp(e as KeyboardEvent));
		add(window, 'mousedown', (e) => this.onMouseDown(e as MouseEvent));

		if (this.urlParams.get('mute') === '1') {
			this.audio.setMuted(true);
		}
	}

	private async loadTextures(): Promise<void> {
		const loader = new THREE.TextureLoader();
		const [tGrassTop, tGrassSide, tDirt, tStone, tSand] = await Promise.all([
			loadTexture(this.renderer, loader, TEXTURE_PATHS.grass_top, {
				wrapS: THREE.RepeatWrapping,
				wrapT: THREE.RepeatWrapping
			}),
			loadTexture(this.renderer, loader, TEXTURE_PATHS.grass_side, {
				wrapS: THREE.RepeatWrapping,
				wrapT: THREE.ClampToEdgeWrapping,
				minFilter: THREE.LinearFilter,
				magFilter: THREE.LinearFilter,
				generateMipmaps: false
			}),
			loadTexture(this.renderer, loader, TEXTURE_PATHS.dirt),
			loadTexture(this.renderer, loader, TEXTURE_PATHS.stone),
			loadTexture(this.renderer, loader, TEXTURE_PATHS.sand)
		]).catch((err: unknown) => {
			console.warn('Texture load failed:', err);
			this.showToast('Textures failed to load.', 2800);
			return [null, null, null, null, null] as const;
		});

		const [matGrassSide, matGrassTop, matDirt] = this.mats.grass as THREE.MeshStandardMaterial[];
		const [matStone] = this.mats.stone as THREE.MeshStandardMaterial[];
		const [matSand] = this.mats.sand as THREE.MeshStandardMaterial[];

		if (tGrassTop) {
			matGrassTop.map = tGrassTop;
			this.texRefs.grassTop = tGrassTop;
		}
		if (tGrassSide) {
			matGrassSide.map = tGrassSide;
			this.texRefs.grassSide = tGrassSide;
		}
		if (tDirt) matDirt.map = tDirt;
		if (tStone) matStone.map = tStone;
		if (tSand) matSand.map = tSand;

		for (const mat of [matGrassTop, matGrassSide, matDirt, matStone, matSand]) {
			mat.color.set(0xffffff);
			mat.needsUpdate = true;
		}
	}

	private generateWorld(): void {
		this.world.clear();

		const start = axialToWorld(0, 0);
		this.yawObject.position.set(start.x, 10, start.z);
		this.yawObject.rotation.set(0, 0, 0);
		this.pitchObject.rotation.set(0, 0, 0);

		const seedQ = Math.floor(Math.random() * 10000) - 5000;
		const seedR = Math.floor(Math.random() * 10000) - 5000;

		for (let q = -WORLD_RADIUS; q <= WORLD_RADIUS; q++) {
			for (let r = -WORLD_RADIUS; r <= WORLD_RADIUS; r++) {
				const d = hexDist(0, 0, q, r);
				if (d > WORLD_RADIUS) continue;

				const falloff = Math.max(0, 1 - d / (WORLD_RADIUS + 0.001));
				const n = fbm(q + seedQ, r + seedR);
				const ridge = Math.pow(Math.abs(n - 0.5) * 2, 0.65);
				const hRaw = (0.35 + 0.65 * n) * (1 - 0.25 * ridge);
				let h = 1 + Math.floor(falloff * (3 + hRaw * 9));
				h = Math.max(1, Math.min(h, 12));

				const sandy = falloff < 0.35 && hash2(q * 2 + seedQ, r * 2 + seedR) > 0.45;

				for (let y = 0; y < h; y++) {
					const top = y === h - 1;
					const deep = y < h - 3;
					let typeKey: BlockType = 'dirt';
					if (deep) typeKey = 'stone';
					else if (top) typeKey = sandy ? 'sand' : 'grass';
					else typeKey = sandy ? 'sand' : 'dirt';
					this.world.add(q, r, y, typeKey);
				}
			}
		}

		for (let y = 1; y <= 7; y++) this.world.add(0, 0, y, 'stone');
		this.world.add(0, 0, 8, 'grass');
	}

	private setupInspect(): void {
		this.world.clear();
		const t = this.normalizeBlockType(this.inspect.type);
		this.world.add(0, 0, 0, t);
		this.scene.fog = null;
		this.applyInspectCamera(this.inspectAngle);
	}

	private normalizeBlockType(type: string): BlockType {
		if (type === 'grass' || type === 'dirt' || type === 'stone' || type === 'sand') return type;
		return 'grass';
	}

	private applyInspectCamera(angleDeg: number): void {
		const a = (angleDeg * Math.PI) / 180;
		const cx = Math.cos(a) * this.inspect.distance;
		const cz = Math.sin(a) * this.inspect.distance;
		const cy = this.inspect.height;
		this.yawObject.position.set(cx, cy, cz);

		const tx = 0;
		const ty = 0.5 * BLOCK_H;
		const tz = 0;
		const dx = tx - cx;
		const dy = ty - cy;
		const dz = tz - cz;
		const len = Math.max(EPS, Math.hypot(dx, dy, dz));
		const ndx = dx / len;
		const ndy = dy / len;
		const ndz = dz / len;

		const pitch = Math.asin(Math.max(-1, Math.min(1, ndy)));
		const yaw = Math.atan2(-ndx, -ndz);
		this.yawObject.rotation.y = yaw;
		this.pitchObject.rotation.x = pitch;
	}

	private onKeyDown(e: KeyboardEvent): void {
		if (e.code === 'Escape') {
			if (!this.menuOpen) {
				this.setMenu(true);
				if (document.pointerLockElement) void document.exitPointerLock();
			} else {
				this.startGame();
			}
			return;
		}

		if (e.code === 'Enter' && this.menuOpen) {
			this.startGame();
			return;
		}

		if (this.menuOpen) return;

		if (e.code === 'KeyM') {
			const muted = this.audio.toggleMuted();
			this.showToast(muted ? 'Sound: muted' : 'Sound: on', 900);
			return;
		}

		this.setKey(e.code, true);

		if (e.code === 'KeyR') {
			if (this.inspect.enabled) {
				this.setupInspect();
				this.showToast('Inspect reset');
			} else {
				this.generateWorld();
				this.showToast('World regenerated');
			}
		}
		if (e.code === 'KeyF') {
			this.fast = !this.fast;
			this.showToast(this.fast ? 'Speed: FAST' : 'Speed: normal');
		}

		if (e.code.startsWith('Digit')) {
			const n = Number(e.code.replace('Digit', ''));
			if (n >= 1 && n <= PALETTE.length) {
				this.selectedPaletteIdx = n - 1;
				updateHotbar(this.el.hotbar, this.selectedPaletteIdx);
				this.showToast(`Selected: ${PALETTE[this.selectedPaletteIdx].label}`, 900);
			}
		}
	}

	private onKeyUp(e: KeyboardEvent): void {
		this.setKey(e.code, false);
	}

	private setKey(code: string, down: boolean): void {
		switch (code) {
			case 'KeyW':
				this.keys.w = down;
				break;
			case 'KeyA':
				this.keys.a = down;
				break;
			case 'KeyS':
				this.keys.s = down;
				break;
			case 'KeyD':
				this.keys.d = down;
				break;
			case 'Space':
				this.keys.space = down;
				break;
			case 'ShiftLeft':
			case 'ShiftRight':
				this.keys.shift = down;
				break;
		}
	}

	private onMouseDown(e: MouseEvent): void {
		if (this.menuOpen || this.inspect.enabled) return;
		if (e.button !== 0 && e.button !== 2) return;
		if (!this.pointerLocked) {
			this.lockPointer();
			return;
		}

		const hit = this.pickBlock();
		if (!hit) return;

		if (e.button === 0) this.removeSelected(hit);
		else this.placeAdjacent(hit, hit.worldNormal);
	}

	private removeSelected(hit: PickHit): void {
		const ud = hit.object.userData as BlockUserData;
		if (!ud?.isBlock) return;
		if (this.world.remove(ud.q, ud.r, ud.y)) {
			this.audio.playBreak(ud.typeKey ?? 'dirt');
		}
	}

	private placeAdjacent(hit: PickHit, worldNormal: THREE.Vector3): void {
		const n = this.neighborForPlacement(hit, worldNormal);
		if (n.y < 0 || n.y > MAX_Y) return;
		if (this.world.has(n.q, n.r, n.y)) return;
		const typeKey = PALETTE[this.selectedPaletteIdx]?.key ?? 'dirt';
		if (this.world.add(n.q, n.r, n.y, typeKey)) {
			this.audio.playPlace(typeKey);
		}
	}

	private neighborForPlacement(hit: PickHit, worldNormal: THREE.Vector3): NeighborCell {
		const ud = hit.object.userData as BlockUserData;
		const q = ud.q | 0;
		const r = ud.r | 0;
		const y = ud.y | 0;

		if (Math.abs(worldNormal.y) > 0.85) {
			return { q, r, y: y + (worldNormal.y > 0 ? 1 : -1) };
		}

		this.tmpVec3.set(worldNormal.x, 0, worldNormal.z);
		if (this.tmpVec3.lengthSq() < 1e-6) return { q, r, y };
		this.tmpVec3.normalize().multiplyScalar(STEP_ACROSS_SIDE * 0.98);
		const cx = hit.object.position.x + this.tmpVec3.x;
		const cz = hit.object.position.z + this.tmpVec3.z;
		const ax = worldToAxial(cx, cz);
		return { q: ax.q, r: ax.r, y };
	}

	private pickBlock(): PickHit | null {
		this.raycaster.setFromCamera(this.rayCenter, this.camera);
		const hits = this.raycaster.intersectObjects(this.blockGroup.children, false);
		if (!hits.length) return null;
		const first = hits[0] as PickHit;
		if (!first.face) return null;

		this.tmpMat3.getNormalMatrix(first.object.matrixWorld);
		first.worldNormal = first.face.normal.clone().applyMatrix3(this.tmpMat3).normalize();
		return first;
	}

	private updateHighlight(): PickHit | null {
		if (this.inspect.enabled) {
			this.highlight.visible = false;
			return null;
		}
		const hit = this.pickBlock();
		if (!hit) {
			this.highlight.visible = false;
			return null;
		}
		this.highlight.visible = true;
		this.highlight.position.copy(hit.object.position);
		this.highlight.rotation.copy(hit.object.rotation);
		this.highlight.scale.setScalar(1.03);
		return hit;
	}

	private currentAxialUnderPlayer(): { q: number; r: number } {
		return worldToAxial(this.yawObject.position.x, this.yawObject.position.z);
	}

	private stepGame(dt: number, nowMs: number): void {
		if (this.inspect.enabled) {
			if (this.inspect.spin) {
				this.inspectAngle = (this.inspect.angle0 + nowMs * 0.012) % 360;
				this.applyInspectCamera(this.inspectAngle);
			}
		} else if (!this.menuOpen) {
			const s = (this.fast ? 2.2 : 1.0) * this.speed * dt;
			if (this.keys.w) this.yawObject.translateZ(-s);
			if (this.keys.s) this.yawObject.translateZ(s);
			if (this.keys.a) this.yawObject.translateX(-s);
			if (this.keys.d) this.yawObject.translateX(s);
			if (this.keys.space) this.yawObject.position.y += s;
			if (this.keys.shift) this.yawObject.position.y -= s;
			this.yawObject.position.y = Math.max(0.5, Math.min(120, this.yawObject.position.y));
		}

		const hit = this.updateHighlight();

		this.frame++;
		if (nowMs - this.lastFpsT > 400) {
			this.fps = Math.round((this.frame * 1000) / (nowMs - this.lastFpsT));
			this.frame = 0;
			this.lastFpsT = nowMs;
		}

		this.updateHud(hit);
		this.updateGrassAnimation(nowMs);
		this.renderer.render(this.scene, this.camera);
	}

	private updateHud(hit: PickHit | null): void {
		if (this.inspect.enabled) {
			if (!this.inspect.ui) return;
			this.el.hud.innerHTML = `
				<div class="row"><span class="label">mode</span><span>inspect</span></div>
				<div class="row"><span class="label">type</span><span>${this.normalizeBlockType(this.inspect.type)}</span></div>
				<div class="row"><span class="label">angle</span><span>${this.inspectAngle.toFixed(1)} deg</span></div>
			`;
			return;
		}
		if (this.menuOpen) return;

		const ax = this.currentAxialUnderPlayer();
		const sel = PALETTE[this.selectedPaletteIdx];
		const hitStr = hit
			? `hit q=${(hit.object.userData as BlockUserData).q} r=${(hit.object.userData as BlockUserData).r} y=${(hit.object.userData as BlockUserData).y}`
			: 'hit -';

		this.el.hud.innerHTML = `
			<div class="row"><span class="label">fps</span><span>${this.fps}</span></div>
			<div class="row"><span class="label">pos</span><span>${this.yawObject.position.x.toFixed(2)}, ${this.yawObject.position.y.toFixed(2)}, ${this.yawObject.position.z.toFixed(2)}</span></div>
			<div class="row"><span class="label">cell</span><span>q=${ax.q} r=${ax.r}</span></div>
			<div class="row"><span class="label">blocks</span><span>${this.world.blocks.size}</span></div>
			<div class="row"><span class="label">tool</span><span>${sel.label} (${sel.key})</span></div>
			<div class="row"><span class="label">pick</span><span>${hitStr}</span></div>
			<div class="row"><span class="label">sound</span><span>${this.audio.isMuted() ? '<span class="warn">muted</span>' : 'on'} (<span class="warn">M</span>)</span></div>
			<div class="row"><span class="label">hint</span><span><span class="warn">LMB</span> remove, <span class="warn">RMB</span> place, <span class="warn">F</span> speed</span></div>
		`;
	}

	private updateGrassAnimation(nowMs: number): void {
		const t = nowMs * 0.001;
		if (this.texRefs.grassTop) {
			this.texRefs.grassTop.offset.x = 0.007 * Math.sin(t * 0.45);
			this.texRefs.grassTop.offset.y = 0.005 * Math.cos(t * 0.39);
		}
		if (this.texRefs.grassSide) {
			this.texRefs.grassSide.offset.x = 0.01 * Math.sin(t * 0.65 + 0.8);
		}
	}

	private animate = (): void => {
		if (this.disposed) return;
		this.animationFrame = requestAnimationFrame(this.animate);
		const now = performance.now();
		const dt = Math.min(0.05, (now - this.lastT) / 1000);
		this.lastT = now;
		this.stepGame(dt, now);
	};

	private startGame(): void {
		if (this.inspect.enabled) return;
		this.setMenu(false);
		this.lockPointer();
	}

	private lockPointer(): void {
		if (this.inspect.enabled) return;
		if (document.pointerLockElement) return;
		void this.renderer.domElement.requestPointerLock();
	}

	private setMenu(open: boolean): void {
		this.menuOpen = open;
		this.el.overlay.style.display = open ? 'grid' : 'none';
		this.el.hud.style.display = open ? 'none' : 'block';
		this.el.hotbar.style.display = open ? 'none' : 'flex';
		this.el.crosshair.style.display = open ? 'none' : 'block';
		this.updateMouseCursor();
		if (open) {
			for (const k of Object.keys(this.keys) as Array<keyof KeyState>) {
				this.keys[k] = false;
			}
		}
	}

	private enterInspectUiMode(): void {
		this.setMenu(false);
		if (!this.inspect.ui) {
			this.el.hud.style.display = 'none';
			this.el.hotbar.style.display = 'none';
			this.el.crosshair.style.display = 'none';
			this.el.toast.style.display = 'none';
		}
	}

	private showToast(msg: string, ms = 1800): void {
		const now = performance.now();
		this.lastToastAt = now;
		this.el.toast.textContent = msg;
		this.el.toast.style.display = 'block';
		window.setTimeout(() => {
			if (performance.now() - this.lastToastAt >= ms - 20) {
				this.el.toast.style.display = 'none';
			}
		}, ms);
	}

	private updateMouseCursor(): void {
		this.el.canvas.style.cursor = this.pointerLocked && !this.menuOpen ? 'none' : 'default';
	}

	private onResize(): void {
		const w = window.innerWidth;
		const h = window.innerHeight;
		this.camera.aspect = w / h;
		this.camera.updateProjectionMatrix();
		this.renderer.setSize(w, h, false);
	}
}

declare global {
	interface Window {
		render_game_to_text?: () => string;
		advanceTime?: (ms: number) => void;
		hexworld_set_inspect_angle?: (deg: number) => void;
	}
}
