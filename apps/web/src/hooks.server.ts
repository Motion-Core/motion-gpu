import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const response = await resolve(event);

	const isPlaygroundRoute =
		event.url.pathname === '/playground' || event.url.pathname.startsWith('/playground/');
	if (isPlaygroundRoute) {
		response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
		response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
	}

	return response;
};
