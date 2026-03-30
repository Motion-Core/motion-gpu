import { expect, test } from '@playwright/test';
import {
	expectCanvasHashStable,
	expectValueStable,
	getCanvasHash,
	toNumber,
	waitForCanvasHashChange
} from './helpers';

test.describe('motion-gpu lifecycle e2e', () => {
	/* ────────────────────────────────────────────────────────
	 * 1. clearColor changes affect canvas output
	 *
	 * Catches: wrong clear attachment configuration, missed
	 * invalidation after clearColor prop change, clear color
	 * not applied when fragment doesn't cover full canvas.
	 * ──────────────────────────────────────────────────────── */

	test('changing clearColor produces visually different canvas output', async ({ page }) => {
		await page.goto('/?scenario=lifecycle');
		await expect(page.getByTestId('scenario')).toHaveText('lifecycle');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('clear-color-mode')).toHaveText('default');

		// Render with default clear color (black)
		await page.getByTestId('advance-once').click();
		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(0);
		const hashDefault = await getCanvasHash(page);

		// Switch to red clear color
		await page.getByTestId('set-clear-red').click();
		await expect(page.getByTestId('clear-color-mode')).toHaveText('red');
		await page.getByTestId('advance-once').click();
		const hashRed = await waitForCanvasHashChange(page, hashDefault);
		expect(hashRed).not.toBe(hashDefault);

		// Switch to blue clear color
		await page.getByTestId('set-clear-blue').click();
		await expect(page.getByTestId('clear-color-mode')).toHaveText('blue');
		await page.getByTestId('advance-once').click();
		const hashBlue = await waitForCanvasHashChange(page, hashRed);
		expect(hashBlue).not.toBe(hashRed);
		expect(hashBlue).not.toBe(hashDefault);

		// Switch back to default
		await page.getByTestId('set-clear-default').click();
		await page.getByTestId('advance-once').click();
		const hashDefault2 = await waitForCanvasHashChange(page, hashBlue);
		expect(hashDefault2).not.toBe(hashBlue);

		await expect(page.getByTestId('last-error')).toHaveText('none');
	});

	/* ────────────────────────────────────────────────────────
	 * 2. useFrame start/stop lifecycle
	 *
	 * Catches: frame callback not properly unregistered on
	 * stop, callback re-registration failing on start,
	 * leaked subscriptions.
	 * ──────────────────────────────────────────────────────── */

	test('useFrame start/stop controls frame callback execution', async ({ page }) => {
		await page.goto('/?scenario=lifecycle');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('frame-callback-running')).toHaveText('yes');

		// Render several frames with callback running
		await page.getByTestId('advance-once').click();
		await page.getByTestId('advance-once').click();
		await page.getByTestId('advance-once').click();

		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(0);

		// Stop the frame callback
		await page.getByTestId('stop-frame-callback').click();
		await expect(page.getByTestId('frame-callback-running')).toHaveText('no');

		// Let in-flight callback work settle after stop, then capture stable baseline.
		const stoppedBaseline = await expectValueStable(
			async () => toNumber(await page.getByTestId('frame-count').textContent()),
			300
		);

		// Advance more frames — callback count should stay frozen.
		await page.getByTestId('advance-once').click();
		await page.getByTestId('advance-once').click();
		await page.getByTestId('advance-once').click();

		const stoppedCount = await expectValueStable(
			async () => toNumber(await page.getByTestId('frame-count').textContent()),
			300
		);
		expect(stoppedCount).toBe(stoppedBaseline);

		// Restart the callback
		await page.getByTestId('start-frame-callback').click();
		await expect(page.getByTestId('frame-callback-running')).toHaveText('yes');

		await page.getByTestId('advance-once').click();

		// Frame count should resume incrementing
		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(stoppedCount);

		await expect(page.getByTestId('last-error')).toHaveText('none');
	});

	/* ────────────────────────────────────────────────────────
	 * 3. Textured material renders texture on canvas
	 *
	 * Catches: texture binding failures, sampler configuration
	 * bugs, format mismatches between loaded texture and
	 * shader expectations. This is a critical gap — the
	 * existing TextureScenario only checks hook state, never
	 * actually renders the texture.
	 * ──────────────────────────────────────────────────────── */

	test('switching to textured material renders loaded texture on canvas', async ({ page }) => {
		await page.goto('/?scenario=lifecycle');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('scene-mode')).toHaveText('simple');

		// Wait for texture to load
		await expect(page.getByTestId('texture-loading')).toHaveText('no');
		await expect(page.getByTestId('texture-count')).toHaveText('1');

		// Render with simple material first
		await page.getByTestId('advance-once').click();
		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(0);
		const hashSimple = await getCanvasHash(page);
		await expectCanvasHashStable(page, hashSimple, 200);

		// Switch to textured material
		await page.getByTestId('set-scene-textured').click();
		await expect(page.getByTestId('scene-mode')).toHaveText('textured');
		await page.getByTestId('advance-once').click();

		const hashTextured = await waitForCanvasHashChange(page, hashSimple);
		expect(hashTextured).not.toBe(hashSimple);

		// Switch back to simple — canvas should revert
		await page.getByTestId('set-scene-simple').click();
		await page.getByTestId('advance-once').click();

		const hashSimple2 = await waitForCanvasHashChange(page, hashTextured);
		expect(hashSimple2).not.toBe(hashTextured);

		await expect(page.getByTestId('last-error')).toHaveText('none');
	});
});
