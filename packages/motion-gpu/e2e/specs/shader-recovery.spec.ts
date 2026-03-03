import { expect, test } from '@playwright/test';
import { getCanvasHash, toNumber } from './helpers';

test.describe('motion-gpu shader recovery e2e', () => {
	test('reports shader compilation failure and recovers after fixing material', async ({
		page
	}) => {
		await page.goto('/?scenario=shader-recovery');
		await expect(page.getByTestId('scenario')).toHaveText('shader-recovery');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('error-count')).toHaveText('0');
		await expect(page.getByTestId('last-error')).toHaveText('none');

		const frameCounter = page.getByTestId('frame-count');
		await expect.poll(async () => toNumber(await frameCounter.textContent())).toBeGreaterThan(0);

		const goodHashA = await getCanvasHash(page);
		await page.waitForTimeout(180);
		const goodHashB = await getCanvasHash(page);
		expect(goodHashB).not.toBe(goodHashA);

		await page.getByTestId('set-bad-material').click();
		await expect
			.poll(async () => toNumber(await page.getByTestId('error-count').textContent()), {
				timeout: 5_000
			})
			.toBeGreaterThan(0);
		await expect(page.getByTestId('last-error')).toContainText('WGSL compilation failed');

		const stalledFrames = toNumber(await frameCounter.textContent());
		await page.waitForTimeout(360);
		expect(toNumber(await frameCounter.textContent())).toBe(stalledFrames);

		await page.getByTestId('set-good-material').click();
		await expect
			.poll(async () => toNumber(await frameCounter.textContent()), {
				timeout: 5_000
			})
			.toBeGreaterThan(stalledFrames);

		const recoveredHashA = await getCanvasHash(page);
		await page.waitForTimeout(180);
		const recoveredHashB = await getCanvasHash(page);
		expect(recoveredHashB).not.toBe(recoveredHashA);
	});
});
