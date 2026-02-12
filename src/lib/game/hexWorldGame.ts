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
import { axialToWorld, hash2, hexDist, worldToAxial } from './hex';
import { InputController } from './input';
import { normalizeInspectBlockType, readInspectConfig, readUrlParams } from './inspect';
import { STONEHENGE_PLAN } from './stonehengePlan.generated';
import { loadTexture } from './texture';
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
	BiomeManifest,
	AxialCoord
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

interface NpcAnchorPoint {
	q: number;
	r: number;
}

interface FireFxInstance {
	fire: THREE.Sprite;
	smoke: THREE.Sprite;
	baseX: number;
	baseY: number;
	baseZ: number;
	phase: number;
}

const WEATHER_LABEL: Record<WeatherKind, string> = {
	clear: 'Clear',
	rain: 'Rain',
	snow: 'Snow',
	mist: 'Mist'
};

const FORBIDDEN_BREAK_BLOCKS = new Set<BlockType>(['bedrock']);
const STONEHENGE_PLAN_SCALE = 1.35;

export class HexWorldGame implements DisposeBag {
	private readonly scene: THREE.Scene;
	private readonly renderer: THREE.WebGLRenderer;
	private readonly camera: THREE.PerspectiveCamera;
	private readonly cameraCtrl: FirstPersonCameraController;

	private readonly blockGroup = new THREE.Group();
	private readonly portalGroup = new THREE.Group();
	private readonly npcGroup = new THREE.Group();
	private readonly detailGroup = new THREE.Group();
	private readonly raycaster = new THREE.Raycaster();
	private readonly rayCenter = new THREE.Vector2(0, 0);
	private readonly tmpMat3 = new THREE.Matrix3();
	private readonly tmpVec3 = new THREE.Vector3();
	private readonly tmpObject = new THREE.Object3D();

	private readonly geoBlock: THREE.CylinderGeometry;
	private readonly mats: BlockMaterialMap;
	private readonly world: World;
	private readonly audio = new HexWorldAudio();
	private readonly input = new InputController();
	private readonly biomeManager = new BiomeManager();

	private readonly highlight: BlockMesh;
	private readonly inspect: InspectConfig;
	private readonly urlParams: URLSearchParams;
	private readonly hudVerbose: boolean;
	private readonly hudUpdateIntervalMs: number;
	private readonly renderRadius: number;
	private readonly renderWindowRecenterDistance: number;
	private lastHudUpdateAt = -Infinity;
	private lastHighlightPickAt = -Infinity;
	private cachedHighlightHit: PickHit | null = null;
	private renderWindowCenterQ = Number.NaN;
	private renderWindowCenterR = Number.NaN;

	private readonly hemiLight: THREE.HemisphereLight;
	private readonly sunLight: THREE.DirectionalLight;
	private readonly fillLight: THREE.DirectionalLight;

	private weatherParticles: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null;
	private weatherVelocity = new Float32Array(0);
	private grassCardsA: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial> | null = null;
	private grassCardsB: THREE.InstancedMesh<THREE.PlaneGeometry, THREE.MeshLambertMaterial> | null = null;
	private treeTrunkBlocks: THREE.InstancedMesh<THREE.CylinderGeometry, THREE.MeshLambertMaterial> | null = null;
	private treeLeafBlocks: THREE.InstancedMesh<THREE.CylinderGeometry, THREE.MeshLambertMaterial> | null = null;
	private fireFx: FireFxInstance[] = [];
	private detailTextureRefs: {
		grassCard: THREE.Texture | null;
		leafCard: THREE.Texture | null;
		smoke: THREE.Texture | null;
		fireFx: THREE.Texture | null;
	} = {
		grassCard: null,
		leafCard: null,
		smoke: null,
		fireFx: null
	};
	private grassCardMaterial: THREE.MeshLambertMaterial | null = null;
	private leafCardMaterial: THREE.MeshLambertMaterial | null = null;
	private treeLeafBlockMaterial: THREE.MeshLambertMaterial | null = null;
	private smokeSpriteMaterial: THREE.SpriteMaterial | null = null;
	private fireSpriteMaterial: THREE.SpriteMaterial | null = null;
	private detailDirty = true;
	private detailCenterQ = Number.NaN;
	private detailCenterR = Number.NaN;
	private lastDetailRebuildAt = -Infinity;

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
	private readonly touchUiEnabled =
		(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) ||
		(navigator.maxTouchPoints ?? 0) > 0;
	private joystickEl: HTMLDivElement | null = null;
	private joystickThumbEl: HTMLDivElement | null = null;
	private joystickPointerId: number | null = null;
	private joystickCenterX = 0;
	private joystickCenterY = 0;
	private joystickRadius = 1;
	private touchLookPointerId: number | null = null;
	private touchLookLastX = 0;
	private touchLookLastY = 0;
	private touchTapStartAt = 0;
	private touchTapStartCount = 0;
	private touchTapMoved = false;
	private touchTapStartX = 0;
	private touchTapStartY = 0;

	private readonly handlers: Array<() => void> = [];

	constructor(private readonly el: HexWorldElements) {
		this.urlParams = readUrlParams();
		this.inspect = readInspectConfig(this.urlParams);
		this.inspectAngle = this.inspect.angle0;
		this.hudVerbose = this.urlParams.get('hud') === 'full' || this.urlParams.get('overlay') === '1';
		this.hudUpdateIntervalMs = this.hudVerbose ? 120 : 240;
		const antialias = this.urlParams.get('aa') === '1';
		const dpiCapRaw = Number.parseFloat(this.urlParams.get('dpi') || '');
		const dpiCap = Number.isFinite(dpiCapRaw) && dpiCapRaw > 0 ? dpiCapRaw : 1.2;
		const renderRadiusRaw = Number.parseInt(this.urlParams.get('rr') || '', 10);
		this.renderRadius =
			Number.isFinite(renderRadiusRaw) && renderRadiusRaw >= 8
				? Math.min(128, renderRadiusRaw)
				: this.touchUiEnabled
					? 72
					: 96;
		this.renderWindowRecenterDistance = Math.max(2, Math.floor(this.renderRadius * 0.2));

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x97b6d3);
		this.scene.fog = new THREE.FogExp2(0x9db6d2, 0.02);

