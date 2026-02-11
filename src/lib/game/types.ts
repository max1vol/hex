import type * as THREE from 'three';

export type BlockType = 'grass' | 'dirt' | 'stone' | 'sand';

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

export interface PaletteItem {
	key: BlockType;
	label: string;
	color: number;
	tex: string;
}

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
}

export interface GameStatePayload {
	mode: 'inspect' | 'menu' | 'play';
	muted: boolean;
	selected: BlockType | null;
	blocks: number;
	inspect?: {
		type: BlockType;
		angle: number;
		spin: boolean;
	};
}
