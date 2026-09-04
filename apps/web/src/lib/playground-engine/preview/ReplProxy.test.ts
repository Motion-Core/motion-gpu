import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	PLAYGROUND_PREVIEW_CHANNEL,
	PLAYGROUND_PREVIEW_EVENT_ORIGIN,
	PLAYGROUND_PREVIEW_SANDBOX,
	PLAYGROUND_PREVIEW_TARGET_ORIGIN
} from './protocol';
import ReplProxy from './ReplProxy';

describe('sandboxed preview proxy', () => {
	const addEventListener = vi.fn();
	const removeEventListener = vi.fn();

	beforeEach(() => {
		vi.stubGlobal('window', { addEventListener, removeEventListener });
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	function createProxy() {
		const contentWindow = { postMessage: vi.fn() };
		const iframe = { contentWindow } as unknown as HTMLIFrameElement;
		const handlers = {
			on_error: vi.fn(),
			on_unhandled_rejection: vi.fn()
		};
		const proxy = new ReplProxy(iframe, handlers, {
			targetOrigin: PLAYGROUND_PREVIEW_TARGET_ORIGIN,
			expectedOrigin: PLAYGROUND_PREVIEW_EVENT_ORIGIN,
			sessionId: 'preview-session'
		});
		return { contentWindow, handlers, proxy };
	}

	it('keeps the iframe origin opaque and authenticates messages by source and session', () => {
		expect(PLAYGROUND_PREVIEW_SANDBOX).toBe('allow-scripts allow-popups');
		expect(PLAYGROUND_PREVIEW_TARGET_ORIGIN).toBe('*');
		expect(PLAYGROUND_PREVIEW_EVENT_ORIGIN).toBe('null');

		const { contentWindow, proxy } = createProxy();
		proxy.handle_event({
			source: contentWindow,
			origin: 'https://preview.spektral.madebyhex.com',
			data: {
				channel: PLAYGROUND_PREVIEW_CHANNEL,
				session_id: 'preview-session',
				action: 'ready'
			}
		} as unknown as MessageEvent);
		expect(proxy.isReady).toBe(false);

		proxy.handle_event({
			source: contentWindow,
			origin: PLAYGROUND_PREVIEW_EVENT_ORIGIN,
			data: {
				channel: PLAYGROUND_PREVIEW_CHANNEL,
				session_id: 'wrong-session',
				action: 'ready'
			}
		} as unknown as MessageEvent);
		expect(proxy.isReady).toBe(false);

		proxy.handle_event({
			source: contentWindow,
			origin: PLAYGROUND_PREVIEW_EVENT_ORIGIN,
			data: {
				channel: PLAYGROUND_PREVIEW_CHANNEL,
				session_id: 'preview-session',
				action: 'ready'
			}
		} as unknown as MessageEvent);
		expect(proxy.isReady).toBe(true);
		proxy.destroy();
	});

	it('posts commands with wildcard targeting only after the opaque frame is authenticated', async () => {
		const { contentWindow, proxy } = createProxy();
		proxy.handle_event({
			source: contentWindow,
			origin: PLAYGROUND_PREVIEW_EVENT_ORIGIN,
			data: {
				channel: PLAYGROUND_PREVIEW_CHANNEL,
				session_id: 'preview-session',
				action: 'ready'
			}
		} as unknown as MessageEvent);

		const command = proxy.iframe_command('eval', { script: 'void 0' });
		await Promise.resolve();
		expect(contentWindow.postMessage).toHaveBeenCalledWith(
			expect.objectContaining({
				channel: PLAYGROUND_PREVIEW_CHANNEL,
				session_id: 'preview-session',
				action: 'eval'
			}),
			PLAYGROUND_PREVIEW_TARGET_ORIGIN
		);
		const payload = contentWindow.postMessage.mock.calls[0]?.[0] as { cmd_id: number };
		proxy.handle_event({
			source: contentWindow,
			origin: PLAYGROUND_PREVIEW_EVENT_ORIGIN,
			data: {
				channel: PLAYGROUND_PREVIEW_CHANNEL,
				session_id: 'preview-session',
				action: 'cmd_ok',
				cmd_id: payload.cmd_id,
				args: null
			}
		} as unknown as MessageEvent);

		await expect(command).resolves.toBeNull();
		proxy.destroy();
	});
});
