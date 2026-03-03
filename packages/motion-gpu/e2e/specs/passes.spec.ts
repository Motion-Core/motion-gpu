import { expect, test } from '@playwright/test';
import { getCanvasHash, toNumber } from './helpers';

test.describe('motion-gpu passes e2e', () => {
	test('applies and removes post-process pass in manual render mode', async ({ page }) => {
		await page.goto('/?scenario=passes');
		await expect(page.getByTestId('scenario')).toHaveText('passes');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('render-mode')).toHaveText('manual');
		await expect(page.getByTestId('pass-mode')).toHaveText('none');
		await expect(page.getByTestId('last-error')).toHaveText('none');

		const frameCounter = page.getByTestId('frame-count');
		await expect.poll(async () => toNumber(await frameCounter.textContent())).toBeGreaterThan(0);

		await page.waitForTimeout(200);
		const baseHash = await getCanvasHash(page);
		await page.waitForTimeout(220);
		expect(await getCanvasHash(page)).toBe(baseHash);

		await page.getByTestId('set-pass-invert').click();
		await expect(page.getByTestId('pass-mode')).toHaveText('invert');
		await page.getByTestId('advance-once').click();
		await page.waitForTimeout(140);
		const invertHash = await getCanvasHash(page);
		expect(invertHash).not.toBe(baseHash);

		await page.waitForTimeout(220);
		expect(await getCanvasHash(page)).toBe(invertHash);

		await page.getByTestId('set-pass-none').click();
		await expect(page.getByTestId('pass-mode')).toHaveText('none');
		await page.getByTestId('advance-once').click();
		await page.waitForTimeout(140);
		expect(await getCanvasHash(page)).toBe(baseHash);
		await expect(page.getByTestId('last-error')).toHaveText('none');
	});
});
