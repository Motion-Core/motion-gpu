import { expect, test } from '@playwright/test';
import { toNumber } from './helpers';

test.describe('motion-gpu perf scenario e2e', () => {
	test('exposes perf controls and applies render mode semantics', async ({ page }) => {
		await page.goto('/?scenario=perf');
		await expect(page.getByTestId('scenario')).toHaveText('perf');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('last-error')).toHaveText('none');

		await expect
			.poll(async () => toNumber(await page.getByTestId('scheduler-count').textContent()))
			.toBeGreaterThan(0);
		await expect
			.poll(async () => toNumber(await page.getByTestId('render-count').textContent()))
			.toBeGreaterThan(0);

		const perfApiAvailable = await page.evaluate(
			() => typeof window.__MOTION_GPU_PERF__?.advance === 'function'
		);
		expect(perfApiAvailable).toBe(true);

		await page.evaluate(() => window.__MOTION_GPU_PERF__?.setMode('manual'));
		await expect(page.getByTestId('render-mode')).toHaveText('manual');

		await page.waitForTimeout(120);
		const manualBeforeIdle = toNumber(await page.getByTestId('render-count').textContent());
		await page.waitForTimeout(260);
		const manualAfterIdle = toNumber(await page.getByTestId('render-count').textContent());
		expect(manualAfterIdle).toBe(manualBeforeIdle);

		await page.evaluate(() => window.__MOTION_GPU_PERF__?.advance());
		await expect
			.poll(async () => toNumber(await page.getByTestId('render-count').textContent()))
			.toBeGreaterThan(manualAfterIdle);

		await page.evaluate(() => window.__MOTION_GPU_PERF__?.setMode('on-demand'));
		await expect(page.getByTestId('render-mode')).toHaveText('on-demand');
		const onDemandBeforeInvalidate = toNumber(await page.getByTestId('render-count').textContent());
		await page.evaluate(() => window.__MOTION_GPU_PERF__?.invalidate());
		await expect
			.poll(async () => toNumber(await page.getByTestId('render-count').textContent()))
			.toBeGreaterThan(onDemandBeforeInvalidate);

		await page.evaluate(() => window.__MOTION_GPU_PERF__?.setMode('always'));
		await expect(page.getByTestId('render-mode')).toHaveText('always');
		const alwaysBefore = toNumber(await page.getByTestId('render-count').textContent());
		await expect
			.poll(async () => toNumber(await page.getByTestId('render-count').textContent()))
			.toBeGreaterThan(alwaysBefore);
	});
});
