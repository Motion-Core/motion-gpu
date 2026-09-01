import { expect, test } from '@playwright/test';
import { expectValueStable, getCanvasHash, toNumber, waitForCanvasHashChange } from './helpers';

test.describe('spektral shader recovery e2e', () => {
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
		const goodHashB = await waitForCanvasHashChange(page, goodHashA);
		expect(goodHashB).not.toBe(goodHashA);

		await page.getByTestId('set-bad-material').click();
		await expect
			.poll(async () => toNumber(await page.getByTestId('error-count').textContent()), {
				timeout: 5_000
			})
			.toBeGreaterThan(0);
		await expect(page.getByTestId('last-error')).toContainText('WGSL compilation failed');

		const stalledFrames = await expectValueStable(
			async () => toNumber(await frameCounter.textContent()),
			360
		);
		expect(toNumber(await frameCounter.textContent())).toBe(stalledFrames);

		await page.getByTestId('set-good-material').click();
		await expect
			.poll(async () => toNumber(await frameCounter.textContent()), {
				timeout: 5_000
			})
			.toBeGreaterThan(stalledFrames);

		const recoveredHashA = await getCanvasHash(page);
		const recoveredHashB = await waitForCanvasHashChange(page, recoveredHashA);
		expect(recoveredHashB).not.toBe(recoveredHashA);
	});
});
