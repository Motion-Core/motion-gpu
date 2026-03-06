import { expect, test } from '@playwright/test';
import {
	expectCanvasHashStable,
	getCanvasHash,
	toNumber,
	waitForCanvasHash,
	waitForCanvasHashChange
} from './helpers';

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

		const baseHash = await getCanvasHash(page);
		await expectCanvasHashStable(page, baseHash, 220);

		await page.getByTestId('set-pass-invert').click();
		await expect(page.getByTestId('pass-mode')).toHaveText('invert');
		await page.getByTestId('advance-once').click();
		const invertHash = await waitForCanvasHashChange(page, baseHash);
		expect(invertHash).not.toBe(baseHash);

		await expectCanvasHashStable(page, invertHash, 220);

		await page.getByTestId('set-pass-named').click();
		await expect(page.getByTestId('pass-mode')).toHaveText('named');
		await page.getByTestId('advance-once').click();
		const namedHash = await waitForCanvasHashChange(page, invertHash);
		expect(namedHash).not.toBe(baseHash);
		expect(namedHash).not.toBe(invertHash);

		await expectCanvasHashStable(page, namedHash, 220);

		await page.getByTestId('set-pass-none').click();
		await expect(page.getByTestId('pass-mode')).toHaveText('none');
		await page.getByTestId('advance-once').click();
		await waitForCanvasHash(page, baseHash);
		await expect(page.getByTestId('last-error')).toHaveText('none');
	});
});
