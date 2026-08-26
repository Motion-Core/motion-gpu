import { expect, test } from '@playwright/test';

type AccessResult =
	| { ok: true; value: unknown }
	| { ok: false; errorName: string; message: string };

test('isolates preview storage and DOM while keeping the message protocol operational', async ({
	page
}) => {
	await page.goto('/');
	await page.evaluate(() => {
		document.cookie = 'motion_gpu_parent_secret=cookie-value; path=/; Secure; SameSite=Strict';
		localStorage.setItem('motion-gpu-parent-secret', 'storage-value');
	});

	await page.goto('/playground');
	await expect(page.getByText('Preview ready', { exact: true })).toBeVisible();

	const iframe = page.locator('iframe[title="Playground preview"]');
	await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts allow-popups');
	const iframeHandle = await iframe.elementHandle();
	const previewFrame = await iframeHandle.contentFrame();
	expect(previewFrame).not.toBeNull();
	if (!previewFrame) {
		throw new Error('Playground preview frame was not created.');
	}

	const access = await previewFrame.evaluate(() => {
		const attempt = (read: () => unknown): AccessResult => {
			try {
				return { ok: true, value: read() };
			} catch (error) {
				return {
					ok: false,
					errorName: error instanceof Error ? error.name : 'UnknownError',
					message: error instanceof Error ? error.message : String(error)
				};
			}
		};

		return {
			origin: self.origin,
			parentDocument: attempt(() => Boolean(parent.document.body)),
			parentCookie: attempt(() => parent.document.cookie),
			parentStorage: attempt(() => parent.localStorage.getItem('motion-gpu-parent-secret')),
			previewCookie: attempt(() => document.cookie),
			previewStorage: attempt(() => localStorage.getItem('motion-gpu-parent-secret')),
			canvasCount: document.querySelectorAll('canvas').length
		};
	});

	expect(access.origin).toBe('null');
	for (const result of [
		access.parentDocument,
		access.parentCookie,
		access.parentStorage,
		access.previewCookie,
		access.previewStorage
	]) {
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.errorName).toBe('SecurityError');
		}
	}
	expect(access.canvasCount).toBeGreaterThan(0);

	const previewSrc = await iframe.getAttribute('src');
	expect(previewSrc).not.toBeNull();
	if (!previewSrc) {
		throw new Error('Playground preview URL is missing.');
	}
	const previewUrl = new URL(previewSrc, page.url()).toString();
	const embedResponse = await page.request.get(previewUrl);
	expect(embedResponse.status()).toBe(200);
	expect(embedResponse.headers()['content-security-policy']).toContain("script-src 'nonce-");
	expect(embedResponse.headers()['content-security-policy']).toContain(
		'frame-ancestors http://127.0.0.1:4178'
	);
	expect(embedResponse.headers()['permissions-policy']).toContain('camera=()');
});
