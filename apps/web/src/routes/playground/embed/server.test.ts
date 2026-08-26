import { describe, expect, it } from 'vitest';
import { GET } from './+server';

/**
 * Invokes the preview endpoint with a complete URL for focused handler tests.
 */
const request = (query: string) =>
	GET({
		url: new URL(`https://preview.motion-gpu.dev/playground/embed?${query}`)
	} as Parameters<typeof GET>[0]);

describe('playground preview endpoint', () => {
	it('returns an isolated preview document with nonce-bound security headers', async () => {
		const response = await request(
			'session=9ecf96ad-81fb-4507-8f69-79bc28ca731d&parent_origin=https%3A%2F%2Fmotion-gpu.dev&theme=dark'
		);
		const html = await response.text();
		const nonce = html.match(/<script nonce="([a-f0-9]+)">/)?.[1];

		expect(response.status).toBe(200);
		expect(nonce).toBeTruthy();
		expect(response.headers.get('content-security-policy')).toContain(
			`script-src 'nonce-${nonce}' 'unsafe-eval'`
		);
		expect(response.headers.get('content-security-policy')).toContain(
			'frame-ancestors https://motion-gpu.dev'
		);
		expect(response.headers.get('content-security-policy')).toContain(
			'sandbox allow-scripts allow-popups'
		);
		expect(response.headers.get('permissions-policy')).toContain('camera=()');
		expect(response.headers.get('referrer-policy')).toBe('no-referrer');
		expect(response.headers.get('cross-origin-resource-policy')).toBe('cross-origin');
		expect(response.headers.get('cache-control')).toBe('no-store');
		expect(html).toContain('color-scheme: dark');
		expect(html).toContain("if (self.origin !== 'null')");
		expect(html).toContain('Playground preview requires an opaque origin.');
	});

	it.each([
		['missing session', 'parent_origin=https%3A%2F%2Fmotion-gpu.dev'],
		[
			'injectable session',
			'session=%3C%2Fscript%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E&parent_origin=https%3A%2F%2Fmotion-gpu.dev'
		],
		['missing parent', 'session=valid-session'],
		['non-HTTP parent', 'session=valid-session&parent_origin=javascript%3Aalert(1)']
	])('rejects %s', async (_label, query) => {
		const response = await request(query);

		expect(response.status).toBe(400);
		expect(response.headers.get('cache-control')).toBe('no-store');
	});
});
