import { PLAYGROUND_PREVIEW_CHANNEL } from '$lib/playground-engine/preview/protocol';
import previewDefaultStyles from '$lib/playground-engine/preview/runtime-shell/styles.css?raw';
import type { RequestHandler } from './$types';

export const prerender = false;

const toSafeOrigin = (value: string | null) => {
	if (!value) return '';
	try {
		return new URL(value).origin;
	} catch {
		return '';
	}
};

type PreviewTheme = 'light' | 'dark';

const toPreviewTheme = (value: string | null): PreviewTheme =>
	value === 'dark' ? 'dark' : 'light';

const previewThemeTokens: Record<PreviewTheme, { background: string; foreground: string }> = {
	light: {
		background: 'oklch(0.9764 0.0013 265)',
		foreground: 'oklch(0.1881 0.006 265)'
	},
	dark: {
		background: 'oklch(0.2099 0.0039 265)',
		foreground: 'oklch(0.9674 0.0013 265)'
	}
};

const buildInitialStyle = (theme: PreviewTheme): string => {
	const tokens = previewThemeTokens[theme];
	const colorScheme = theme === 'dark' ? 'dark' : 'light';
	return `${previewDefaultStyles}
:root {
	color-scheme: ${colorScheme};
}

html,
body {
	background: ${tokens.background};
	color: ${tokens.foreground};
}`;
};

const buildEmbedHtml = ({
	sessionId,
	parentOrigin,
	initialStyle
}: {
	sessionId: string;
	parentOrigin: string;
	initialStyle: string;
}) => `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<style id="injected">${initialStyle}</style>
	</head>
	<body>
		<script>
			(() => {
				const CHANNEL = ${JSON.stringify(PLAYGROUND_PREVIEW_CHANNEL)};
				const SESSION_ID = ${JSON.stringify(sessionId)};
				const ALLOWED_PARENT_ORIGIN = ${JSON.stringify(parentOrigin)};
				const style = document.querySelector('#injected');
				let linksHandled = false;

				const canAcceptEvent = (event) => {
					if (event.source !== parent) return false;
					if (ALLOWED_PARENT_ORIGIN && event.origin !== ALLOWED_PARENT_ORIGIN) return false;

					const data = event.data;
					if (!data || data.channel !== CHANNEL) return false;
					if (SESSION_ID && data.session_id !== SESSION_ID) return false;
					return true;
				};

				const send = (payload) => {
					parent.postMessage(
						{
							channel: CHANNEL,
							session_id: SESSION_ID,
							...payload
						},
						ALLOWED_PARENT_ORIGIN || '*'
					);
				};

				const serializeError = (error) => ({
					message: error?.message ?? String(error),
					stack: error?.stack ?? ''
				});

				window.addEventListener('message', (event) => {
					if (!canAcceptEvent(event)) return;

					const data = event.data ?? {};
					const cmdId = data.cmd_id;
					const reply = (payload) => {
						send({ ...payload, cmd_id: cmdId });
					};

					try {
						if (data.action === 'eval') {
							if (style && typeof data?.args?.style === 'string') {
								style.textContent = data.args.style;
							}
							(0, eval)(data?.args?.script || '');
							reply({ action: 'cmd_ok' });
							return;
						}

						if (data.action === 'catch_clicks') {
							if (!linksHandled) {
								linksHandled = true;
								document.body.addEventListener('click', (clickEvent) => {
									if (
										clickEvent.which !== 1 ||
										clickEvent.metaKey ||
										clickEvent.ctrlKey ||
										clickEvent.shiftKey
									)
										return;
									if (clickEvent.defaultPrevented) return;

									let element = clickEvent.target;
									while (element && element.nodeName !== 'A') element = element.parentNode;
									if (!element || element.nodeName !== 'A') return;

									if (
										element.hasAttribute('download') ||
										element.getAttribute('rel') === 'external' ||
										element.target
									)
										return;

									clickEvent.preventDefault();
									window.open(element.href, '_blank', 'noopener,noreferrer');
								});
							}

							reply({ action: 'cmd_ok' });
							return;
						}

						throw new Error('Unsupported action: ' + String(data.action));
					} catch (error) {
						const serialized = serializeError(error);
						reply({ action: 'cmd_error', message: serialized.message, stack: serialized.stack });
					}
				});

				window.onerror = (msg, _url, _lineNo, _columnNo, error) => {
					send({ action: 'error', value: error || msg });
				};

				window.addEventListener('unhandledrejection', (event) => {
					send({ action: 'unhandledrejection', value: event.reason });
				});

				send({ action: 'ready' });
				window.addEventListener('load', () => {
					send({ action: 'ready' });
				});
			})();
		</script>
	</body>
</html>
`;

export const GET: RequestHandler = async ({ url }) => {
	const sessionId = (url.searchParams.get('session') ?? '').slice(0, 120);
	const parentOrigin = toSafeOrigin(url.searchParams.get('parent_origin'));
	const theme = toPreviewTheme(url.searchParams.get('theme'));
	const html = buildEmbedHtml({
		sessionId,
		parentOrigin,
		initialStyle: buildInitialStyle(theme)
	});

	return new Response(html, {
		headers: {
			'Content-Type': 'text/html; charset=utf-8',
			'Cache-Control': 'no-store',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
