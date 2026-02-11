import { expect, test, type Page } from '@playwright/test';

type RenderState = {
	position?: { x: number; y: number; z: number };
	look?: { yaw: number; pitch: number };
	blocks?: number;
};

async function readState(page: Page): Promise<RenderState> {
	return page.evaluate(() => {
		const raw = (window as Window & { render_game_to_text?: () => string }).render_game_to_text?.() ?? '{}';
		return JSON.parse(raw) as RenderState;
	});
}

test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } });

test('touch joystick moves and touch drag rotates look', async ({ page }) => {
	await page.goto('/');
	await page.waitForFunction(() => {
		const raw = (window as Window & { render_game_to_text?: () => string }).render_game_to_text?.() ?? '{}';
		const state = JSON.parse(raw) as { blocks?: number };
		return (state.blocks ?? 0) > 0;
	});

	const start = await readState(page);
	const joystick = page.locator('[data-control="joystick"]');
	await expect(joystick).toBeVisible();
	const joystickBox = await joystick.boundingBox();
	expect(joystickBox).not.toBeNull();
	if (!joystickBox) return;
	const jx = joystickBox.x + joystickBox.width / 2;
	const jy = joystickBox.y + joystickBox.height / 2;

	await page.dispatchEvent('[data-control="joystick"]', 'pointerdown', {
		pointerType: 'touch',
		pointerId: 41,
		isPrimary: true,
		clientX: jx,
		clientY: jy,
		bubbles: true
	});
	await page.dispatchEvent('[data-control="joystick"]', 'pointermove', {
		pointerType: 'touch',
		pointerId: 41,
		isPrimary: true,
		clientX: jx,
		clientY: jy - joystickBox.height * 0.38,
		bubbles: true
	});
	await page.waitForTimeout(650);
	await page.dispatchEvent('[data-control="joystick"]', 'pointerup', {
		pointerType: 'touch',
		pointerId: 41,
		isPrimary: true,
		clientX: jx,
		clientY: jy - joystickBox.height * 0.38,
		bubbles: true
	});

	const moved = await readState(page);
	const movedDistance = Math.hypot(
		(moved.position?.x ?? 0) - (start.position?.x ?? 0),
		(moved.position?.z ?? 0) - (start.position?.z ?? 0)
	);
	expect(movedDistance).toBeGreaterThan(0.05);

	const canvas = page.locator('canvas#c');
	const canvasBox = await canvas.boundingBox();
	expect(canvasBox).not.toBeNull();
	if (!canvasBox) return;
	const cx = canvasBox.x + canvasBox.width * 0.72;
	const cy = canvasBox.y + canvasBox.height * 0.42;
	const beforeLook = await readState(page);

	await page.dispatchEvent('canvas#c', 'pointerdown', {
		pointerType: 'touch',
		pointerId: 42,
		isPrimary: true,
		clientX: cx,
		clientY: cy,
		bubbles: true
	});
	await page.dispatchEvent('canvas#c', 'pointermove', {
		pointerType: 'touch',
		pointerId: 42,
		isPrimary: true,
		clientX: cx + 130,
		clientY: cy - 55,
		bubbles: true
	});
	await page.dispatchEvent('canvas#c', 'pointerup', {
		pointerType: 'touch',
		pointerId: 42,
		isPrimary: true,
		clientX: cx + 130,
		clientY: cy - 55,
		bubbles: true
	});
	await page.waitForTimeout(120);
	const afterLook = await readState(page);
	const yawDelta = Math.abs((afterLook.look?.yaw ?? 0) - (beforeLook.look?.yaw ?? 0));
	expect(yawDelta).toBeGreaterThan(0.02);
});
