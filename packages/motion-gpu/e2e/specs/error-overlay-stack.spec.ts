import { expect, test, type Locator } from '@playwright/test';

async function getBodyChildInert(locator: Locator): Promise<boolean> {
	return locator.evaluate((element) => {
		let current = element as HTMLElement;
		while (current.parentElement && current.parentElement !== document.body) {
			current = current.parentElement;
		}
		return current.inert;
	});
}

test.describe('error overlay stack e2e', () => {
	test('dismisses two real FragCanvas overlays in stack order', async ({ page }, testInfo) => {
		test.skip(testInfo.project.name !== 'chromium-webgpu-svelte', 'Svelte portal harness proof');
		await page.addInitScript(() => {
			Object.defineProperty(navigator, 'gpu', {
				configurable: true,
				value: undefined
			});
		});

		await page.goto('/?scenario=error-overlay-stack');
		await expect(page.getByTestId('scenario')).toHaveText('error-overlay-stack');
		const trigger = page.getByTestId('open-error-overlays');
		const appRoot = page.getByTestId('error-overlay-stack-root');
		await trigger.click();
		await expect(page.getByTestId('reported-errors')).toHaveText('2');

		const dialogs = page.getByTestId('motiongpu-error');
		await expect(dialogs).toHaveCount(2);
		const dialogLabelIds = await dialogs.evaluateAll((elements) =>
			elements.map((element) => element.getAttribute('aria-labelledby'))
		);
		const inertStates = await dialogs.evaluateAll((elements) =>
			elements.map((element) => {
				let current = element as HTMLElement;
				while (current.parentElement && current.parentElement !== document.body) {
					current = current.parentElement;
				}
				return current.inert;
			})
		);
		const topIndex = inertStates.findIndex((inert) => !inert);
		const lowerIndex = topIndex === 0 ? 1 : 0;
		const topLabelId = dialogLabelIds[topIndex];
		const lowerLabelId = dialogLabelIds[lowerIndex];

		expect(topIndex).toBeGreaterThanOrEqual(0);
		expect(inertStates.filter((inert) => !inert)).toHaveLength(1);
		expect(await getBodyChildInert(appRoot)).toBe(true);
		expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-labelledby'))).toBe(
			topLabelId
		);
		await page.waitForTimeout(100);
		expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-labelledby'))).toBe(
			topLabelId
		);

		await page.keyboard.press('Escape');

		await expect(dialogs).toHaveCount(1);
		expect(await dialogs.getAttribute('aria-labelledby')).toBe(lowerLabelId);
		await expect(dialogs).toBeFocused();
		expect(await getBodyChildInert(dialogs)).toBe(false);
		expect(await getBodyChildInert(appRoot)).toBe(true);

		await page.keyboard.press('Escape');

		await expect(dialogs).toHaveCount(0);
		expect(await getBodyChildInert(appRoot)).toBe(false);
		await expect(trigger).toBeFocused();
	});
});
