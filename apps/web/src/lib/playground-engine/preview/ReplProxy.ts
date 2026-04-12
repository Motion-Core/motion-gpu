import type { Handlers } from './proxy';
import { PLAYGROUND_PREVIEW_CHANNEL } from './protocol';

let uid = 1;
const DEFAULT_READY_TIMEOUT_MS = 10000;
const DEFAULT_COMMAND_TIMEOUT_MS = 12000;

type PendingCommand = {
	resolve: (value: any) => void;
	reject: (value: any) => void;
	timeoutId: ReturnType<typeof setTimeout>;
};

type ReplProxyOptions = {
	targetOrigin: string;
	sessionId: string;
	expectedOrigin?: string;
};

export default class ReplProxy {
	iframe: HTMLIFrameElement;
	handlers: Handlers;
	targetOrigin: string;
	sessionId: string;
	expectedOrigin: string;
	pending_cmds: Map<number, PendingCommand> = new Map();
	isReady = false;
	destroyed = false;
	readyPromise: Promise<void>;
	resolveReady: (() => void) | null = null;

	handle_event = (event: MessageEvent<any>) => {
		if (event.source !== this.iframe.contentWindow) return;
		if (this.expectedOrigin !== '*' && event.origin !== this.expectedOrigin) return;
		if (!event.data || event.data.channel !== PLAYGROUND_PREVIEW_CHANNEL) return;
		if (event.data.session_id !== this.sessionId) return;

		const { action } = event.data;

		switch (action) {
			case 'ready':
				this.markReady();
				return;
			case 'cmd_error':
			case 'cmd_ok':
				return this.handle_command_message(event.data);
			case 'error':
				return this.handlers.on_error(event.data);
			case 'unhandledrejection':
				return this.handlers.on_unhandled_rejection(event.data);
		}
	};

	constructor(iframe: HTMLIFrameElement, handlers: Handlers, options: ReplProxyOptions) {
		this.iframe = iframe;
		this.handlers = handlers;
		this.targetOrigin = options.targetOrigin;
		this.expectedOrigin = options.expectedOrigin ?? options.targetOrigin;
		this.sessionId = options.sessionId;
		this.readyPromise = new Promise((resolve) => {
			this.resolveReady = resolve;
		});

		window.addEventListener('message', this.handle_event, false);
	}

	destroy() {
		if (this.destroyed) return;
		this.destroyed = true;

		window.removeEventListener('message', this.handle_event);

		for (const [cmdId, pending] of this.pending_cmds.entries()) {
			clearTimeout(pending.timeoutId);
			pending.reject(new Error(`Preview command ${cmdId} was aborted.`));
		}
		this.pending_cmds.clear();
		this.markReady();
	}

	markReady() {
		if (this.isReady) return;
		this.isReady = true;
		this.resolveReady?.();
		this.resolveReady = null;
	}

	wait_until_ready(timeoutMs = DEFAULT_READY_TIMEOUT_MS) {
		if (this.isReady) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				reject(new Error('Preview frame did not become ready in time.'));
			}, timeoutMs);

			void this.readyPromise.then(() => {
				clearTimeout(timeoutId);
				resolve();
			});
		});
	}

	async iframe_command(action: string, args: any, timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS) {
		await this.wait_until_ready();
		if (this.destroyed) {
			throw new Error('Preview proxy is destroyed.');
		}

		return new Promise((resolve, reject) => {
			const cmd_id = uid++;

			const timeoutId = setTimeout(() => {
				this.pending_cmds.delete(cmd_id);
				reject(new Error(`Preview command "${action}" timed out.`));
			}, timeoutMs);
			this.pending_cmds.set(cmd_id, { resolve, reject, timeoutId });

			if (!this.iframe.contentWindow) {
				clearTimeout(timeoutId);
				this.pending_cmds.delete(cmd_id);
				reject(new Error('Preview frame is unavailable.'));
				return;
			}

			this.iframe.contentWindow.postMessage(
				{
					channel: PLAYGROUND_PREVIEW_CHANNEL,
					action,
					cmd_id,
					args,
					session_id: this.sessionId
				},
				this.targetOrigin
			);
		});
	}

	handle_command_message(cmd_data: {
		action: string;
		cmd_id: number;
		message: string;
		stack: any;
		args: any;
	}) {
		let action = cmd_data.action;
		let id = cmd_data.cmd_id;
		let handler = this.pending_cmds.get(id);

		if (handler) {
			this.pending_cmds.delete(id);
			clearTimeout(handler.timeoutId);
			if (action === 'cmd_error') {
				let { message, stack } = cmd_data;
				let e = new Error(message);
				e.stack = stack;
				handler.reject(e);
			}

			if (action === 'cmd_ok') {
				handler.resolve(cmd_data.args);
			}
		} else {
			console.error('command not found', id, cmd_data, [...this.pending_cmds.keys()]);
		}
	}

	async eval(script: string, style?: string) {
		return this.iframe_command('eval', { script, style });
	}

	async handle_links() {
		return this.iframe_command('catch_clicks', {});
	}
}
