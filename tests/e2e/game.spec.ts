import fs from 'node:fs';
import { expect, test } from '@playwright/test';

test('loads game and reaches playable state', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('canvas#c')).toBeVisible();
	await page.mouse.click(720, 420);

	await page.waitForFunction(() => {
		const stateText = (window as Window & { render_game_to_text?: () => string }).render_game_to_text?.();
		if (!stateText) return false;
		const state = JSON.parse(stateText) as { blocks?: number; biomeId?: string };
		return (state.blocks ?? 0) > 0 && typeof state.biomeId === 'string' && state.biomeId.length > 0;
	});
	await page.evaluate(() => {
		(window as Window & { hexworld_debug_action?: (action: string) => boolean }).hexworld_debug_action?.(
			'goto_overview'
		);
	});

	await page.waitForTimeout(1200);

	const stateDump = await page.evaluate(() =>
		(window as Window & { render_game_to_text?: () => string }).render_game_to_text?.() ?? '{}'
	);
	fs.writeFileSync('docs/images/hexworld-playwright-state.json', stateDump);
	const parsed = JSON.parse(stateDump) as { blocks?: number; biomeId?: string };
	expect(parsed.blocks ?? 0).toBeGreaterThan(1000);
	expect(typeof parsed.biomeId).toBe('string');
});