		this.renderer = new THREE.WebGLRenderer({
			canvas: this.el.canvas,
			antialias,
			powerPreference: 'high-performance'
		});
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, dpiCap));
		this.renderer.setSize(window.innerWidth, window.innerHeight, false);
		this.renderer.outputColorSpace = THREE.SRGBColorSpace;
		this.renderer.shadowMap.enabled = false;

		this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 620);
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

		this.scene.add(this.blockGroup, this.portalGroup, this.npcGroup, this.detailGroup);

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
		this.clearDetailDecor();
		this.disposeDetailAssets();
		this.audio.dispose();
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
		try {
			await this.loadDetailTextures();
		} catch (err) {
			console.warn('Detail texture load failed:', err);
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
	}

	private async loadDetailTextures(): Promise<void> {
		const loader = new THREE.TextureLoader();
		const load = async (url: string): Promise<THREE.Texture | null> => {
			try {
				return await loadTexture(this.renderer, loader, url, {
					wrapS: THREE.ClampToEdgeWrapping,
					wrapT: THREE.ClampToEdgeWrapping,
					minFilter: THREE.LinearMipmapLinearFilter,
					magFilter: THREE.LinearFilter
				});
			} catch {
				return null;
			}
		};

		const [grassCard, leafCard, smoke, fireFx] = await Promise.all([
			load('/textures/grass_card.png'),
			load('/textures/leaf_card.png'),
			load('/textures/smoke.png'),
			load('/textures/fire_fx.png')
		]);
		this.detailTextureRefs = { grassCard, leafCard, smoke, fireFx };

		this.grassCardMaterial = new THREE.MeshLambertMaterial({
			map: grassCard ?? undefined,
			color: grassCard ? 0xffffff : 0x6e9f41,
			transparent: true,
			alphaTest: 0.43,
			side: THREE.DoubleSide
		});
		this.leafCardMaterial = new THREE.MeshLambertMaterial({
			map: leafCard ?? undefined,
			color: leafCard ? 0xffffff : 0x5f8b43,
			transparent: true,
			alphaTest: 0.48,
			side: THREE.DoubleSide
		});
		this.treeLeafBlockMaterial = new THREE.MeshLambertMaterial({
			map: (this.mats.grass[1] as THREE.MeshLambertMaterial).map ?? undefined,
			color: 0x7eb05e
		});
		this.smokeSpriteMaterial = new THREE.SpriteMaterial({
			map: smoke ?? undefined,
			color: 0xe5e5e5,
			transparent: true,
			opacity: 0.54,
			depthWrite: false,
			depthTest: true
		});
		this.fireSpriteMaterial = new THREE.SpriteMaterial({
			map: fireFx ?? undefined,
			color: 0xffffff,
			transparent: true,
			opacity: 0.95,
			blending: THREE.AdditiveBlending,
			depthWrite: false
		});
	}

	private disposeDetailAssets(): void {
		this.grassCardMaterial?.dispose();
		this.grassCardMaterial = null;
		this.leafCardMaterial?.dispose();
		this.leafCardMaterial = null;
		this.treeLeafBlockMaterial?.dispose();
		this.treeLeafBlockMaterial = null;
		this.smokeSpriteMaterial?.dispose();
		this.smokeSpriteMaterial = null;
		this.fireSpriteMaterial?.dispose();
		this.fireSpriteMaterial = null;
		for (const tex of Object.values(this.detailTextureRefs)) tex?.dispose();
		this.detailTextureRefs = { grassCard: null, leafCard: null, smoke: null, fireFx: null };
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
				fps: this.fps,
				biomeId: this.currentBiome?.id,
				weather: this.currentWeather,
				timeOfDay: this.getClockString(),
				position: {
					x: this.cameraCtrl.yawObject.position.x,
					y: this.cameraCtrl.state.feetY,
					z: this.cameraCtrl.yawObject.position.z
				},
				look: {
					yaw: this.cameraCtrl.yawObject.rotation.y,
					pitch: this.cameraCtrl.pitchObject.rotation.x
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
					this.detailDirty = true;
					return true;
				}
				return false;
			}
			if (action === 'goto_overview') {
				const overviewAx = { q: -18, r: 18 };
				const pos = axialToWorld(overviewAx.q, overviewAx.r);
				const feet = Math.max(this.world.getGroundY(overviewAx.q, overviewAx.r) + 6, 6);
				this.cameraCtrl.setFeetPosition(pos.x, feet, pos.z);
				this.cameraCtrl.lookAt(new THREE.Vector3(0, this.world.getGroundY(0, 0) + 3, 0));
				return true;
			}
			if (action === 'remove_top_under_player') {
				const ax = this.currentAxialUnderPlayer();
				const y = this.world.getTopSolidY(ax.q, ax.r);
				const t = this.world.getType(ax.q, ax.r, y);
				if (!t || FORBIDDEN_BREAK_BLOCKS.has(t)) return false;
				if (this.world.remove(ax.q, ax.r, y)) {
					this.biomeManager.recordEdit(ax.q, ax.r, y, null);
					if (this.currentBiome) this.biomeManager.saveCurrentState(this.currentBiome.id);
					this.detailDirty = true;
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
		const passiveFalse = { passive: false };
		const consumeTouch = (event: Event): void => {
			if (event.cancelable) event.preventDefault();
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
		add(document, 'selectstart', (e) => e.preventDefault());
		add(document, 'gesturestart', consumeTouch, passiveFalse);
		add(document, 'gesturechange', consumeTouch, passiveFalse);
		add(document, 'gestureend', consumeTouch, passiveFalse);

		for (const target of [this.el.canvas, this.el.overlay, this.el.mobileControls, this.el.quizModal]) {
			add(target, 'touchstart', consumeTouch, passiveFalse);
			add(target, 'touchmove', consumeTouch, passiveFalse);
			add(target, 'touchend', consumeTouch, passiveFalse);
			add(target, 'touchcancel', consumeTouch, passiveFalse);
		}
		add(
			this.el.canvas,
			'touchstart',
			(e) => this.handleTouchTapStart(e as TouchEvent),
			passiveFalse
		);
		add(
			this.el.canvas,
			'touchmove',
			(e) => this.handleTouchTapMove(e as TouchEvent),
			passiveFalse
		);
		add(
			this.el.canvas,
			'touchend',
			(e) => this.handleTouchTapEnd(e as TouchEvent),
			passiveFalse
		);
		add(
			this.el.canvas,
			'touchcancel',
			(e) => this.handleTouchTapEnd(e as TouchEvent),
			passiveFalse
		);

		add(
			this.el.cta,
			'pointerdown',
			(e) => {
				const pe = e as PointerEvent;
				if (pe.cancelable) pe.preventDefault();
				this.startGame();
			},
			passiveFalse
		);
		add(
			this.el.overlay,
			'pointerdown',
			(e) => {
				const pe = e as PointerEvent;
				if (pe.cancelable) pe.preventDefault();
				if (pe.target === this.el.overlay) this.startGame();
			},
			passiveFalse
		);
		add(this.renderer.domElement, 'pointerdown', (e) => {
			const pe = e as PointerEvent;
			this.audio.unlock();
			if (pe.pointerType === 'touch' && pe.cancelable) pe.preventDefault();
			if (pe.pointerType === 'touch') {
				this.handleTouchLookDown(pe);
				return;
			}
			if (!this.inspect.enabled && !this.menuOpen && !this.quizOpen && !this.pointerLocked) this.lockPointer();
		});
		add(this.renderer.domElement, 'pointermove', (e) => {
			const pe = e as PointerEvent;
			if (pe.pointerType !== 'touch') return;
			this.handleTouchLookMove(pe);
		});
		const onTouchLookUp = (e: Event): void => {
			const pe = e as PointerEvent;
			if (pe.pointerType !== 'touch') return;
			this.handleTouchLookUp(pe);
		};
		add(this.renderer.domElement, 'pointerup', onTouchLookUp);
		add(this.renderer.domElement, 'pointercancel', onTouchLookUp);

		add(document, 'mousemove', (e) => {
			if (this.menuOpen || this.quizOpen || !this.pointerLocked) return;
			const me = e as MouseEvent;
			this.cameraCtrl.rotateByMouse(me.movementX, me.movementY);
		});

		add(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
		add(window, 'keyup', (e) => this.onKeyUp(e as KeyboardEvent));
		add(window, 'mousedown', (e) => this.onMouseDown(e as MouseEvent));

		add(this.el.quizCancel, 'pointerdown', () => this.closeQuiz('Quiz cancelled.'));

		this.bindMobileControls(add);
		this.bindHotbarSelection(add);

		if (this.urlParams.get('mute') === '1') {
			this.audio.setMuted(true);
		}
	}

	private bindHotbarSelection(
		add: (
			target: EventTarget,
			type: string,
			handler: EventListenerOrEventListenerObject,
			opts?: AddEventListenerOptions | boolean
		) => void
	): void {
		const slots = this.el.hotbar.querySelectorAll<HTMLDivElement>('.slot');
		for (const slot of slots) {
			add(
				slot,
				'pointerdown',
				(e) => {
					const pe = e as PointerEvent;
					if (pe.cancelable) pe.preventDefault();
					const idx = Number.parseInt(slot.dataset.idx || '', 10);
					if (!Number.isFinite(idx) || idx < 0 || idx >= PALETTE.length) return;
					this.selectedPaletteIdx = idx;
					updateHotbar(this.el.hotbar, this.selectedPaletteIdx);
					this.showToast(`Selected: ${PALETTE[this.selectedPaletteIdx].label}`, 900);
				},
				{ passive: false }
			);
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
		this.joystickEl = this.el.mobileControls.querySelector<HTMLDivElement>('[data-control="joystick"]');
		this.joystickThumbEl = this.el.mobileControls.querySelector<HTMLDivElement>('[data-control="joystick-thumb"]');
		if (this.joystickEl) {
			this.updateJoystickBounds();
			add(
				this.joystickEl,
				'pointerdown',
				(e) => {
					const pe = e as PointerEvent;
					if (pe.pointerType !== 'touch') return;
					this.audio.unlock();
					if (pe.cancelable) pe.preventDefault();
					this.joystickPointerId = pe.pointerId;
					this.joystickEl?.setPointerCapture(pe.pointerId);
					this.updateJoystickBounds();
					this.updateJoystickByPointer(pe);
				},
				{ passive: false }
			);
			add(
				this.joystickEl,
				'pointermove',
				(e) => {
					const pe = e as PointerEvent;
					if (pe.pointerId !== this.joystickPointerId) return;
					if (pe.cancelable) pe.preventDefault();
					this.updateJoystickByPointer(pe);
				},
				{ passive: false }
			);
			const joystickUp = (e: Event): void => {
				const pe = e as PointerEvent;
				if (pe.pointerId !== this.joystickPointerId) return;
				this.joystickPointerId = null;
				this.input.setVirtualMovement({ forward: false, backward: false, left: false, right: false });
				this.updateJoystickThumb(0, 0);
				this.joystickEl?.releasePointerCapture(pe.pointerId);
			};
			add(this.joystickEl, 'pointerup', joystickUp);
			add(this.joystickEl, 'pointercancel', joystickUp);
		}

		const jumpBtn = this.el.mobileControls.querySelector<HTMLButtonElement>('button[data-action="jump"]');
		if (jumpBtn) {
			add(
				jumpBtn,
				'pointerdown',
				(e) => {
					const pe = e as PointerEvent;
					if (pe.pointerType !== 'touch' && pe.pointerType !== 'pen') return;
					this.audio.unlock();
					if (pe.cancelable) pe.preventDefault();
					this.input.setVirtualMovement({ jump: true });
				},
				{ passive: false }
			);
			const jumpUp = (): void => this.input.setVirtualMovement({ jump: false });
			add(jumpBtn, 'pointerup', jumpUp);
			add(jumpBtn, 'pointercancel', jumpUp);
			add(jumpBtn, 'pointerleave', jumpUp);
		}
		const interact = this.el.mobileControls.querySelector<HTMLButtonElement>('button[data-action="interact"]');
		if (interact) {
			add(
				interact,
				'pointerdown',
				(e) => {
					const pe = e as PointerEvent;
					this.audio.unlock();
					if (pe.cancelable) pe.preventDefault();
					this.tryInteractNearestPortal();
				},
				{ passive: false }
			);
		}
	}

	private updateJoystickBounds(): void {
		if (!this.joystickEl) return;
		const rect = this.joystickEl.getBoundingClientRect();
		this.joystickCenterX = rect.left + rect.width / 2;
		this.joystickCenterY = rect.top + rect.height / 2;
		this.joystickRadius = Math.max(1, rect.width / 2);
	}

	private updateJoystickThumb(dx: number, dy: number): void {
		if (!this.joystickThumbEl) return;
		this.joystickThumbEl.style.transform = `translate(${dx}px, ${dy}px)`;
	}

	private updateJoystickByPointer(event: PointerEvent): void {
		const dx = event.clientX - this.joystickCenterX;
		const dy = event.clientY - this.joystickCenterY;
		const distance = Math.min(Math.hypot(dx, dy), this.joystickRadius);
		const angle = Math.atan2(dy, dx);
		const nx = Math.cos(angle) * (distance / this.joystickRadius);
		const ny = Math.sin(angle) * (distance / this.joystickRadius);
		const deadzone = 0.22;

		this.input.setVirtualMovement({
			forward: ny < -deadzone,
			backward: ny > deadzone,
			left: nx < -deadzone,
			right: nx > deadzone
		});
		this.updateJoystickThumb(nx * this.joystickRadius * 0.52, ny * this.joystickRadius * 0.52);
	}

	private handleTouchLookDown(event: PointerEvent): void {
		if (!this.touchUiEnabled) return;
		if (this.menuOpen || this.quizOpen || this.inspect.enabled) return;
		if (this.touchLookPointerId !== null) return;
		this.touchLookPointerId = event.pointerId;
		this.touchLookLastX = event.clientX;
		this.touchLookLastY = event.clientY;
		try {
			this.el.canvas.setPointerCapture(event.pointerId);
		} catch {
			// ignore capture failures on some browsers
		}
	}

	private handleTouchLookMove(event: PointerEvent): void {
		if (event.pointerId !== this.touchLookPointerId) return;
		const dx = event.clientX - this.touchLookLastX;
		const dy = event.clientY - this.touchLookLastY;
		this.touchLookLastX = event.clientX;
		this.touchLookLastY = event.clientY;
		this.cameraCtrl.rotateByMouse(dx, dy, 0.0042);
		if (event.cancelable) event.preventDefault();
	}

	private handleTouchLookUp(event: PointerEvent): void {
		if (event.pointerId !== this.touchLookPointerId) return;
		this.touchLookPointerId = null;
		try {
			this.el.canvas.releasePointerCapture(event.pointerId);
		} catch {
			// ignore release failures on some browsers
		}
	}

	private touchCenter(event: TouchEvent): { x: number; y: number } | null {
		if (!event.touches.length) return null;
		let sx = 0;
		let sy = 0;
		for (let i = 0; i < event.touches.length; i++) {
			sx += event.touches[i].clientX;
			sy += event.touches[i].clientY;
		}
		return { x: sx / event.touches.length, y: sy / event.touches.length };
	}

	private handleTouchTapStart(event: TouchEvent): void {
		if (!this.touchUiEnabled) return;
		if (this.menuOpen || this.quizOpen || this.inspect.enabled) return;
		const now = performance.now();
		const center = this.touchCenter(event);
		if (!center) return;

		if (this.touchTapStartCount === 0) {
			this.touchTapStartAt = now;
			this.touchTapStartCount = Math.min(2, Math.max(1, event.touches.length));
			this.touchTapMoved = false;
			this.touchTapStartX = center.x;
			this.touchTapStartY = center.y;
			return;
		}

		if (event.touches.length >= 2 && now - this.touchTapStartAt < 180) {
			this.touchTapStartCount = 2;
		}
	}

	private handleTouchTapMove(event: TouchEvent): void {
		if (this.touchTapStartCount === 0) return;
		const center = this.touchCenter(event);
		if (!center) return;
		const moved = Math.hypot(center.x - this.touchTapStartX, center.y - this.touchTapStartY) > 16;
		if (moved) this.touchTapMoved = true;
	}

	private handleTouchTapEnd(event: TouchEvent): void {
		if (!this.touchUiEnabled) return;
		if (event.touches.length > 0) return;
		if (this.touchTapStartCount === 0) return;

		const elapsed = performance.now() - this.touchTapStartAt;
		const isTap = !this.touchTapMoved && elapsed < 280;
		const fingerCount = this.touchTapStartCount;

		this.touchTapStartCount = 0;
		this.touchTapMoved = false;

		if (!isTap || this.menuOpen || this.quizOpen || this.inspect.enabled) return;
		if (fingerCount >= 2) this.tryTouchPlaceAtCenter();
		else this.tryTouchBreakAtCenter();
	}

	private tryTouchBreakAtCenter(): void {
		this.audio.unlock();
		const hit = this.pickBlock();
		if (!hit) return;
		this.removeSelected(hit);
	}

	private tryTouchPlaceAtCenter(): void {
		this.audio.unlock();
		const hit = this.pickBlock();
		if (!hit) return;
		this.placeAdjacent(hit, hit.worldNormal);
	}

	private loadBiome(biomeId: string, fromPortal: boolean): void {
		const spawnCell = this.getSpawnCellForBiome(biomeId);
		this.world.setRenderWindow(spawnCell.q, spawnCell.r, this.renderRadius);
		this.renderWindowCenterQ = spawnCell.q;
		this.renderWindowCenterR = spawnCell.r;

		const { manifest, data } = this.biomeManager.loadIntoWorld(this.world, biomeId);
		this.invalidateHighlightCache();
		this.currentBiome = manifest;
		this.portalHint = '';

		this.clearPortals();
		this.clearNpcs();
		this.clearDetailDecor();
		this.createPortals(data.portalAnchors);
		this.createNpcs(data.npcSpawns);

		this.applyBiomeAtmosphere(manifest, true);
		this.audio.setBiomeAmbience(manifest.ambience, manifest.id);
		this.rollWeather(true);
		this.updateEraBanner();

		const spawn = axialToWorld(spawnCell.q, spawnCell.r);
		const ground = this.world.getGroundY(spawnCell.q, spawnCell.r) + 0.02;
		this.cameraCtrl.setFeetPosition(spawn.x, ground, spawn.z);
		if (manifest.id === 'grassland-origins') {
			this.cameraCtrl.lookAt(new THREE.Vector3(0, this.world.getGroundY(0, 0) + 3, 0));
		}
		this.updateRenderWindow(true);
		this.detailDirty = true;
		this.rebuildDetailDecor(true, performance.now());
		this.biomeManager.saveCurrentState(manifest.id);
		if (fromPortal) this.audio.playPortal();
		if (fromPortal) this.showToast(`Arrived in ${manifest.place}`, 2200);
	}

	private getSpawnCellForBiome(biomeId: string): { q: number; r: number } {
		return biomeId === 'grassland-origins' ? { q: -16, r: 14 } : { q: 0, r: 0 };
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

	private clearDetailDecor(): void {
		for (const fx of this.fireFx) {
			this.detailGroup.remove(fx.fire, fx.smoke);
			(fx.fire.material as THREE.SpriteMaterial).dispose();
			(fx.smoke.material as THREE.SpriteMaterial).dispose();
		}
		this.fireFx = [];

		const instanced = [this.grassCardsA, this.grassCardsB, this.treeTrunkBlocks, this.treeLeafBlocks];
		for (const mesh of instanced) {
			if (!mesh) continue;
			this.detailGroup.remove(mesh);
			mesh.geometry.dispose();
		}
		this.grassCardsA = null;
		this.grassCardsB = null;
		this.treeTrunkBlocks = null;
		this.treeLeafBlocks = null;
		this.detailDirty = true;
		this.detailCenterQ = Number.NaN;
		this.detailCenterR = Number.NaN;
		this.lastDetailRebuildAt = -Infinity;
	}

	private scalePlanCells(cells: ReadonlyArray<{ q: number; r: number }>, scale: number): AxialCoord[] {
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

	private rebuildDetailDecor(force: boolean, nowMs: number): void {
		if (!this.currentBiome || this.inspect.enabled) return;
		const ax = this.currentAxialUnderPlayer();
		const moved =
			!Number.isFinite(this.detailCenterQ) ||
			!Number.isFinite(this.detailCenterR) ||
			hexDist(this.detailCenterQ, this.detailCenterR, ax.q, ax.r) >= 4;
		if (!force && !this.detailDirty && !moved) return;
		this.lastDetailRebuildAt = nowMs;
		this.detailCenterQ = ax.q;
		this.detailCenterR = ax.r;

		this.rebuildGrassCards(ax.q, ax.r);
		if (this.currentBiome.id === 'grassland-origins') this.buildStonehengeTrees(ax.q, ax.r);
		this.rebuildFireFx();
		this.detailDirty = false;
	}

	private rebuildGrassCards(centerQ: number, centerR: number): void {
		if (!this.grassCardMaterial) return;
		if (this.grassCardsA) {
			this.detailGroup.remove(this.grassCardsA);
			this.grassCardsA.geometry.dispose();
			this.grassCardsA = null;
		}
		if (this.grassCardsB) {
			this.detailGroup.remove(this.grassCardsB);
			this.grassCardsB.geometry.dispose();
			this.grassCardsB = null;
		}

		const biomeRadius = this.currentBiome?.radius ?? this.renderRadius;
		const radius = Math.max(10, Math.min(this.renderRadius - 2, biomeRadius));
		const cells: Array<{ q: number; r: number; phase: number }> = [];
		const maxCards = this.touchUiEnabled ? 900 : 1700;

		for (let dq = -radius; dq <= radius; dq++) {
			const drMin = Math.max(-radius, -dq - radius);
			const drMax = Math.min(radius, -dq + radius);
			for (let dr = drMin; dr <= drMax; dr++) {
				const q = centerQ + dq;
				const r = centerR + dr;
				const topY = this.world.getTopSolidY(q, r);
				if (topY < 1) continue;
				if (this.world.getType(q, r, topY) !== 'grass') continue;
				if (this.world.getType(q, r, topY + 1)) continue;
				const d = hexDist(centerQ, centerR, q, r);
				const near = d <= 16;
				const p = hash2(q * 1.17, r * 1.31);
				const threshold = near ? 0.5 : 0.86 + (d / Math.max(1, radius)) * 0.1;
				if (p < threshold) continue;
				cells.push({ q, r, phase: p * Math.PI * 2 });
				if (cells.length >= maxCards) break;
			}
			if (cells.length >= maxCards) break;
		}

		if (!cells.length) return;
		const geo = new THREE.PlaneGeometry(0.92, 1.22, 1, 1);
		const a = new THREE.InstancedMesh(geo, this.grassCardMaterial, cells.length);
		const b = new THREE.InstancedMesh(geo.clone(), this.grassCardMaterial, cells.length);
		a.frustumCulled = true;
		b.frustumCulled = true;

		for (let i = 0; i < cells.length; i++) {
			const c = cells[i];
			const w = axialToWorld(c.q, c.r);
			const ground = this.world.getGroundY(c.q, c.r);
			const jitterA = (hash2(c.q * 2.7, c.r * 2.3) - 0.5) * 0.24;
			const jitterB = (hash2(c.q * 3.3, c.r * 2.9) - 0.5) * 0.24;
			const scale = 0.7 + hash2(c.q * 3.7, c.r * 1.9) * 0.55;
			const yaw = c.phase;
			const y = ground + 0.44 * scale;

			this.tmpObject.position.set(w.x + jitterA, y, w.z + jitterB);
			this.tmpObject.rotation.set(0, yaw, 0);
			this.tmpObject.scale.set(scale, scale, scale);
			this.tmpObject.updateMatrix();
			a.setMatrixAt(i, this.tmpObject.matrix);

			this.tmpObject.rotation.set(0, yaw + Math.PI * 0.5, 0);
			this.tmpObject.updateMatrix();
			b.setMatrixAt(i, this.tmpObject.matrix);
		}
		a.instanceMatrix.needsUpdate = true;
		b.instanceMatrix.needsUpdate = true;

		this.grassCardsA = a;
		this.grassCardsB = b;
		this.detailGroup.add(a, b);
	}

	private buildStonehengeTrees(centerQ: number, centerR: number): void {
		if (!this.treeLeafBlockMaterial) return;
		const manifest = this.currentBiome;
		if (!manifest || manifest.id !== 'grassland-origins') return;
		if (this.treeTrunkBlocks) {
			this.detailGroup.remove(this.treeTrunkBlocks);
			this.treeTrunkBlocks.geometry.dispose();
			this.treeTrunkBlocks = null;
		}
		if (this.treeLeafBlocks) {
			this.detailGroup.remove(this.treeLeafBlocks);
			this.treeLeafBlocks.geometry.dispose();
			this.treeLeafBlocks = null;
		}
		const scale = STONEHENGE_PLAN_SCALE;
		const pathSet = new Set(this.scalePlanCells(STONEHENGE_PLAN.pathCells, scale).map((c) => `${c.q},${c.r}`));
		const waterSet = new Set(this.scalePlanCells(STONEHENGE_PLAN.waterCells, scale).map((c) => `${c.q},${c.r}`));
		const hutSet = new Set(this.scalePlanCells(STONEHENGE_PLAN.hutCenters, scale).map((c) => `${c.q},${c.r}`));

		const anchors: Array<{ q: number; r: number; trunkBlocks: number }> = [];
		const blocked = new Set<string>();
		const radius = manifest.radius - 2;
		const visibleRadius = Math.max(10, Math.min(this.renderRadius - 2, radius));
		for (let q = -radius; q <= radius; q++) {
			for (let r = -radius; r <= radius; r++) {
				const d = hexDist(0, 0, q, r);
				if (d > radius || d < 23) continue;
				if (hexDist(centerQ, centerR, q, r) > visibleRadius) continue;
				const ck = `${q},${r}`;
				if (blocked.has(ck)) continue;
				if (pathSet.has(ck) || waterSet.has(ck) || hutSet.has(ck)) continue;
				if (hash2(q * 0.57, r * 0.73) < 0.992) continue;
				const topY = this.world.getTopSolidY(q, r);
				if (topY < 2) continue;
				if (this.world.getType(q, r, topY) !== 'grass') continue;
				const trunkBlocks = 3 + Math.floor(hash2(q * 1.9, r * 2.1) * 3);
				anchors.push({ q, r, trunkBlocks });
				for (const dq of [-2, -1, 0, 1, 2]) {
					for (const dr of [-2, -1, 0, 1, 2]) {
						if (hexDist(0, 0, dq, dr) > 2) continue;
						blocked.add(`${q + dq},${r + dr}`);
					}
				}
			}
		}
		if (!anchors.length) return;

		const trunkGeo = new THREE.CylinderGeometry(HEX_RADIUS, HEX_RADIUS, BLOCK_H, 6, 1, false);
		trunkGeo.rotateY(Math.PI / 6);
		const leafGeo = trunkGeo.clone();
		const trunkMat = this.mats.timber[0] as THREE.MeshLambertMaterial;
		const trunkCells: Array<{ q: number; r: number; y: number }> = [];
		const leafCells = new Set<string>();
		for (const a of anchors) {
			const baseY = this.world.getTopSolidY(a.q, a.r) + 1;
			for (let i = 0; i < a.trunkBlocks; i++) {
				trunkCells.push({ q: a.q, r: a.r, y: baseY + i });
			}
			const crownY = baseY + a.trunkBlocks - 1;
			for (let dq = -2; dq <= 2; dq++) {
				for (let dr = -2; dr <= 2; dr++) {
					const hd = hexDist(0, 0, dq, dr);
					if (hd > 2) continue;
					const q = a.q + dq;
					const r = a.r + dr;
					for (let ly = crownY; ly <= crownY + 2; ly++) {
						if (ly === crownY + 2 && hd > 1) continue;
						leafCells.add(`${q},${r},${ly}`);
					}
				}
			}
		}

		const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, trunkCells.length);
		const leaves = new THREE.InstancedMesh(leafGeo, this.treeLeafBlockMaterial, leafCells.size);
		for (let i = 0; i < trunkCells.length; i++) {
			const c = trunkCells[i];
			const w = axialToWorld(c.q, c.r);
			this.tmpObject.position.set(w.x, (c.y + 0.5) * BLOCK_H, w.z);
			this.tmpObject.rotation.set(0, 0, 0);
			this.tmpObject.scale.set(1, 1, 1);
			this.tmpObject.updateMatrix();
			trunks.setMatrixAt(i, this.tmpObject.matrix);
		}
		let li = 0;
		for (const k of leafCells) {
			const [q, r, y] = k.split(',').map((p) => Number.parseInt(p, 10));
			const w = axialToWorld(q, r);
			this.tmpObject.position.set(w.x, (y + 0.5) * BLOCK_H, w.z);
			this.tmpObject.rotation.set(0, 0, 0);
			this.tmpObject.scale.set(1, 1, 1);
			this.tmpObject.updateMatrix();
			leaves.setMatrixAt(li++, this.tmpObject.matrix);
		}

		trunks.instanceMatrix.needsUpdate = true;
		leaves.instanceMatrix.needsUpdate = true;
		this.treeTrunkBlocks = trunks;
		this.treeLeafBlocks = leaves;
		this.detailGroup.add(trunks, leaves);
	}

	private rebuildFireFx(): void {
		for (const fx of this.fireFx) {
			this.detailGroup.remove(fx.fire, fx.smoke);
			(fx.fire.material as THREE.SpriteMaterial).dispose();
			(fx.smoke.material as THREE.SpriteMaterial).dispose();
		}
		this.fireFx = [];
		if (!this.fireSpriteMaterial || !this.smokeSpriteMaterial) return;

		let count = 0;
		for (const mesh of this.world.blocks.values()) {
			const ud = mesh.userData as BlockUserData;
			if (ud.typeKey !== 'fire') continue;
			const fire = new THREE.Sprite(this.fireSpriteMaterial.clone());
			const smoke = new THREE.Sprite(this.smokeSpriteMaterial.clone());
			fire.position.set(mesh.position.x, mesh.position.y + 0.62, mesh.position.z);
			fire.scale.set(0.95, 1.4, 1);
			smoke.position.set(mesh.position.x, mesh.position.y + 1.1, mesh.position.z);
			smoke.scale.set(0.7, 0.7, 1);
			this.detailGroup.add(fire, smoke);
			this.fireFx.push({
				fire,
				smoke,
				baseX: mesh.position.x,
				baseY: mesh.position.y,
				baseZ: mesh.position.z,
				phase: hash2(ud.q * 1.37, ud.r * 1.91) * Math.PI * 2
			});
			count++;
			if (count >= 48) break;
		}
	}

	private updateFireFx(nowMs: number): void {
		for (const fx of this.fireFx) {
			const t = nowMs * 0.001 + fx.phase;
			const pulse = 0.85 + Math.sin(t * 6.2) * 0.16;
			const fireMat = fx.fire.material as THREE.SpriteMaterial;
			fireMat.opacity = 0.78 + Math.sin(t * 8.1) * 0.15;
			fx.fire.position.set(fx.baseX, fx.baseY + 0.62 + Math.sin(t * 5.4) * 0.05, fx.baseZ);
			fx.fire.scale.set(0.92 * pulse, 1.34 * pulse, 1);

			const smokeMat = fx.smoke.material as THREE.SpriteMaterial;
			const cycle = (t * 0.22) % 1;
			smokeMat.opacity = Math.max(0, 0.42 * (1 - cycle));
			fx.smoke.position.set(
				fx.baseX + Math.sin(t * 1.7) * 0.15 * cycle,
				fx.baseY + 0.9 + cycle * 1.65,
				fx.baseZ + Math.cos(t * 1.4) * 0.12 * cycle
			);
			const s = 0.58 + cycle * 1.34;
			fx.smoke.scale.set(s, s, 1);
		}
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

	private createVillagerMesh(): THREE.Group {
		const g = new THREE.Group();
		const skin = new THREE.MeshStandardMaterial({ color: 0xf2c7a8, roughness: 0.9 });
		const shirt = new THREE.MeshStandardMaterial({ color: 0x8b6f4b, roughness: 0.9 });
		const pants = new THREE.MeshStandardMaterial({ color: 0x514236, roughness: 0.92 });

		const head = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skin);
		head.position.set(0, 1.34, 0);
		const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.62, 0.34), shirt);
		body.position.set(0, 0.88, 0);
		const legL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.52, 0.18), pants);
		legL.position.set(-0.11, 0.26, 0);
		legL.name = 'legL';
		const legR = legL.clone();
		legR.position.set(0.11, 0.26, 0);
		legR.name = 'legR';
		const armL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.14), skin);
		armL.position.set(-0.34, 0.88, 0);
		armL.name = 'armL';
		const armR = armL.clone();
		armR.position.set(0.34, 0.88, 0);
		armR.name = 'armR';
		g.add(head, body, legL, legR, armL, armR);
		return g;
	}

	private createAnimalMesh(species: 'aurochs' | 'deer' | 'sheep' | 'boar'): THREE.Group {
		const g = new THREE.Group();
		const colorBySpecies: Record<'aurochs' | 'deer' | 'sheep' | 'boar', number> = {
			aurochs: 0x5d4332,
			deer: 0x8f6644,
			sheep: 0xd9d2c5,
			boar: 0x4d3b2d
		};
		const fur = new THREE.MeshStandardMaterial({ color: colorBySpecies[species], roughness: 0.94 });
		const dark = new THREE.MeshStandardMaterial({ color: 0x2e2520, roughness: 0.96 });

		const body = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.42, 0.36), fur);
		body.position.set(0, 0.53, 0);
		const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.24), fur);
		head.position.set(0, 0.56, 0.42);
		const snout = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.1), dark);
		snout.position.set(0, 0.52, 0.58);
		const legGeo = new THREE.BoxGeometry(0.12, 0.34, 0.12);
		const legOffsets: Array<[number, number]> = [
			[-0.22, -0.12],
			[0.22, -0.12],
			[-0.22, 0.12],
			[0.22, 0.12]
		];
		for (let i = 0; i < legOffsets.length; i++) {
			const [x, z] = legOffsets[i];
			const leg = new THREE.Mesh(legGeo, dark);
			leg.position.set(x, 0.17, z);
			leg.name = `leg${i}`;
			g.add(leg);
		}
		if (species === 'aurochs' || species === 'boar') {
			const horn = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), dark);
			const horn2 = horn.clone();
			horn.position.set(-0.1, 0.71, 0.34);
			horn2.position.set(0.1, 0.71, 0.34);
			g.add(horn, horn2);
		}
		g.add(body, head, snout);
		return g;
	}

	private createNpcs(spawns: Array<{ q: number; r: number }>): void {
		const inStonehenge = this.currentBiome?.id === 'grassland-origins';
		const maxNpcs = inStonehenge ? 28 : 16;
		const animalKinds: Array<'aurochs' | 'deer' | 'sheep' | 'boar'> = ['aurochs', 'deer', 'sheep', 'boar'];
		const ritualAnchors = inStonehenge ? this.scalePlanCells(STONEHENGE_PLAN.standingStoneSeeds, STONEHENGE_PLAN_SCALE) : [];
		const hearthAnchors = inStonehenge ? this.scalePlanCells(STONEHENGE_PLAN.hearthCenters, STONEHENGE_PLAN_SCALE) : [];
		const villageAnchors = inStonehenge ? this.scalePlanCells(STONEHENGE_PLAN.hutCenters, STONEHENGE_PLAN_SCALE) : [];
		const pickAnchor = (arr: NpcAnchorPoint[], idx: number, fallback: { q: number; r: number }): { q: number; r: number } =>
			arr.length ? arr[idx % arr.length] : fallback;

		for (let i = 0; i < Math.min(maxNpcs, spawns.length); i++) {
			const s = spawns[i];
			const worldPos = axialToWorld(s.q, s.r);
			const ground = this.world.getGroundY(s.q, s.r);
			const kind: 'villager' | 'animal' = inStonehenge ? (i % 4 === 0 ? 'animal' : 'villager') : i % 5 === 0 ? 'animal' : 'villager';
			const species = kind === 'animal' ? animalKinds[i % animalKinds.length] : undefined;
			let activity: NpcInstance['activity'] = 'patrol';
			let anchor = { q: s.q, r: s.r };
			if (inStonehenge) {
				if (kind === 'animal') {
					activity = 'grazing';
					anchor = pickAnchor(villageAnchors, i, s);
				} else if (i % 3 === 0) {
					activity = 'ritual';
					anchor = pickAnchor(ritualAnchors, i, s);
				} else if (i % 3 === 1) {
					activity = 'hearth';
					anchor = pickAnchor(hearthAnchors, i, s);
				} else {
					activity = 'village';
					anchor = pickAnchor(villageAnchors, i, s);
				}
			}
			const group = kind === 'animal' ? this.createAnimalMesh(species ?? 'deer') : this.createVillagerMesh();
			const groundOffset = kind === 'animal' ? 0.015 : 0.02;
			group.position.set(worldPos.x, ground + groundOffset, worldPos.z);
			this.npcGroup.add(group);
			this.npcs.push({
				id: `npc-${i}`,
				group,
				kind,
				species,
				activity,
				q: s.q,
				r: s.r,
				homeQ: s.q,
				homeR: s.r,
				anchorQ: anchor.q,
				anchorR: anchor.r,
				groundOffset,
				idleUntilMs: 0,
				yawOffset: 0,
				walkCycle: Math.random() * Math.PI * 2,
				speed: kind === 'animal' ? 1.05 + Math.random() * 0.85 : 0.78 + Math.random() * 0.72,
				phase: Math.random() * Math.PI * 2,
				targetQ: s.q,
				targetR: s.r
			});
			this.assignNpcTarget(this.npcs[this.npcs.length - 1]);
		}
	}

	private assignNpcTarget(npc: NpcInstance): void {
		const biomeRadius = this.currentBiome?.radius ?? WORLD_MIN_RADIUS;
		const pickAround = (q0: number, r0: number, rad: number): { q: number; r: number } => ({
			q: q0 + Math.floor(Math.random() * (rad * 2 + 1)) - rad,
			r: r0 + Math.floor(Math.random() * (rad * 2 + 1)) - rad
		});
		const isWalkable = (q: number, r: number): boolean => {
			if (hexDist(0, 0, q, r) > biomeRadius + 2) return false;
			const top = this.world.getTopSolidY(q, r);
			if (top < 1) return false;
			const topType = this.world.getType(q, r, top);
			return topType !== 'water' && topType !== 'fire';
		};

		for (let i = 0; i < 20; i++) {
			let cand: { q: number; r: number };
			switch (npc.activity) {
				case 'ritual': {
					const angle = npc.phase + Math.random() * Math.PI * 2;
					const rad = 6 + Math.floor(Math.random() * 6);
					cand = {
						q: npc.anchorQ + Math.round(Math.cos(angle) * rad),
						r: npc.anchorR + Math.round(Math.sin(angle) * rad)
					};
					break;
				}
				case 'hearth':
					cand = pickAround(npc.anchorQ, npc.anchorR, 3);
					break;
				case 'village':
					cand = pickAround(npc.anchorQ, npc.anchorR, 5);
					break;
				case 'grazing':
					cand = pickAround(npc.anchorQ, npc.anchorR, 7);
					if (hexDist(0, 0, cand.q, cand.r) < 18) continue;
					break;
				default:
					cand = pickAround(npc.homeQ, npc.homeR, 5);
					break;
			}
			if (!isWalkable(cand.q, cand.r)) continue;
			npc.targetQ = cand.q;
			npc.targetR = cand.r;
			return;
		}
		npc.targetQ = npc.anchorQ;
		npc.targetR = npc.anchorR;
	}

	private animateNpcRig(npc: NpcInstance, dt: number, moving: boolean): void {
		const cycleSpeed = moving ? 7.2 + npc.speed * 1.2 : 1.8;
		npc.walkCycle += dt * cycleSpeed;
		const wave = Math.sin(npc.walkCycle);

		if (npc.kind === 'villager') {
			const legL = npc.group.getObjectByName('legL') as THREE.Mesh | undefined;
			const legR = npc.group.getObjectByName('legR') as THREE.Mesh | undefined;
			const armL = npc.group.getObjectByName('armL') as THREE.Mesh | undefined;
			const armR = npc.group.getObjectByName('armR') as THREE.Mesh | undefined;
			const legTarget = moving ? wave * 0.55 : wave * 0.06;
			const armTarget = moving ? -wave * 0.45 : -wave * 0.04;
			if (legL) legL.rotation.x += (legTarget - legL.rotation.x) * Math.min(1, dt * 12);
			if (legR) legR.rotation.x += (-legTarget - legR.rotation.x) * Math.min(1, dt * 12);
			if (armL) armL.rotation.x += (armTarget - armL.rotation.x) * Math.min(1, dt * 12);
			if (armR) armR.rotation.x += (-armTarget - armR.rotation.x) * Math.min(1, dt * 12);
			return;
		}

		const leg0 = npc.group.getObjectByName('leg0') as THREE.Mesh | undefined;
		const leg1 = npc.group.getObjectByName('leg1') as THREE.Mesh | undefined;
		const leg2 = npc.group.getObjectByName('leg2') as THREE.Mesh | undefined;
		const leg3 = npc.group.getObjectByName('leg3') as THREE.Mesh | undefined;
		const stride = moving ? wave * 0.36 : wave * 0.03;
		if (leg0) leg0.rotation.x += (stride - leg0.rotation.x) * Math.min(1, dt * 12);
		if (leg3) leg3.rotation.x += (stride - leg3.rotation.x) * Math.min(1, dt * 12);
		if (leg1) leg1.rotation.x += (-stride - leg1.rotation.x) * Math.min(1, dt * 12);
		if (leg2) leg2.rotation.x += (-stride - leg2.rotation.x) * Math.min(1, dt * 12);
	}

	private yawDelta(current: number, target: number): number {
		let d = target - current;
		while (d > Math.PI) d -= Math.PI * 2;
		while (d < -Math.PI) d += Math.PI * 2;
		return d;
	}

	private updateNpcs(dt: number, nowMs: number): void {
		const playerAx = this.currentAxialUnderPlayer();
		for (const npc of this.npcs) {
			const visible = hexDist(playerAx.q, playerAx.r, npc.q, npc.r) <= this.renderRadius;
			npc.group.visible = visible;
			if (!visible) continue;

			if (npc.idleUntilMs > nowMs) {
				const ax = worldToAxial(npc.group.position.x, npc.group.position.z);
				const ground = this.world.getGroundY(ax.q, ax.r);
				const bob = npc.kind === 'animal' ? 0.01 : 0.015;
				npc.group.position.y = ground + npc.groundOffset + Math.sin(nowMs * 0.005 + npc.phase) * bob;
				this.animateNpcRig(npc, dt, false);
				continue;
			}

			const target = axialToWorld(npc.targetQ, npc.targetR);
			const dx = target.x - npc.group.position.x;
			const dz = target.z - npc.group.position.z;
			const dist = Math.hypot(dx, dz);

			if (dist < 0.25) {
				const pause =
					npc.activity === 'ritual'
						? 240 + Math.random() * 680
						: npc.activity === 'hearth'
							? 350 + Math.random() * 900
							: 220 + Math.random() * 620;
				npc.idleUntilMs = nowMs + pause;
				this.assignNpcTarget(npc);
				continue;
			}

			const step = Math.min(dist, npc.speed * dt);
			const desiredYaw = Math.atan2(dx, dz) + npc.yawOffset;
			const yd = this.yawDelta(npc.group.rotation.y, desiredYaw);
			npc.group.rotation.y += yd * Math.min(1, dt * 10.5);
			const moveYaw = npc.group.rotation.y - npc.yawOffset;
			const forwardX = Math.sin(moveYaw);
			const forwardZ = Math.cos(moveYaw);
			const along = Math.max(0, dx * forwardX + dz * forwardZ);
			const move = Math.min(step, along);
			npc.group.position.x += forwardX * move;
			npc.group.position.z += forwardZ * move;

			const ax = worldToAxial(npc.group.position.x, npc.group.position.z);
			npc.q = ax.q;
			npc.r = ax.r;
			const ground = this.world.getGroundY(ax.q, ax.r);
			const bobAmp = npc.kind === 'animal' ? 0.014 : 0.019;
			npc.group.position.y = ground + npc.groundOffset + Math.sin(nowMs * 0.006 + npc.phase) * bobAmp;
			this.animateNpcRig(npc, dt, true);
		}
	}

	private onKeyDown(e: KeyboardEvent): void {
		if (!this.bootstrapDone && !this.inspect.enabled) return;
		if (this.quizOpen && e.code === 'Escape') {
			this.closeQuiz('Quiz cancelled.');
			return;
		}

		this.audio.unlock();
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
			if (document.pointerLockElement) {
				void document.exitPointerLock();
			} else if (!this.touchUiEnabled) {
				this.lockPointer();
			}
			return;
		}

		if (this.input.consumeAction('resumeGame')) {
			if (!this.touchUiEnabled) this.lockPointer();
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
			btn.addEventListener(
				'pointerdown',
				(e) => {
					const pe = e as PointerEvent;
					if (pe.cancelable) pe.preventDefault();
					this.answerQuiz(i);
				},
				{ passive: false }
			);
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
		this.audio.unlock();
		e.preventDefault();
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
			this.invalidateHighlightCache();
			this.detailDirty = true;
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
			this.invalidateHighlightCache();
			this.detailDirty = true;
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

	private invalidateHighlightCache(): void {
		this.cachedHighlightHit = null;
		this.lastHighlightPickAt = -Infinity;
	}

	private updateHighlight(nowMs: number): PickHit | null {
		if (this.inspect.enabled || this.menuOpen || this.quizOpen) {
			this.highlight.visible = false;
			this.cachedHighlightHit = null;
			return null;
		}
		let hit = this.cachedHighlightHit;
		const mustRepick =
			!hit ||
			!hit.object.parent ||
			nowMs - this.lastHighlightPickAt >= 50;
		if (mustRepick) {
			hit = this.pickBlock();
			this.cachedHighlightHit = hit;
			this.lastHighlightPickAt = nowMs;
		}
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

	private updateRenderWindow(force = false): void {
		if (this.inspect.enabled) return;
		const ax = this.currentAxialUnderPlayer();
		if (!force && Number.isFinite(this.renderWindowCenterQ) && Number.isFinite(this.renderWindowCenterR)) {
			const moved = hexDist(this.renderWindowCenterQ, this.renderWindowCenterR, ax.q, ax.r);
			if (moved < this.renderWindowRecenterDistance) return;
		}
		this.world.setRenderWindow(ax.q, ax.r, this.renderRadius);
		this.renderWindowCenterQ = ax.q;
		this.renderWindowCenterR = ax.r;
		this.invalidateHighlightCache();
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
				this.updateRenderWindow();
				this.rebuildDetailDecor(false, nowMs);
			}
		}

		const hit = this.updateHighlight(nowMs);

		this.frame++;
		if (nowMs - this.lastFpsT > 400) {
			this.fps = Math.round((this.frame * 1000) / (nowMs - this.lastFpsT));
			this.frame = 0;
			this.lastFpsT = nowMs;
		}

		this.updateHud(hit, nowMs);
		this.updatePortalHint();
		updateNatureTextureAnimation({
			grassTop: (this.mats.grass[1] as THREE.MeshLambertMaterial).map as THREE.Texture | null,
			grassSide: (this.mats.grass[0] as THREE.MeshLambertMaterial).map as THREE.Texture | null,
			sand: (this.mats.sand[0] as THREE.MeshLambertMaterial).map as THREE.Texture | null,
			water: (this.mats.water[0] as THREE.MeshLambertMaterial).map as THREE.Texture | null,
			fire: (this.mats.fire[0] as THREE.MeshLambertMaterial).map as THREE.Texture | null
		}, nowMs);
		this.updateFireFx(nowMs);
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

	private updateHud(hit: PickHit | null, nowMs: number): void {
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
		if (nowMs - this.lastHudUpdateAt < this.hudUpdateIntervalMs) return;
		this.lastHudUpdateAt = nowMs;

		if (!this.hudVerbose) {
			setHudRows(this.el.hud, [{ label: 'fps', value: String(this.fps) }]);
			return;
		}

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
			{
				label: 'hint',
				value: this.touchUiEnabled
					? 'tap break, two-finger tap place, portal button to travel'
					: 'LMB remove, RMB place, E portal quiz, Space jump, F fast'
			}
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
		this.audio.unlock();
		this.setMenu(false);
		if (!this.touchUiEnabled) this.lockPointer();
	}

	private lockPointer(): void {
		if (this.touchUiEnabled) return;
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
		this.el.mobileControls.style.display =
			this.touchUiEnabled && !this.menuOpen && !this.quizOpen && !this.inspect.enabled ? 'block' : 'none';
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
		this.updateJoystickBounds();
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
