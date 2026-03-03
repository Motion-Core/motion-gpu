import { describe, expect, it } from 'vitest';
import type { Handle } from '@sveltejs/kit';
import { handle } from './hooks.server';

const invokeHandle = async (pathname: string) => {
	const event = { url: new URL(`https://motion-gpu.dev${pathname}`) } as Parameters<Handle>[0]['event'];
	return handle({
		event,
		resolve: async () => new Response('ok')
	});
};

describe('hooks.server handle', () => {
	it('sets COOP/COEP headers for playground route', async () => {
		const response = await invokeHandle('/playground');

		expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
		expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
	});

	it('sets COOP/COEP headers for nested playground route', async () => {
		const response = await invokeHandle('/playground/embed');

		expect(response.headers.get('Cross-Origin-Opener-Policy')).toBe('same-origin');
		expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBe('require-corp');
	});

	it('does not set COOP/COEP headers outside playground', async () => {
		const response = await invokeHandle('/docs');

		expect(response.headers.get('Cross-Origin-Opener-Policy')).toBeNull();
		expect(response.headers.get('Cross-Origin-Embedder-Policy')).toBeNull();
	});
});
