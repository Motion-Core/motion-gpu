import { expect, test } from '@playwright/test';

test.describe('spektral storage write/read WebGPU proof', () => {
	test.describe.configure({ retries: 0 });

	test('snapshots typed writes and reads both offsets in the same frame', async ({ page }) => {
		await page.goto('/?scenario=storage-proof');
		await page.getByTestId('storage-proof-terminal').waitFor({ state: 'visible' });

		const snapshot = {
			scenario: await page.getByTestId('scenario').textContent(),
			status: await page.getByTestId('storage-proof-status').textContent(),
			result: await page.getByTestId('storage-proof-result').textContent(),
			mutatedSource: await page.getByTestId('storage-proof-mutated-source').textContent(),
			error: await page.getByTestId('storage-proof-error').textContent()
		};

		expect(snapshot).toEqual({
			scenario: 'storage-proof',
			status: 'complete',
			result: '[1,10,20,4]',
			mutatedSource: '999',
			error: 'none'
		});
	});
});
