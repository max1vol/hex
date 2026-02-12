import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const OUT_DIR = path.join('docs', 'images', 'block-inspect');

const VIEWS = [
	{
		name: 'fire-side',
		query: '/?inspect=1&type=fire&ui=1&angle=90&dist=4.8&height=2.2'
	},
	{
		name: 'fire-top',
		query: '/?inspect=1&type=fire&ui=1&angle=0&dist=0.05&height=7.6'
	},
	{
		name: 'fire-natural',
		query: '/?inspect=1&type=fire&ui=1&angle=35&dist=5.1&height=2.8'
	}
];

test('renders fire block from side, top, and natural angles', async ({ page }) => {
	fs.mkdirSync(OUT_DIR, { recursive: true });

	for (const view of VIEWS) {
		await page.goto(view.query);
		await page.waitForFunction(() => {
			const raw = (window as Window & { render_game_to_text?: () => string }).render_game_to_text?.() ?? '{}';
			const state = JSON.parse(raw) as { mode?: string; blocks?: number };
			return state.mode === 'inspect' && (state.blocks ?? 0) >= 1;
		});
		const canvas = page.locator('canvas#c');
		await expect(canvas).toBeVisible();
		await canvas.screenshot({ path: path.join(OUT_DIR, `${view.name}.png`) });
	}
});
