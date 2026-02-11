import * as THREE from 'three';
import {
	BLOCK_H,
	EPS,
	HEX_RADIUS,
	MAX_Y,
	PALETTE,
	PLAYER_MOVE_SPEED,
	STEP_ACROSS_SIDE,
	WORLD_MIN_RADIUS
} from './constants';
import { HexWorldAudio } from './audio';
import { createBlockMaterials, loadBlockTextures, updateNatureTextureAnimation } from './blocks';
import { BiomeManager } from './biomeManager';
import { axialToWorld, worldToAxial } from './hex';
import { InputController } from './input';
import { normalizeInspectBlockType, readInspectConfig, readUrlParams } from './inspect';
import type {
	BlockMaterialMap,
	BlockType,
	BlockUserData,
	GameStatePayload,
	HexWorldElements,
	InspectConfig,
	NpcInstance,
	PortalInstance,
	QuizQuestion,
	WeatherKind,
	BiomeManifest
} from './types';
import { buildHotbar, setHudRows, updateHotbar } from './ui';
import { World, type BlockMesh } from './world';
import { FirstPersonCameraController } from './camera';

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

interface DisposeBag {
	dispose(): void;
}

const WEATHER_LABEL: Record<WeatherKind, string> = {
	clear: 'Clear',
	rain: 'Rain',
	snow: 'Snow',
	mist: 'Mist'
};

const FORBIDDEN_BREAK_BLOCKS = new Set<BlockType>(['bedrock']);

export class HexWorldGame implements DisposeBag {
	private readonly scene: THREE.Scene;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly cameraCtrl: FirstPersonCameraController;

	private readonly blockGroup = new THREE.Group();
	private readonly portalGroup = new THREE.Group();
	private readonly npcGroup = new THREE.Group();
	private readonly raycaster = new THREE.Raycaster();
	private readonly rayCenter = new THREE.Vector2(0, 0);
	private readonly tmpMat3 = new THREE.Matrix3();
	private readonly tmpVec3 = new THREE.Vector3();

	private readonly geoBlock: THREE.CylinderGeometry;
	private readonly mats: BlockMaterialMap;
	private readonly world: World;
	private readonly audio = new HexWorldAudio();
	private readonly input = new InputController();
	private readonly biomeManager = new BiomeManager();

	private readonly highlight: BlockMesh;
	private readonly inspect: InspectConfig;
	private readonly urlParams: URLSearchParams;

	private readonly hemiLight: THREE.HemisphereLight;
	private readonly sunLight: THREE.DirectionalLight;
	private readonly fillLight: THREE.DirectionalLight;

	private weatherParticles: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
	private weatherVelocity = new Float32Array(0);

	private portals: PortalInstance[] = [];
	private npcs: NpcInstance[] = [];
	private currentBiome: BiomeManifest | null = null;
	private currentWeather: WeatherKind = 'clear';
	private portalHint = '';

	private selectedPaletteIdx = 0;
	private menuOpen = false;
	private pointerLocked = false;
	private fast = false;
	private quizOpen = false;
	private bootstrapDone = false;
	private lastToastAt = 0;
	private inspectAngle = 0;
	private disposed = false;
	private animationFrame = 0;
	private frame = 0;
	private fps = 0;
	private lastFpsT = performance.now();
	private lastT = performance.now();
	private dayProgress = 0.18;
	private nextWeatherSwitchAtMs = 0;

	private activeQuizQuestion: QuizQuestion | null = null;
	private activeQuizPortal: PortalInstance | null = null;

	private readonly handlers: Array<() => void> = [];

	constructor(private readonly el: HexWorldElements) {
		this.urlParams = readUrlParams();
		this.inspect = readInspectConfig(this.urlParams);
		this.inspectAngle = this.inspect.angle0;

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x97b6d3);
		this.scene.fog = new THREE.FogExp2(0x9db6d2, 0.02);

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.el.canvas,
			antialias: true,
			powerPreference: 'high-performance'
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.setSize(window.innerWidth, window.innerHeight, false);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = false;

