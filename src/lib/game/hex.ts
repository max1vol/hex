import { EPS, HEX_RADIUS } from './constants';
import type { AxialCoord } from './types';

export function axialToWorld(q: number, r: number): { x: number; z: number } {
	const x = HEX_RADIUS * (3 / 2) * q;
	const z = HEX_RADIUS * Math.sqrt(3) * (r + q / 2);
	return { x, z };
}

export function axialRound(q: number, r: number): AxialCoord {
	const x = q;
	const z = r;
	const y = -x - z;

	let rx = Math.round(x);
	let ry = Math.round(y);
	let rz = Math.round(z);

	const dx = Math.abs(rx - x);
	const dy = Math.abs(ry - y);
	const dz = Math.abs(rz - z);

	if (dx > dy && dx > dz) rx = -ry - rz;
	else if (dy > dz) ry = -rx - rz;
	else rz = -rx - ry;

	return { q: rx, r: rz };
}

export function worldToAxial(x: number, z: number): AxialCoord {
	const q = (2 / 3) * (x / HEX_RADIUS);
	const r = z / (Math.sqrt(3) * HEX_RADIUS) - q / 2;
	return axialRound(q, r);
}

export function hexDist(q1: number, r1: number, q2: number, r2: number): number {
	const dq = q2 - q1;
	const dr = r2 - r1;
	const x = dq;
	const z = dr;
	const y = -x - z;
	return (Math.abs(x) + Math.abs(y) + Math.abs(z)) / 2;
}

export function hash2(q: number, r: number): number {
	const s = Math.sin(q * 127.1 + r * 311.7) * 43758.5453123;
	return s - Math.floor(s);
}

export function fbm(q: number, r: number): number {
	let f = 0;
	let amp = 0.55;
	let freq = 0.19;
	let norm = 0;

	for (let i = 0; i < 4; i++) {
		const x = q * freq;
		const y = r * freq;
		const x0 = Math.floor(x);
		const y0 = Math.floor(y);
		const tx = x - x0;
		const ty = y - y0;

		const a = hash2(x0, y0);
		const b = hash2(x0 + 1, y0);
		const c = hash2(x0, y0 + 1);
		const d = hash2(x0 + 1, y0 + 1);
		const sx = tx * tx * (3 - 2 * tx);
		const sy = ty * ty * (3 - 2 * ty);
		const lerp1 = a + (b - a) * sx;
		const lerp2 = c + (d - c) * sx;
		const v = lerp1 + (lerp2 - lerp1) * sy;

		f += v * amp;
		norm += amp;
		amp *= 0.5;
		freq *= 2;
	}

	return f / Math.max(EPS, norm);
}
