import { expect, test } from '@playwright/test';
import {
	expectCanvasHashStable,
	getCanvasHash,
	getCanvasPixel,
	toNumber,
	waitForCanvasHash,
	waitForCanvasHashChange
} from './helpers';

test.describe('spektral passes e2e', () => {
	async function expectFragmentUvGradient(page: Parameters<typeof getCanvasPixel>[0]) {
		const left = await getCanvasPixel(page, 0.15, 0.5);
		const right = await getCanvasPixel(page, 0.85, 0.5);
		const top = await getCanvasPixel(page, 0.5, 0.15);
		const bottom = await getCanvasPixel(page, 0.5, 0.85);
		const center = await getCanvasPixel(page, 0.5, 0.5);

		expect(right[0] - left[0]).toBeGreaterThan(40);
		expect(top[1] - bottom[1]).toBeGreaterThan(40);
		expect(center[2]).toBeLessThan(15);
	}

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

	test('exposes the same fragment uv in materials, shader passes and feedback passes', async ({
		page
	}) => {
		await page.goto('/?scenario=passes');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(0);

		await expectFragmentUvGradient(page);

		await page.getByTestId('set-pass-named').click();
		await expect(page.getByTestId('pass-mode')).toHaveText('named');
		await page.getByTestId('advance-once').click();
		await expectFragmentUvGradient(page);

		await page.getByTestId('set-pass-feedback').click();
		await expect(page.getByTestId('pass-mode')).toHaveText('feedback');
		await page.getByTestId('advance-once').click();
		await expectFragmentUvGradient(page);
		await expect(page.getByTestId('last-error')).toHaveText('none');
	});
});
