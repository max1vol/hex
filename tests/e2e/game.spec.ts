import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test('loads game and captures screenshots', async ({ page }, testInfo) => {
	await page.goto('/');
	await expect(page.locator('canvas#c')).toBeVisible();
	await page.locator('canvas#c').click({ position: { x: 720, y: 420 } });

	await page.waitForFunction(() => {
		const stateText = (window as Window & { render_game_to_text?: () => string }).render_game_to_text?.();
		if (!stateText) return false;
		const state = JSON.parse(stateText) as { blocks?: number; biomeId?: string };
		return (state.blocks ?? 0) > 0 && typeof state.biomeId === 'string' && state.biomeId.length > 0;
	});

	await page.waitForTimeout(1200);

	const stateDump = await page.evaluate(() =>
		(window as Window & { render_game_to_text?: () => string }).render_game_to_text?.() ?? '{}'
	);
	fs.writeFileSync('docs/images/hexworld-playwright-state.json', stateDump);

	const screenshotErrors: string[] = [];
	try {
		await page.screenshot({ path: 'docs/images/hexworld-playwright-ui.png', timeout: 12000 });
	} catch (err) {
		screenshotErrors.push(`page.screenshot failed: ${String(err)}`);
	}
	try {
		await page.locator('canvas#c').screenshot({ path: 'docs/images/hexworld-playwright-canvas.png', timeout: 12000 });
	} catch (err) {
		screenshotErrors.push(`canvas screenshot failed: ${String(err)}`);
	}

	const canvasDataUrl = await page.evaluate(() => {
		const c = document.querySelector('canvas#c') as HTMLCanvasElement | null;
		if (!c) return null;
		try {
			return c.toDataURL('image/png');
		} catch {
			return null;
		}
	});
	if (canvasDataUrl && canvasDataUrl.startsWith('data:image/png;base64,')) {
		const base64 = canvasDataUrl.replace('data:image/png;base64,', '');
		fs.writeFileSync('docs/images/hexworld-playwright-canvas-dataurl.png', Buffer.from(base64, 'base64'));
	}

	if (screenshotErrors.length) {
		fs.writeFileSync('docs/images/hexworld-playwright-screenshot-errors.txt', screenshotErrors.join('\n'));
		testInfo.annotations.push({ type: 'screenshot-warning', description: screenshotErrors.join(' | ') });
	}
});
