import { expect, test } from '@playwright/test';

test('preserves Spektral overlay styles after an incremental playground build', async ({
	page
}) => {
	await page.goto('/playground?demo=spektral-logo&framework=react');
	await expect(page.getByText('Preview ready', { exact: true })).toBeVisible();

	const iframeHandle = await page.locator('iframe[title="Playground preview"]').elementHandle();
	const previewFrame = await iframeHandle.contentFrame();
	expect(previewFrame).not.toBeNull();
	if (!previewFrame) {
		throw new Error('Playground preview frame was not created.');
	}

	await expect(previewFrame.locator('canvas')).toBeVisible();
	await page.getByRole('button', { name: 'fragment.wgsl', exact: true }).click();

	const editor = page.locator('.cm-content[contenteditable="true"]');
	const replaceShader = async (green: string) => {
		await editor.click();
		await page.keyboard.press('ControlOrMeta+A');
		await page.keyboard.insertText(`fn frag(uv: vec2f) -> vec4f
	return vec4f(uv, ${green}, 1.0);
}`);
	};

	await replaceShader('0.0');
	const overlay = previewFrame.locator('.spektral-error-overlay');
	await expect(overlay).toHaveCount(1);
	await expect(previewFrame.locator('.spektral-error-title')).toHaveText('WGSL compilation failed');
	await overlay.evaluate((element) => {
		element.setAttribute('data-before-incremental-build', '');
	});

	await replaceShader('0.1');
	await previewFrame.locator('[data-before-incremental-build]').waitFor({ state: 'detached' });
	await expect(overlay).toHaveCount(1);

	expect(await overlay.evaluate((element) => getComputedStyle(element).position)).toBe('fixed');
	expect(await overlay.evaluate((element) => getComputedStyle(element).zIndex)).toBe('2147483647');
});
