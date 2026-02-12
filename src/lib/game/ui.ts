import type { PaletteItem } from './types';

export function buildHotbar(hotbar: HTMLDivElement, palette: PaletteItem[]): void {
	hotbar.innerHTML = '';
	palette.forEach((p, i) => {
		const slot = document.createElement('div');
		slot.className = 'slot';
		slot.dataset.idx = String(i);

		const num = document.createElement('div');
		num.className = 'num';
		num.textContent = String(i + 1);
		slot.appendChild(num);

		const swatch = document.createElement('div');
		swatch.className = 'swatch';
		swatch.style.background = `#${p.color.toString(16).padStart(6, '0')}`;
		swatch.style.backgroundImage = `url(${p.tex})`;
		swatch.style.backgroundSize = 'cover';
		swatch.style.backgroundPosition = 'center';
		slot.appendChild(swatch);

		hotbar.appendChild(slot);
	});
}

export function updateHotbar(hotbar: HTMLDivElement, selectedPaletteIdx: number): void {
	const slots = hotbar.querySelectorAll<HTMLDivElement>('.slot');
	slots.forEach((el) => el.classList.toggle('active', Number(el.dataset.idx) === selectedPaletteIdx));
}

export function setHudRows(hud: HTMLDivElement, rows: Array<{ label: string; value: string }>): void {
	hud.classList.toggle('compact', rows.length <= 1);
	const html = rows
		.map(
			(row) =>
				`<div class="row"><span class="label">${escapeHtml(row.label)}</span><span>${row.value}</span></div>`
		)
		.join('');
	if (hud.dataset.rows === html) return;
	hud.dataset.rows = html;
	hud.innerHTML = html;
}

function escapeHtml(str: string): string {
	return str
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#39;');
}
