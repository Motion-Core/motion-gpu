import { expect, test } from '@playwright/test';

test.describe('motion-gpu texture loading e2e', () => {
	test('handles load failure and recovers on successful reload', async ({ page }) => {
		await page.route('**/missing-texture-e2e.png', async (route) => {
			await route.fulfill({
				status: 404,
				contentType: 'text/plain',
				body: 'not found'
			});
		});

		await page.goto('/?scenario=textures');
		await expect(page.getByTestId('scenario')).toHaveText('textures');
		await expect(page.getByTestId('texture-url-mode')).toHaveText('success');
		await expect(page.getByTestId('texture-loading')).toHaveText('no');
		await expect(page.getByTestId('texture-count')).toHaveText('1');
		await expect(page.getByTestId('texture-error')).toHaveText('none');

		await page.getByTestId('set-missing-url').click();
		await expect(page.getByTestId('texture-url-mode')).toHaveText('missing');
		await page.getByTestId('reload-textures').click();
		await expect(page.getByTestId('texture-loading')).toHaveText('no');
		await expect(page.getByTestId('texture-count')).toHaveText('0');
		await expect(page.getByTestId('texture-error')).toContainText('Texture request failed (404)');

		await page.getByTestId('set-success-url').click();
		await expect(page.getByTestId('texture-url-mode')).toHaveText('success');
		await page.getByTestId('reload-textures').click();
		await expect(page.getByTestId('texture-loading')).toHaveText('no');
		await expect(page.getByTestId('texture-count')).toHaveText('1');
		await expect(page.getByTestId('texture-error')).toHaveText('none');
	});

	test('keeps final state consistent under rapid reload requests', async ({ page }) => {
		await page.route('**/missing-texture-e2e.png', async (route) => {
			await new Promise((resolve) => setTimeout(resolve, 300));
			await route.fulfill({
				status: 404,
				contentType: 'text/plain',
				body: 'not found'
			});
		});

		await page.goto('/?scenario=textures');
		await expect(page.getByTestId('scenario')).toHaveText('textures');
		await expect(page.getByTestId('texture-loading')).toHaveText('no');
		await expect(page.getByTestId('texture-count')).toHaveText('1');

		await page.getByTestId('set-missing-url').click();
		await page.getByTestId('reload-textures').click();
		await page.getByTestId('set-success-url').click();
		await page.getByTestId('reload-textures').click();

		await expect(page.getByTestId('texture-loading')).toHaveText('no');
		await expect(page.getByTestId('texture-url-mode')).toHaveText('success');
		await expect(page.getByTestId('texture-count')).toHaveText('1');
		await expect(page.getByTestId('texture-error')).toHaveText('none');
	});
});
