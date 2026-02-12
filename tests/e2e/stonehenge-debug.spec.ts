import { expect, test } from '@playwright/test';

test('stonehenge debug endpoint renders split views', async ({ page }) => {
	await page.goto('/debug/stonehenge');
	await expect(page.locator('h1')).toHaveText('Stonehenge Debug Views');
	const topCanvas = page.locator('canvas').first();
	await expect(topCanvas).toBeVisible();
	await expect(page.locator('text=Unsupported stone columns')).toBeVisible();
	expect(await page.locator('img').count()).toBeGreaterThan(0);
});
