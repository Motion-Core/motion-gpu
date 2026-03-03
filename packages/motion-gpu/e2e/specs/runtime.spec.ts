import { expect, test } from '@playwright/test';
import { getCanvasHash, toNumber } from './helpers';

test.describe('motion-gpu runtime e2e', () => {
	test('renders frames and obeys render mode controls', async ({ page }) => {
		await page.goto('/?scenario=runtime');
		await expect(page.getByTestId('scenario')).toHaveText('runtime');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('last-error')).toHaveText('none');
		await expect(page.getByTestId('render-mode')).toHaveText('always');

		const frameCounter = page.getByTestId('frame-count');
		const first = toNumber(await frameCounter.textContent());
		await expect
			.poll(async () => toNumber(await frameCounter.textContent()))
			.toBeGreaterThan(first);
		const alwaysHashA = await getCanvasHash(page);
		await page.waitForTimeout(180);
		const alwaysHashB = await getCanvasHash(page);
		expect(alwaysHashB).not.toBe(alwaysHashA);

		await page.getByTestId('set-mode-manual').click();
		await expect(page.getByTestId('render-mode')).toHaveText('manual');
		await page.waitForTimeout(120);
		const manualHashA = await getCanvasHash(page);
		await page.waitForTimeout(220);
		const manualHashB = await getCanvasHash(page);
		expect(manualHashB).toBe(manualHashA);

		await page.getByTestId('advance-once').click();
		await page.waitForTimeout(120);
		const manualHashC = await getCanvasHash(page);
		expect(manualHashC).not.toBe(manualHashB);

		await page.getByTestId('set-mode-on-demand').click();
		await expect(page.getByTestId('render-mode')).toHaveText('on-demand');
		await page.waitForTimeout(150);
		const demandHashA = await getCanvasHash(page);
		await page.waitForTimeout(220);
		const demandHashB = await getCanvasHash(page);
		expect(demandHashB).toBe(demandHashA);

		await page.getByTestId('invalidate-once').click();
		await page.waitForTimeout(120);
		const demandHashC = await getCanvasHash(page);
		expect(demandHashC).not.toBe(demandHashB);
		await expect(page.getByTestId('last-error')).toHaveText('none');
	});

	test('keeps rendering after output color space toggle', async ({ page }) => {
		await page.goto('/?scenario=runtime');
		await expect(page.getByTestId('scenario')).toHaveText('runtime');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('output-color-space')).toHaveText('srgb');

		const beforeToggle = toNumber(await page.getByTestId('frame-count').textContent());
		await page.getByTestId('toggle-output-color-space').click();
		await expect(page.getByTestId('output-color-space')).toHaveText('linear');

		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(beforeToggle);
		await expect(page.getByTestId('last-error')).toHaveText('none');
	});
});
