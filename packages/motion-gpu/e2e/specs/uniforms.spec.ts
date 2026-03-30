import { expect, test } from '@playwright/test';
import {
	expectCanvasHashStable,
	getCanvasHash,
	toNumber,
	waitForCanvasHashChange
} from './helpers';

test.describe('motion-gpu uniforms and material configuration e2e', () => {
	/* ────────────────────────────────────────────────────────
	 * 1. Custom uniform changes visual output
	 *
	 * Catches: uniform buffer alignment bugs, wrong byte offsets,
	 * stale uniform data not uploaded to GPU.
	 * ──────────────────────────────────────────────────────── */

	test('changing a custom uniform value produces a different canvas', async ({ page }) => {
		await page.goto('/?scenario=uniforms');
		await expect(page.getByTestId('scenario')).toHaveText('uniforms');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');
		await expect(page.getByTestId('material-mode')).toHaveText('uniform-a');

		// Render initial frame with default brightness (0.5)
		await page.getByTestId('advance-once').click();
		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(0);

		const hashLow = await getCanvasHash(page);
		await expectCanvasHashStable(page, hashLow, 200);

		// Set brightness high (1.0) and render
		await page.getByTestId('set-brightness-high').click();
		await expect(page.getByTestId('brightness-level')).toHaveText('high');
		await page.getByTestId('advance-once').click();

		const hashHigh = await waitForCanvasHashChange(page, hashLow);
		expect(hashHigh).not.toBe(hashLow);

		// Set brightness low (0.1) and render — should differ from both previous
		await page.getByTestId('set-brightness-low').click();
		await expect(page.getByTestId('brightness-level')).toHaveText('low');
		await page.getByTestId('advance-once').click();

		const hashVeryLow = await waitForCanvasHashChange(page, hashHigh);
		expect(hashVeryLow).not.toBe(hashHigh);
		expect(hashVeryLow).not.toBe(hashLow);

		await expect(page.getByTestId('last-error')).toHaveText('none');
	});

	/* ────────────────────────────────────────────────────────
	 * 2. Hot-swap between two valid materials
	 *
	 * Catches: stale pipeline caches, leaked GPU resources,
	 * wrong bind groups after material swap, shader recompile
	 * failures when both materials are valid.
	 * ──────────────────────────────────────────────────────── */

	test('hot-swaps between two valid materials with different visual output', async ({ page }) => {
		await page.goto('/?scenario=uniforms');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');

		// Render material A
		await page.getByTestId('advance-once').click();
		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(0);

		const hashA = await getCanvasHash(page);

		// Switch to material B (different shader, different uniform type)
		await page.getByTestId('set-material-b').click();
		await expect(page.getByTestId('material-mode')).toHaveText('uniform-b');
		await page.getByTestId('advance-once').click();

		const hashB = await waitForCanvasHashChange(page, hashA);
		expect(hashB).not.toBe(hashA);

		// Switch back to material A — should produce original-like output
		await page.getByTestId('set-material-a').click();
		await expect(page.getByTestId('material-mode')).toHaveText('uniform-a');
		await page.getByTestId('advance-once').click();

		const hashA2 = await waitForCanvasHashChange(page, hashB);
		expect(hashA2).not.toBe(hashB);

		await expect(page.getByTestId('last-error')).toHaveText('none');
	});

	/* ────────────────────────────────────────────────────────
	 * 3. Material with defines — conditional compilation
	 *
	 * Catches: define injection errors, stale cache when
	 * different define values produce different shader code,
	 * preprocessor bugs in buildDefinesBlock.
	 * ──────────────────────────────────────────────────────── */

	test('material defines produce different visual output based on boolean value', async ({
		page
	}) => {
		await page.goto('/?scenario=uniforms');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');

		// Render baseline material before switching to defines variants.
		await page.getByTestId('advance-once').click();
		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(0);
		const hashBaseline = await getCanvasHash(page);

		// Set defines-on (should render blue)
		await page.getByTestId('set-material-defines-on').click();
		await expect(page.getByTestId('material-mode')).toHaveText('defines-on');
		await page.getByTestId('advance-once').click();

		// Material compilation/rebind can settle one frame later in React;
		// wait for an actual visual transition from baseline.
		const hashDefOn = await waitForCanvasHashChange(page, hashBaseline);
		expect(hashDefOn).not.toBe(hashBaseline);

		// Set defines-off (should render red)
		await page.getByTestId('set-material-defines-off').click();
		await expect(page.getByTestId('material-mode')).toHaveText('defines-off');
		await page.getByTestId('advance-once').click();

		const hashDefOff = await waitForCanvasHashChange(page, hashDefOn);
		expect(hashDefOff).not.toBe(hashDefOn);

		await expect(page.getByTestId('last-error')).toHaveText('none');
	});

	/* ────────────────────────────────────────────────────────
	 * 4. Rapid material swaps do not crash or leak errors
	 *
	 * Catches: race conditions in pipeline creation,
	 * incomplete cleanup between rapid recompiles.
	 * ──────────────────────────────────────────────────────── */

	test('rapid material swaps do not produce errors', async ({ page }) => {
		await page.goto('/?scenario=uniforms');
		await expect(page.getByTestId('gpu-status')).toHaveText('ready');
		await expect(page.getByTestId('controls-ready')).toHaveText('yes');

		// Rapidly cycle through all materials
		await page.getByTestId('set-material-a').click();
		await page.getByTestId('advance-once').click();
		await page.getByTestId('set-material-b').click();
		await page.getByTestId('advance-once').click();
		await page.getByTestId('set-material-defines-on').click();
		await page.getByTestId('advance-once').click();
		await page.getByTestId('set-material-defines-off').click();
		await page.getByTestId('advance-once').click();
		await page.getByTestId('set-material-a').click();
		await page.getByTestId('advance-once').click();

		await expect
			.poll(async () => toNumber(await page.getByTestId('frame-count').textContent()))
			.toBeGreaterThan(3);

		await expect(page.getByTestId('last-error')).toHaveText('none');
	});
});
