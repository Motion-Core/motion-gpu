import { resolveLegacyRedirect } from './hooks.server';

export default {
	fetch(request: Request): Response {
		const redirectTarget = resolveLegacyRedirect(new URL(request.url));
		if (!redirectTarget) {
			return new Response('Not Found', { status: 404 });
		}

		return new Response(null, {
			status: 308,
			headers: { location: redirectTarget.toString() }
		});
	}
};
