import type * as THREE from 'three';

export type BlockType =
	| 'grass'
	| 'dirt'
	| 'stone'
	| 'sand'
	| 'water'
	| 'bedrock'
	| 'brick'
	| 'snow'
	| 'ice'
	| 'metal'
	| 'asphalt'
	| 'art'
	| 'timber'
	| 'thatch'
	| 'fire';

export type WeatherKind = 'clear' | 'rain' | 'snow' | 'mist';

export interface AxialCoord {
	q: number;
	r: number;
}

export interface BlockUserData {
	q: number;
	r: number;
	y: number;
	typeKey: BlockType;
	isBlock: true;
}

export interface BlockDefinition {
	key: BlockType;
	label: string;
	color: number;
	tex: string;
	transparent?: boolean;
	opacity?: number;
	emissive?: number;
}

export interface PaletteItem extends BlockDefinition {}

export type BlockMaterialMap = Record<BlockType, THREE.Material[]>;

export interface InspectConfig {
	enabled: boolean;
	type: string;
	angle0: number;
	spin: boolean;
	ui: boolean;
	distance: number;
	height: number;
}

export interface HexWorldElements {
	canvas: HTMLCanvasElement;
	overlay: HTMLDivElement;
	cta: HTMLButtonElement;
	hud: HTMLDivElement;
	toast: HTMLDivElement;
	crosshair: HTMLDivElement;
	hotbar: HTMLDivElement;
	hint: HTMLDivElement;
	eraBanner: HTMLDivElement;
	quizModal: HTMLDivElement;
	quizTitle: HTMLHeadingElement;
	quizQuestion: HTMLParagraphElement;
	quizChoices: HTMLDivElement;
	quizFeedback: HTMLParagraphElement;
	quizCancel: HTMLButtonElement;
	mobileControls: HTMLDivElement;
}

export interface GameStatePayload {
	mode: 'inspect' | 'menu' | 'play' | 'quiz';
	muted: boolean;
	selected: BlockType | null;
	blocks: number;
	fps?: number;
	biomeId?: string;
	weather?: WeatherKind;
	timeOfDay?: string;
	position?: {
		x: number;
		y: number;
		z: number;
	};
	look?: {
		yaw: number;
		pitch: number;
	};
	cell?: {
		q: number;
		r: number;
	};
	inspect?: {
		type: BlockType;
		angle: number;
		spin: boolean;
	};
}

export interface BlockPlacement {
	q: number;
	r: number;
	y: number;
	type: BlockType;
}

export interface PortalLink {
	toBiome: string;
	label: string;
	anchor: 'north' | 'south' | 'east' | 'west' | 'northEast' | 'southWest';
	requirement: 'quiz';
}

export interface QuizQuestion {
	id: string;
	prompt: string;
	options: string[];
	correctIndex: number;
	explanation: string;
}

export interface BiomeAmbience {
	skyDayTop: number;
	skyDayBottom: number;
	skyNightTop: number;
	skyNightBottom: number;
	fogColor: number;
	fogDensity: number;
	sunColor: number;
	weatherPool: WeatherKind[];
	musicRoot: number;
	musicAccent: number;
	tempoBpm: number;
}

export interface BiomeBlockSet {
	surface: BlockType;
	subsurface: BlockType;
	deep: BlockType;
	shore: BlockType;
	water: BlockType;
	bedrock: BlockType;
}

export interface BiomeManifest {
	id: string;
	place: string;
	eraLabel: string;
	yearLabel: string;
	description: string;
	radius: number;
	seaLevel: number;
	heightBoost: number;
	noiseScale: number;
	palette: BlockType[];
	blockSet: BiomeBlockSet;
	ambience: BiomeAmbience;
	portalRequirement: {
		mode: 'quiz';
		minCorrect: number;
	};
	portalLinks: PortalLink[];
	learningGoals: string[];
	interactiveTasks: string[];
	landmarkKits: string[];
	quizzes: QuizQuestion[];
}

export interface GeneratedBiomeData {
	blocks: BlockPlacement[];
	baseBlocks: Map<string, BlockType>;
	npcSpawns: AxialCoord[];
	portalAnchors: Array<{ q: number; r: number; link: PortalLink }>;
}

export interface SaveState {
	version: number;
	currentBiomeId: string;
	unlockedBiomes: string[];
	biomeEdits: Record<string, Record<string, BlockType | null>>;
}

export interface PortalInstance {
	id: string;
	toBiome: string;
	label: string;
	q: number;
	r: number;
	y: number;
	mesh: THREE.Mesh;
	baseMesh: THREE.Mesh;
}

export interface NpcInstance {
	id: string;
	group: THREE.Group;
	kind: 'villager' | 'animal';
	species?: 'aurochs' | 'deer' | 'sheep' | 'boar';
	activity: 'ritual' | 'hearth' | 'village' | 'grazing' | 'patrol';
	q: number;
	r: number;
	homeQ: number;
	homeR: number;
	anchorQ: number;
	anchorR: number;
	groundOffset: number;
	idleUntilMs: number;
	yawOffset: number;
	walkCycle: number;
	speed: number;
	phase: number;
	targetQ: number;
	targetR: number;
}

export interface MovementState {
	grounded: boolean;
	feetY: number;
	velocityY: number;
}

export interface MovementInput {
	forward: boolean;
	backward: boolean;
	left: boolean;
	right: boolean;
	jump: boolean;
	descend: boolean;
}
