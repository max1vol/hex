import type { BlockType, InspectConfig } from './types';

export function readUrlParams(): URLSearchParams {
	let params: URLSearchParams;
	try {
		params = new URLSearchParams(window.location.search);
	} catch {
		params = new URLSearchParams();
	}
	return params;
}

export function readInspectConfig(params: URLSearchParams): InspectConfig {
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

export function normalizeInspectBlockType(type: string): BlockType {
	if (
		type === 'grass' ||
		type === 'dirt' ||
		type === 'stone' ||
		type === 'sand' ||
		type === 'water' ||
		type === 'bedrock' ||
		type === 'brick' ||
		type === 'snow' ||
		type === 'ice' ||
		type === 'metal' ||
		type === 'asphalt' ||
		type === 'art' ||
		type === 'timber' ||
		type === 'thatch' ||
		type === 'fire'
	)
		return type;
	return 'grass';
}