		this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 900);
		this.cameraCtrl = new FirstPersonCameraController(this.camera);
		this.scene.add(this.cameraCtrl.yawObject);

		this.hemiLight = new THREE.HemisphereLight(0xe6f0ff, 0x95a6bf, 1.1);
		this.scene.add(this.hemiLight);
		this.sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
		this.sunLight.position.set(20, 32, 12);
		this.scene.add(this.sunLight);
		this.fillLight = new THREE.DirectionalLight(0xd8e8ff, 0.7);
		this.fillLight.position.set(-16, 18, -20);
		this.scene.add(this.fillLight);

		this.scene.add(this.blockGroup, this.portalGroup, this.npcGroup);

		this.geoBlock = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, BLOCK_H, 6, 1, false);
		this.geoBlock.rotateY(Math.PI / 6);
		this.mats = createBlockMaterials();
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
		void this.bootstrap();
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
		delete window.hexworld_debug_action;

		this.world.clear();
		this.renderer.dispose();
		this.geoBlock.dispose();
	}

	private async bootstrap(): Promise<void> {
		try {
			await loadBlockTextures(this.renderer, this.mats);
		} catch (err) {
			console.warn('Texture load failed:', err);
			this.showToast('Some textures failed to load.', 2800);
		}

		if (this.inspect.enabled) {
			this.setupInspect();
			this.enterInspectUiMode();
			this.bootstrapDone = true;
			return;
		}

		let initialBiomeId = this.biomeManager.loadSave();
		if (!initialBiomeId) initialBiomeId = 'grassland-origins';
		this.loadBiome(initialBiomeId, false);

		this.setMenu(false);
		this.bootstrapDone = true;
		this.showToast('Click to capture mouse. E near a portal to travel.', 3600);
	}

	private installGlobalHooks(): void {
		window.advanceTime = (ms: number) => {
			const dt = Math.max(1, Number(ms) || 0) / 1000;
			this.lastT += ms;
			this.stepGame(Math.min(0.05, dt), this.lastT);
		};

		window.render_game_to_text = () => {
			const ax = this.currentAxialUnderPlayer();
			const payload: GameStatePayload = {
				mode: this.inspect.enabled ? 'inspect' : this.quizOpen ? 'quiz' : this.menuOpen ? 'menu' : 'play',
				muted: this.audio.isMuted(),
				selected: PALETTE[this.selectedPaletteIdx]?.key ?? null,
				blocks: this.world.blocks.size,
				biomeId: this.currentBiome?.id,
				weather: this.currentWeather,
				timeOfDay: this.getClockString(),
				position: {
					x: this.cameraCtrl.yawObject.position.x,
					y: this.cameraCtrl.state.feetY,
					z: this.cameraCtrl.yawObject.position.z
				},
				cell: {
					q: ax.q,
					r: ax.r
				}
			};

			if (this.inspect.enabled) {
				payload.inspect = {
					type: normalizeInspectBlockType(this.inspect.type),
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

		window.hexworld_debug_action = (action: string) => {
			if (action === 'regen') {
				if (this.currentBiome && !this.inspect.enabled) this.loadBiome(this.currentBiome.id, false);
				return true;
			}
			if (action === 'place_center') {
				const hit = this.pickBlock();
				if (!hit) return false;
				this.placeAdjacent(hit, hit.worldNormal);
				return true;
			}
			if (action === 'remove_center') {
				const hit = this.pickBlock();
				if (!hit) return false;
				this.removeSelected(hit);
				return true;
			}
			if (action === 'place_under_player') {
				const ax = this.currentAxialUnderPlayer();
				const y = this.world.getTopSolidY(ax.q, ax.r) + 1;
				const typeKey = PALETTE[this.selectedPaletteIdx]?.key ?? 'dirt';
				if (!this.world.has(ax.q, ax.r, y) && this.world.add(ax.q, ax.r, y, typeKey)) {
					this.biomeManager.recordEdit(ax.q, ax.r, y, typeKey);
					if (this.currentBiome) this.biomeManager.saveCurrentState(this.currentBiome.id);
					return true;
				}
				return false;
			}
			if (action === 'remove_top_under_player') {
				const ax = this.currentAxialUnderPlayer();
				const y = this.world.getTopSolidY(ax.q, ax.r);
				const t = this.world.getType(ax.q, ax.r, y);
				if (!t || FORBIDDEN_BREAK_BLOCKS.has(t)) return false;
				if (this.world.remove(ax.q, ax.r, y)) {
					this.biomeManager.recordEdit(ax.q, ax.r, y, null);
					if (this.currentBiome) this.biomeManager.saveCurrentState(this.currentBiome.id);
					return true;
				}
				return false;
			}
			if (action === 'answer_quiz_correct') {
				if (!this.activeQuizQuestion) return false;
				this.answerQuiz(this.activeQuizQuestion.correctIndex);
				return true;
			}
			return false;
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
			if (!this.pointerLocked && !this.menuOpen && !this.quizOpen && !this.inspect.enabled) {
				this.showToast('Mouse unlocked. Click to re-lock.', 1400);
			}
		});

		add(window, 'resize', () => this.onResize());
		add(window, 'contextmenu', (e) => e.preventDefault());

		add(this.el.cta, 'click', () => this.startGame());
		add(this.el.overlay, 'click', (e) => {
			if (e.target === this.el.overlay) this.startGame();
		});
		add(this.renderer.domElement, 'click', () => {
			if (!this.inspect.enabled && !this.menuOpen && !this.quizOpen && !this.pointerLocked) this.lockPointer();
		});

		add(document, 'mousemove', (e) => {
			if (this.menuOpen || this.quizOpen || !this.pointerLocked) return;
			const me = e as MouseEvent;
			this.cameraCtrl.rotateByMouse(me.movementX, me.movementY);
		});

		add(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
		add(window, 'keyup', (e) => this.onKeyUp(e as KeyboardEvent));
		add(window, 'mousedown', (e) => this.onMouseDown(e as MouseEvent));

		add(this.el.quizCancel, 'click', () => this.closeQuiz('Quiz cancelled.'));

		this.bindMobileControls(add);

		if (this.urlParams.get('mute') === '1') {
			this.audio.setMuted(true);
		}
	}

	private bindMobileControls(
		add: (
			target: EventTarget,
			type: string,
			handler: EventListenerOrEventListenerObject,
			opts?: AddEventListenerOptions | boolean
		) => void
	): void {
		const buttons = this.el.mobileControls.querySelectorAll<HTMLButtonElement>('button[data-move]');
		for (const btn of buttons) {
			const moveKey = btn.dataset.move as 'forward' | 'backward' | 'left' | 'right' | 'jump' | undefined;
			if (!moveKey) continue;
			add(btn, 'pointerdown', () => this.input.setVirtualMovement({ [moveKey]: true }));
			const up = () => this.input.setVirtualMovement({ [moveKey]: false });
			add(btn, 'pointerup', up);
			add(btn, 'pointercancel', up);
			add(btn, 'pointerleave', up);
		}
		const interact = this.el.mobileControls.querySelector<HTMLButtonElement>('button[data-action="interact"]');
		if (interact) add(interact, 'click', () => this.tryInteractNearestPortal());
	}

	private loadBiome(biomeId: string, fromPortal: boolean): void {
		const { manifest, data } = this.biomeManager.loadIntoWorld(this.world, biomeId);
		this.currentBiome = manifest;
		this.portalHint = '';

		this.clearPortals();
		this.clearNpcs();
		this.createPortals(data.portalAnchors);
		this.createNpcs(data.npcSpawns);

		this.applyBiomeAtmosphere(manifest, true);
		this.audio.setBiomeAmbience(manifest.ambience);
		this.rollWeather(true);
		this.updateEraBanner();

		const spawn = axialToWorld(0, 0);
		const ground = this.world.getGroundY(0, 0) + 0.02;
		this.cameraCtrl.setFeetPosition(spawn.x, ground, spawn.z);
		this.biomeManager.saveCurrentState(manifest.id);
		if (fromPortal) this.audio.playPortal();
		if (fromPortal) this.showToast(`Arrived in ${manifest.place}`, 2200);
	}

	private clearPortals(): void {
		for (const p of this.portals) {
			this.portalGroup.remove(p.mesh);
			this.portalGroup.remove(p.baseMesh);
		}
		this.portals = [];
	}

	private clearNpcs(): void {
		for (const npc of this.npcs) this.npcGroup.remove(npc.group);
		this.npcs = [];
	}

	private createPortals(anchors: Array<{ q: number; r: number; link: { toBiome: string; label: string } }>): void {
		const ringGeo = new THREE.TorusGeometry(1.15, 0.18, 12, 24);
		const baseGeo = new THREE.CylinderGeometry(1.65, 1.7, 0.35, 6);
		baseGeo.rotateY(Math.PI / 6);

		for (let i = 0; i < anchors.length; i++) {
			const anchor = anchors[i];
			const pos = axialToWorld(anchor.q, anchor.r);
			const topY = this.world.getTopSolidY(anchor.q, anchor.r);
			const y = Math.max(2, topY + 1);

			const baseMat = new THREE.MeshStandardMaterial({
				color: 0x263038,
				roughness: 0.9,
				metalness: 0.1
			});
			const baseMesh = new THREE.Mesh(baseGeo, baseMat);
			baseMesh.position.set(pos.x, y + 0.18, pos.z);

			const ringMat = new THREE.MeshStandardMaterial({
				color: 0x84d7ff,
				emissive: new THREE.Color(0x1f80b8),
				emissiveIntensity: 1.2,
				metalness: 0.35,
				roughness: 0.3
			});
			const ring = new THREE.Mesh(ringGeo, ringMat);
			ring.position.set(pos.x, y + 1.8, pos.z);
			ring.rotation.x = Math.PI * 0.09;

			this.portalGroup.add(baseMesh);
			this.portalGroup.add(ring);

			this.portals.push({
				id: `${anchor.link.toBiome}-${i}`,
				toBiome: anchor.link.toBiome,
				label: anchor.link.label,
				q: anchor.q,
				r: anchor.r,
				y,
				mesh: ring,
				baseMesh
			});
		}
	}

	private createNpcMesh(): THREE.Group {
		const g = new THREE.Group();
		const skin = new THREE.MeshStandardMaterial({ color: 0xf2c7a8, roughness: 0.9 });
		const shirt = new THREE.MeshStandardMaterial({ color: 0x5f92c8, roughness: 0.88 });
		const pants = new THREE.MeshStandardMaterial({ color: 0x3b4862, roughness: 0.88 });

		const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
		head.position.set(0, 1.38, 0);
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.32), shirt);
		body.position.set(0, 0.95, 0);
		const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.48, 0.18), pants);
		legL.position.set(-0.11, 0.5, 0);
		const legR = legL.clone();
		legR.position.set(0.11, 0.5, 0);
		const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), skin);
		armL.position.set(-0.34, 0.96, 0);
		const armR = armL.clone();
		armR.position.set(0.34, 0.96, 0);
		g.add(head, body, legL, legR, armL, armR);
		return g;
	}

	private createNpcs(spawns: Array<{ q: number; r: number }>): void {
		const maxNpcs = 16;
		for (let i = 0; i < Math.min(maxNpcs, spawns.length); i++) {
			const s = spawns[i];
			const worldPos = axialToWorld(s.q, s.r);
			const ground = this.world.getGroundY(s.q, s.r);
			const group = this.createNpcMesh();
			group.position.set(worldPos.x, ground + 0.04, worldPos.z);
			this.npcGroup.add(group);
			this.npcs.push({
				id: `npc-${i}`,
				group,
				q: s.q,
				r: s.r,
				homeQ: s.q,
				homeR: s.r,
				speed: 0.9 + Math.random() * 0.8,
				phase: Math.random() * Math.PI * 2,
				targetQ: s.q,
				targetR: s.r
			});
			this.assignNpcTarget(this.npcs[this.npcs.length - 1]);
		}
	}

	private assignNpcTarget(npc: NpcInstance): void {
		for (let i = 0; i < 12; i++) {
			const q = npc.homeQ + Math.floor(Math.random() * 11) - 5;
			const r = npc.homeR + Math.floor(Math.random() * 11) - 5;
			if (Math.abs(q) + Math.abs(r) > (this.currentBiome?.radius ?? WORLD_MIN_RADIUS) + 4) continue;
			if (this.world.getTopSolidY(q, r) < 1) continue;
			npc.targetQ = q;
			npc.targetR = r;
			return;
		}
		npc.targetQ = npc.homeQ;
		npc.targetR = npc.homeR;
	}

	private updateNpcs(dt: number, nowMs: number): void {
		for (const npc of this.npcs) {
			const target = axialToWorld(npc.targetQ, npc.targetR);
			const dx = target.x - npc.group.position.x;
			const dz = target.z - npc.group.position.z;
			const dist = Math.hypot(dx, dz);

			if (dist < 0.25) {
				this.assignNpcTarget(npc);
				continue;
			}

			const step = Math.min(dist, npc.speed * dt);
			npc.group.position.x += (dx / Math.max(EPS, dist)) * step;
			npc.group.position.z += (dz / Math.max(EPS, dist)) * step;
			npc.group.rotation.y = Math.atan2(-dx, -dz);

			const ax = worldToAxial(npc.group.position.x, npc.group.position.z);
			npc.q = ax.q;
			npc.r = ax.r;
			const ground = this.world.getGroundY(ax.q, ax.r);
			npc.group.position.y = ground + 0.04 + Math.sin(nowMs * 0.006 + npc.phase) * 0.04;
		}
	}

	private onKeyDown(e: KeyboardEvent): void {
		if (!this.bootstrapDone && !this.inspect.enabled) return;
		if (this.quizOpen && e.code === 'Escape') {
			this.closeQuiz('Quiz cancelled.');
			return;
		}

		this.input.keyDown(e.code);
		this.processOneShotActions();

		const paletteSelection = this.input.consumePaletteSelection(PALETTE.length);
		if (paletteSelection !== null) {
			this.selectedPaletteIdx = paletteSelection;
			updateHotbar(this.el.hotbar, this.selectedPaletteIdx);
			this.showToast(`Selected: ${PALETTE[this.selectedPaletteIdx].label}`, 900);
		}
	}

	private onKeyUp(e: KeyboardEvent): void {
		this.input.keyUp(e.code);
	}

	private processOneShotActions(): void {
		if (this.input.consumeAction('toggleMenu')) {
			if (!this.menuOpen) {
				this.setMenu(true);
				if (document.pointerLockElement) void document.exitPointerLock();
			} else {
				this.startGame();
			}
			return;
		}

		if (this.input.consumeAction('resumeGame') && this.menuOpen) {
			this.startGame();
			return;
		}

		if (this.menuOpen || this.quizOpen) return;

		if (this.input.consumeAction('toggleMute')) {
			const muted = this.audio.toggleMuted();
			this.showToast(muted ? 'Sound: muted' : 'Sound: on', 900);
		}
		if (this.input.consumeAction('regenerateWorld') && !this.inspect.enabled && this.currentBiome) {
			this.loadBiome(this.currentBiome.id, false);
			this.showToast('Biome regenerated');
		}
		if (this.input.consumeAction('toggleFast')) {
			this.fast = !this.fast;
			this.showToast(this.fast ? 'Speed: FAST' : 'Speed: normal');
		}
		if (this.input.consumeAction('interactPortal')) {
			this.tryInteractNearestPortal();
		}
	}

	private tryInteractNearestPortal(): void {
		if (!this.currentBiome) return;
		const portal = this.findNearestPortal(3.4);
		if (!portal) {
			this.showToast('Move closer to a portal ring to travel.', 1300);
			return;
		}
		this.openQuizForPortal(portal);
	}

	private openQuizForPortal(portal: PortalInstance): void {
		if (!this.currentBiome || !this.currentBiome.quizzes.length) return;
		const question = this.currentBiome.quizzes[Math.floor(Math.random() * this.currentBiome.quizzes.length)];
		this.activeQuizPortal = portal;
		this.activeQuizQuestion = question;
		this.quizOpen = true;
		this.el.quizModal.style.display = 'grid';
		this.el.quizTitle.textContent = `Travel Quiz: ${this.currentBiome.place}`;
		this.el.quizQuestion.textContent = question.prompt;
		this.el.quizFeedback.textContent = '';
		this.el.quizChoices.innerHTML = '';

		for (let i = 0; i < question.options.length; i++) {
			const btn = document.createElement('button');
			btn.className = 'quiz-option';
			btn.textContent = question.options[i];
			btn.addEventListener('click', () => this.answerQuiz(i));
			this.el.quizChoices.appendChild(btn);
		}

		if (document.pointerLockElement) void document.exitPointerLock();
		this.updateUiModes();
	}

	private answerQuiz(selectedIndex: number): void {
		if (!this.activeQuizQuestion || !this.activeQuizPortal) return;
		const ok = selectedIndex === this.activeQuizQuestion.correctIndex;
		if (!ok) {
			this.audio.playQuizResult(false);
			this.el.quizFeedback.textContent = `Not quite. ${this.activeQuizQuestion.explanation}`;
			this.el.quizFeedback.dataset.ok = '0';
			return;
		}

		this.audio.playQuizResult(true);
		this.el.quizFeedback.textContent = `Correct. ${this.activeQuizQuestion.explanation}`;
		this.el.quizFeedback.dataset.ok = '1';
		const targetBiomeId = this.activeQuizPortal.toBiome;
		window.setTimeout(() => {
			this.closeQuiz();
			this.biomeManager.unlock(targetBiomeId);
			this.loadBiome(targetBiomeId, true);
		}, 650);
	}

	private closeQuiz(toastMessage?: string): void {
		this.quizOpen = false;
		this.activeQuizQuestion = null;
		this.activeQuizPortal = null;
		this.el.quizModal.style.display = 'none';
		this.updateUiModes();
		if (toastMessage) this.showToast(toastMessage, 1100);
	}

	private onMouseDown(e: MouseEvent): void {
		if (this.menuOpen || this.inspect.enabled || this.quizOpen) return;
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
		if (FORBIDDEN_BREAK_BLOCKS.has(ud.typeKey)) {
			this.showToast('Bedrock cannot be broken.', 800);
			return;
		}
		if (this.world.remove(ud.q, ud.r, ud.y)) {
			this.biomeManager.recordEdit(ud.q, ud.r, ud.y, null);
			this.audio.playBreak(ud.typeKey ?? 'dirt');
			if (this.currentBiome) this.biomeManager.saveCurrentState(this.currentBiome.id);
		}
	}

	private placeAdjacent(hit: PickHit, worldNormal: THREE.Vector3): void {
		const n = this.neighborForPlacement(hit, worldNormal);
		if (n.y < 1 || n.y > MAX_Y) return;
		if (this.world.has(n.q, n.r, n.y)) return;

		const placementPos = axialToWorld(n.q, n.r);
		const dx = placementPos.x - this.cameraCtrl.yawObject.position.x;
		const dz = placementPos.z - this.cameraCtrl.yawObject.position.z;
		if (Math.hypot(dx, dz) < 0.72 && Math.abs(this.cameraCtrl.state.feetY - (n.y + 1)) < 1.9) return;

		const typeKey = PALETTE[this.selectedPaletteIdx]?.key ?? 'dirt';
		if (this.world.add(n.q, n.r, n.y, typeKey)) {
			this.biomeManager.recordEdit(n.q, n.r, n.y, typeKey);
			this.audio.playPlace(typeKey);
			if (this.currentBiome) this.biomeManager.saveCurrentState(this.currentBiome.id);
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
		if (this.inspect.enabled || this.menuOpen || this.quizOpen) {
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
		return worldToAxial(this.cameraCtrl.yawObject.position.x, this.cameraCtrl.yawObject.position.z);
	}

	private sampleGroundFeetYAtWorld(x: number, z: number): number {
		const ax = worldToAxial(x, z);
		return Math.max(1, this.world.getGroundY(ax.q, ax.r));
	}

	private stepGame(dt: number, nowMs: number): void {
		if (this.inspect.enabled) {
			if (this.inspect.spin) {
				this.inspectAngle = (this.inspect.angle0 + nowMs * 0.012) % 360;
				this.applyInspectCamera(this.inspectAngle);
			}
		} else {
			this.processOneShotActions();
			if (!this.menuOpen && !this.quizOpen) {
				this.cameraCtrl.step(
					dt,
					this.input.movement,
					{
						moveSpeed: PLAYER_MOVE_SPEED,
						speedMultiplier: this.fast ? 1.95 : 1,
						minFeetY: 1,
						maxFeetY: 160,
						stepHeight: 1.1
					},
					(x, z) => this.sampleGroundFeetYAtWorld(x, z)
				);

				this.dayProgress = (this.dayProgress + dt / 360) % 1;
				this.updateDayNight(nowMs);
				this.updateWeather(nowMs, dt);
				this.updateNpcs(dt, nowMs);
				this.updatePortalAnimations(nowMs);
			}
		}

		const hit = this.updateHighlight();

		this.frame++;
		if (nowMs - this.lastFpsT > 400) {
			this.fps = Math.round((this.frame * 1000) / (nowMs - this.lastFpsT));
			this.frame = 0;
			this.lastFpsT = nowMs;
		}

		this.updateHud(hit);
		this.updatePortalHint();
		updateNatureTextureAnimation({
			grassTop: (this.mats.grass[1] as THREE.MeshStandardMaterial).map as THREE.Texture | null,
			grassSide: (this.mats.grass[0] as THREE.MeshStandardMaterial).map as THREE.Texture | null,
			sand: (this.mats.sand[0] as THREE.MeshStandardMaterial).map as THREE.Texture | null,
			water: (this.mats.water[0] as THREE.MeshStandardMaterial).map as THREE.Texture | null
		}, nowMs);
		this.audio.step(nowMs, this.daylightFactor());
		this.renderer.render(this.scene, this.camera);
	}

	private daylightFactor(): number {
		const a = this.dayProgress * Math.PI * 2;
		return Math.max(0, Math.sin(a - Math.PI / 2) * 0.5 + 0.5);
	}

	private updateDayNight(nowMs: number): void {
		if (!this.currentBiome) return;
		const ambience = this.currentBiome.ambience;
		const daylight = this.daylightFactor();
		const night = 1 - daylight;

		const dayTop = new THREE.Color(ambience.skyDayTop);
		const nightTop = new THREE.Color(ambience.skyNightTop);
		const bg = nightTop.clone().lerp(dayTop, daylight);
		this.scene.background = bg;

		const dayFog = new THREE.Color(ambience.fogColor);
		const nightFog = new THREE.Color(ambience.skyNightBottom);
		const fogColor = nightFog.clone().lerp(dayFog, daylight);
		if (!this.scene.fog) this.scene.fog = new THREE.FogExp2(fogColor, ambience.fogDensity);
		(this.scene.fog as THREE.FogExp2).color = fogColor;
		(this.scene.fog as THREE.FogExp2).density = ambience.fogDensity * (0.84 + night * 0.42);

		const sunAngle = this.dayProgress * Math.PI * 2;
		this.sunLight.position.set(Math.cos(sunAngle) * 40, 10 + Math.sin(sunAngle) * 38, Math.sin(sunAngle * 0.7) * 28);
		this.sunLight.color.setHex(ambience.sunColor);
		this.sunLight.intensity = 0.08 + daylight * 1.18;
		this.hemiLight.intensity = 0.18 + daylight * 0.92;
		this.fillLight.intensity = 0.16 + daylight * 0.64;

		if (nowMs >= this.nextWeatherSwitchAtMs) this.rollWeather();
	}

	private createWeatherParticles(): void {
		const count = 520;
		const geo = new THREE.BufferGeometry();
		const pos = new Float32Array(count * 3);
		this.weatherVelocity = new Float32Array(count);
		for (let i = 0; i < count; i++) {
			pos[i * 3 + 0] = (Math.random() - 0.5) * 48;
			pos[i * 3 + 1] = Math.random() * 24 + 4;
			pos[i * 3 + 2] = (Math.random() - 0.5) * 48;
			this.weatherVelocity[i] = 1.5 + Math.random() * 2;
		}
		geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		const mat = new THREE.PointsMaterial({
			color: 0xdff5ff,
			size: 0.12,
			transparent: true,
			opacity: 0.8,
			depthWrite: false
		});
		this.weatherParticles = new THREE.Points(geo, mat);
		this.weatherParticles.visible = false;
		this.scene.add(this.weatherParticles);
	}

	private updateWeather(nowMs: number, dt: number): void {
		if (!this.weatherParticles) this.createWeatherParticles();
		if (!this.weatherParticles) return;

		const p = this.weatherParticles;
		const attr = p.geometry.getAttribute('position') as THREE.BufferAttribute;
		const arr = attr.array as Float32Array;
		const baseX = this.cameraCtrl.yawObject.position.x;
		const baseY = this.cameraCtrl.state.feetY;
		const baseZ = this.cameraCtrl.yawObject.position.z;

		const visible = this.currentWeather !== 'clear';
		p.visible = visible;
		if (!visible) return;

		let fallSpeed = 6.5;
		let drift = 0.35;
		let size = 0.12;
		let color = 0xdaf3ff;
		if (this.currentWeather === 'rain') {
			fallSpeed = 18;
			drift = 0.9;
			size = 0.09;
			color = 0xb9ddff;
		} else if (this.currentWeather === 'snow') {
			fallSpeed = 5.2;
			drift = 0.5;
			size = 0.18;
			color = 0xf4fbff;
		} else if (this.currentWeather === 'mist') {
			fallSpeed = 1.6;
			drift = 0.22;
			size = 0.22;
			color = 0xe7f5ff;
		}

		p.material.size = size;
		p.material.color.setHex(color);

		for (let i = 0; i < this.weatherVelocity.length; i++) {
			const idx = i * 3;
			arr[idx + 1] -= (fallSpeed + this.weatherVelocity[i]) * dt;
			arr[idx + 0] += Math.sin(nowMs * 0.001 + i) * drift * dt;
			arr[idx + 2] += Math.cos(nowMs * 0.0012 + i * 0.3) * drift * 0.7 * dt;

			if (arr[idx + 1] < baseY - 2) {
				arr[idx + 0] = baseX + (Math.random() - 0.5) * 44;
				arr[idx + 1] = baseY + 18 + Math.random() * 10;
				arr[idx + 2] = baseZ + (Math.random() - 0.5) * 44;
			}
		}
		attr.needsUpdate = true;
	}

	private rollWeather(initial = false): void {
		if (!this.currentBiome) return;
		const pool = this.currentBiome.ambience.weatherPool;
		let next = pool[Math.floor(Math.random() * pool.length)] ?? 'clear';
		if (pool.length > 1 && next === this.currentWeather) {
			next = pool[(pool.indexOf(next) + 1) % pool.length] ?? next;
		}
		this.currentWeather = next;
		this.audio.setWeather(next);
		const now = performance.now();
		this.nextWeatherSwitchAtMs = now + 30000 + Math.random() * 50000;
		if (!initial) this.showToast(`Weather changed: ${WEATHER_LABEL[next]}`, 1400);
	}

	private updatePortalAnimations(nowMs: number): void {
		for (let i = 0; i < this.portals.length; i++) {
			const p = this.portals[i];
			p.mesh.rotation.y += 0.01 + i * 0.0008;
			const mat = p.mesh.material as THREE.MeshStandardMaterial;
			mat.emissiveIntensity = 0.8 + Math.sin(nowMs * 0.004 + i) * 0.45;
		}
	}

	private findNearestPortal(maxDistance: number): PortalInstance | null {
		let best: PortalInstance | null = null;
		let bestD2 = maxDistance * maxDistance;
		const x = this.cameraCtrl.yawObject.position.x;
		const z = this.cameraCtrl.yawObject.position.z;
		for (const p of this.portals) {
			const dx = p.mesh.position.x - x;
			const dz = p.mesh.position.z - z;
			const d2 = dx * dx + dz * dz;
			if (d2 < bestD2) {
				bestD2 = d2;
				best = p;
			}
		}
		return best;
	}

	private updatePortalHint(): void {
		if (this.menuOpen || this.quizOpen || this.inspect.enabled) {
			this.portalHint = '';
			return;
		}
		const portal = this.findNearestPortal(3.4);
		if (!portal) {
			this.portalHint = '';
			return;
		}
		const target = this.biomeManager.getBiome(portal.toBiome);
		this.portalHint = `Press E for ${portal.label} -> ${target.place}`;
	}

	private applyBiomeAtmosphere(manifest: BiomeManifest, initial = false): void {
		if (initial) {
			this.scene.fog = new THREE.FogExp2(manifest.ambience.fogColor, manifest.ambience.fogDensity);
			this.scene.background = new THREE.Color(manifest.ambience.skyDayTop);
		}
	}

	private updateEraBanner(): void {
		if (!this.currentBiome) {
			this.el.eraBanner.textContent = '';
			return;
		}
		this.el.eraBanner.textContent = `${this.currentBiome.place} | ${this.currentBiome.eraLabel} | ${this.currentBiome.yearLabel}`;
	}

	private updateHud(hit: PickHit | null): void {
		if (this.inspect.enabled) {
			if (!this.inspect.ui) return;
			setHudRows(this.el.hud, [
				{ label: 'mode', value: 'inspect' },
				{ label: 'type', value: normalizeInspectBlockType(this.inspect.type) },
				{ label: 'angle', value: `${this.inspectAngle.toFixed(1)} deg` }
			]);
			return;
		}
		if (this.menuOpen) return;

		const ax = this.currentAxialUnderPlayer();
		const sel = PALETTE[this.selectedPaletteIdx];
		const hitStr = hit
			? `q=${(hit.object.userData as BlockUserData).q} r=${(hit.object.userData as BlockUserData).r} y=${(hit.object.userData as BlockUserData).y}`
			: '-';

		setHudRows(this.el.hud, [
			{ label: 'fps', value: String(this.fps) },
			{ label: 'biome', value: this.currentBiome?.place ?? '-' },
			{ label: 'era', value: this.currentBiome?.yearLabel ?? '-' },
			{ label: 'time', value: this.getClockString() },
			{ label: 'weather', value: WEATHER_LABEL[this.currentWeather] },
			{
				label: 'pos',
				value: `${this.cameraCtrl.yawObject.position.x.toFixed(1)}, ${this.cameraCtrl.state.feetY.toFixed(1)}, ${this.cameraCtrl.yawObject.position.z.toFixed(1)}`
			},
			{ label: 'cell', value: `q=${ax.q} r=${ax.r}` },
			{ label: 'blocks', value: String(this.world.blocks.size) },
			{ label: 'npcs', value: String(this.npcs.length) },
			{ label: 'tool', value: `${sel.label} (${sel.key})` },
			{ label: 'pick', value: hitStr },
			{ label: 'portal', value: this.portalHint || '-' },
			{ label: 'sound', value: this.audio.isMuted() ? 'muted (M)' : 'on (M)' },
			{ label: 'hint', value: 'LMB remove, RMB place, E portal quiz, Space jump, F fast' }
		]);
	}

	private getClockString(): string {
		const mins = Math.floor(this.dayProgress * 24 * 60) % (24 * 60);
		const h = Math.floor(mins / 60)
			.toString()
			.padStart(2, '0');
		const m = (mins % 60).toString().padStart(2, '0');
		return `${h}:${m}`;
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
		if (this.inspect.enabled || this.quizOpen) return;
		if (document.pointerLockElement) return;
		void this.renderer.domElement.requestPointerLock();
	}

	private setMenu(open: boolean): void {
		this.menuOpen = open;
		this.updateUiModes();
		if (open) this.input.clearMovement();
	}

	private updateUiModes(): void {
		const showOverlay = this.menuOpen && !this.inspect.enabled;
		this.el.overlay.style.display = showOverlay ? 'grid' : 'none';

		const showHud = !this.menuOpen;
		this.el.hud.style.display = showHud ? 'block' : 'none';
		this.el.hotbar.style.display = !this.menuOpen && !this.quizOpen && !this.inspect.enabled ? 'flex' : 'none';
		this.el.crosshair.style.display = !this.menuOpen && !this.quizOpen && !this.inspect.enabled ? 'block' : 'none';
		this.el.eraBanner.style.display = !this.menuOpen && !this.inspect.enabled ? 'block' : 'none';
		this.el.mobileControls.style.display = !this.menuOpen && !this.quizOpen && !this.inspect.enabled ? 'grid' : 'none';
		this.updateMouseCursor();
	}

	private enterInspectUiMode(): void {
		this.setMenu(false);
		if (!this.inspect.ui) {
			this.el.hud.style.display = 'none';
			this.el.hotbar.style.display = 'none';
			this.el.crosshair.style.display = 'none';
			this.el.toast.style.display = 'none';
			this.el.eraBanner.style.display = 'none';
			this.el.mobileControls.style.display = 'none';
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

	private setupInspect(): void {
		this.world.clear();
		const t = normalizeInspectBlockType(this.inspect.type);
		this.world.add(0, 0, 0, t);
		this.scene.fog = null;
		this.applyInspectCamera(this.inspectAngle);
	}

	private applyInspectCamera(angleDeg: number): void {
		const a = (angleDeg * Math.PI) / 180;
		const cx = Math.cos(a) * this.inspect.distance;
		const cz = Math.sin(a) * this.inspect.distance;
		const cy = this.inspect.height;
		this.cameraCtrl.setFeetPosition(cx, cy, cz);

		const tx = 0;
		const ty = 0.5 * BLOCK_H + 1.62;
		const tz = 0;
		const target = new THREE.Vector3(tx, ty, tz);
		this.cameraCtrl.lookAt(target);
	}
}

declare global {
	interface Window {
		render_game_to_text?: () => string;
		advanceTime?: (ms: number) => void;
		hexworld_set_inspect_angle?: (deg: number) => void;
		hexworld_debug_action?: (action: string) => boolean;
	}
}
