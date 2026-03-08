import { expect, test } from '@playwright/test';

test.describe('motion-gpu runtime fallback e2e', () => {
	test('reports unavailable status and init error when navigator.gpu is missing', async ({ page }) => {
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'gpu', {
				configurable: true,
				value: undefined
			});
		});

		await page.goto('/?scenario=runtime');
		await expect(page.getByTestId('scenario')).toHaveText('runtime');
		await expect(page.getByTestId('gpu-status')).toHaveText('unavailable');
		await expect(page.getByTestId('last-error')).toContainText('WebGPU is not available in this browser');
	});

	test('reports no-adapter status and adapter acquisition error when requestAdapter returns null', async ({
		page
	}) => {
		await page.addInitScript(() => {
			const existingGpu = navigator.gpu;
			if (!existingGpu) {
				return;
			}

			Object.defineProperty(existingGpu, 'requestAdapter', {
				configurable: true,
				value: async () => null
			});
		});

		await page.goto('/?scenario=runtime');
		await expect(page.getByTestId('scenario')).toHaveText('runtime');
		await expect(page.getByTestId('gpu-status')).toHaveText('no-adapter');
		await expect(page.getByTestId('last-error')).toContainText('Unable to acquire WebGPU adapter');
	});
});
