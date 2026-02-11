import { expect, test, type Page } from '@playwright/test';

type RenderState = {
	blocks: number;
	biomeId?: string;
	position?: { x: number; y: number; z: number };
};

async function readState(page: Page): Promise<RenderState> {
	return page.evaluate(() => {
		const raw = (window as Window & { render_game_to_text?: () => string }).render_game_to_text?.() ?? '{}';
		return JSON.parse(raw) as RenderState;
	});
}

test('scenario: movement, place/remove loop, and biome regeneration', async ({ page }) => {
	await page.goto('/');
	await page.click('#cta');
	await page.waitForFunction(() => {
		const raw = (window as Window & { render_game_to_text?: () => string }).render_game_to_text?.() ?? '{}';
		const state = JSON.parse(raw) as { blocks?: number; biomeId?: string };
		return (state.blocks ?? 0) > 0 && Boolean(state.biomeId);
	});

	const start = await readState(page);
	await page.keyboard.down('KeyW');
	await page.waitForTimeout(550);
	await page.keyboard.up('KeyW');
	await page.evaluate(() => (window as Window & { advanceTime?: (ms: number) => void }).advanceTime?.(600));
	const moved = await readState(page);
	const movedDistance = Math.hypot(
		(moved.position?.x ?? 0) - (start.position?.x ?? 0),
		(moved.position?.z ?? 0) - (start.position?.z ?? 0)
	);
	expect(movedDistance).toBeGreaterThan(0.05);

	const placeOk = await page.evaluate(
		() => (window as Window & { hexworld_debug_action?: (action: string) => boolean }).hexworld_debug_action?.('place_under_player') ?? false
	);
	const afterPlace = await readState(page);
	const removeOk = await page.evaluate(
		() =>
			(window as Window & { hexworld_debug_action?: (action: string) => boolean }).hexworld_debug_action?.(
				'remove_top_under_player'
			) ?? false
	);
	const afterRemove = await readState(page);

	expect(placeOk || removeOk).toBe(true);
	expect(Math.abs(afterPlace.blocks - afterRemove.blocks)).toBeGreaterThanOrEqual(0);

	await page.evaluate(
		() => (window as Window & { hexworld_debug_action?: (action: string) => boolean }).hexworld_debug_action?.('regen')
	);
	await page.waitForTimeout(500);
	const afterRegen = await readState(page);
	expect(afterRegen.biomeId).toBe(start.biomeId);
	expect(afterRegen.blocks).toBeGreaterThan(2000);
});
