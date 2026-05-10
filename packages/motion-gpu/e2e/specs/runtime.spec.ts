import { expect, test } from '@playwright/test';
import {
	expectCanvasHashStable,
	getCanvasHash,
	toNumber,
	waitForCanvasHashChange
} from './helpers';

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
		const alwaysHashB = await waitForCanvasHashChange(page, alwaysHashA);
		expect(alwaysHashB).not.toBe(alwaysHashA);

		await page.getByTestId('set-mode-manual').click();
		await expect(page.getByTestId('render-mode')).toHaveText('manual');
		const manualHashA = await getCanvasHash(page);
		await expectCanvasHashStable(page, manualHashA, 220);
		const manualHashB = await getCanvasHash(page);
		expect(manualHashB).toBe(manualHashA);

		await page.getByTestId('advance-once').click();
		const manualHashC = await waitForCanvasHashChange(page, manualHashB);
		expect(manualHashC).not.toBe(manualHashB);

		await page.getByTestId('set-mode-on-demand').click();
		await expect(page.getByTestId('render-mode')).toHaveText('on-demand');
		const demandHashA = await getCanvasHash(page);
		await expectCanvasHashStable(page, demandHashA, 220);
		const demandHashB = await getCanvasHash(page);
		expect(demandHashB).toBe(demandHashA);

		await page.getByTestId('invalidate-once').click();
		const demandHashC = await waitForCanvasHashChange(page, demandHashB);
		expect(demandHashC).not.toBe(demandHashB);
		await expect(page.getByTestId('last-error')).toHaveText('none');
	});

	test('keeps rendering after output encoding toggle', async ({ page }) => {
		await page.goto('/?scenario=runtime');
		await expect(page.getByTestId('scenario')).toHaveText('runtime');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('output-encoding')).toHaveText('srgb');

		const beforeToggle = toNumber(await page.getByTestId('frame-count').textContent());
		await page.getByTestId('toggle-output-encoding').click();
		await expect(page.getByTestId('output-encoding')).toHaveText('linear');

		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(beforeToggle);
		await expect(page.getByTestId('last-error')).toHaveText('none');
	});
});
