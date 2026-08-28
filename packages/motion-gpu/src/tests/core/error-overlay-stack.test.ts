import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerErrorOverlay } from '../../lib/core/error-overlay-stack.js';

interface OverlayElements {
	dialog: HTMLDivElement;
	portalRoot: HTMLDivElement;
}

const activeRegistrations: Array<() => void> = [];

function createOverlay(name: string): OverlayElements {
	const portalRoot = document.createElement('div');
	portalRoot.dataset['overlay'] = name;
	const dialog = document.createElement('div');
	dialog.dataset['dialog'] = name;
	dialog.tabIndex = -1;
	portalRoot.append(dialog);
	document.body.append(portalRoot);
	return { dialog, portalRoot };
}

function register(elements: OverlayElements): () => void {
	const unregister = registerErrorOverlay(elements);
	activeRegistrations.push(unregister);
	return unregister;
}

describe('error overlay stack', () => {
	let appRoot: HTMLElement;
	let trigger: HTMLButtonElement;

	beforeEach(() => {
		document.body.replaceChildren();
		appRoot = document.createElement('main');
		trigger = document.createElement('button');
		trigger.textContent = 'Open canvas';
		appRoot.append(trigger);
		document.body.append(appRoot);
		trigger.focus();
	});

	afterEach(() => {
		for (const unregister of activeRegistrations.splice(0).reverse()) {
			unregister();
		}
		document.body.replaceChildren();
		vi.restoreAllMocks();
	});

	it('transfers ownership in LIFO order and restores the stack baseline once', () => {
		const first = createOverlay('first');
		const unregisterFirst = register(first);

		expect(document.activeElement).toBe(first.dialog);
		expect(appRoot.inert).toBe(true);
		expect(first.portalRoot.inert).toBe(false);

		const second = createOverlay('second');
		const unregisterSecond = register(second);

		expect(document.activeElement).toBe(second.dialog);
		expect(appRoot.inert).toBe(true);
		expect(first.portalRoot.inert).toBe(true);
		expect(second.portalRoot.inert).toBe(false);

		unregisterSecond();

		expect(document.activeElement).toBe(first.dialog);
		expect(appRoot.inert).toBe(true);
		expect(first.portalRoot.inert).toBe(false);
		expect(second.portalRoot.inert).toBe(true);

		unregisterFirst();

		expect(appRoot.inert).toBe(false);
		expect(second.portalRoot.inert).toBe(false);
		expect(document.activeElement).toBe(trigger);
	});

	it('keeps the top owner stable when a lower overlay unregisters out of order', () => {
		const first = createOverlay('first');
		const unregisterFirst = register(first);
		const second = createOverlay('second');
		const unregisterSecond = register(second);
		const firstFocus = vi.spyOn(first.dialog, 'focus');
		const secondFocus = vi.spyOn(second.dialog, 'focus');

		unregisterFirst();

		expect(document.activeElement).toBe(second.dialog);
		expect(firstFocus).not.toHaveBeenCalled();
		expect(secondFocus).not.toHaveBeenCalled();
		expect(appRoot.inert).toBe(true);
		expect(first.portalRoot.inert).toBe(true);
		expect(second.portalRoot.inert).toBe(false);

		trigger.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

		expect(firstFocus).not.toHaveBeenCalled();
		expect(secondFocus).toHaveBeenCalledTimes(1);

		first.portalRoot.remove();
		unregisterSecond();

		expect(appRoot.inert).toBe(false);
		expect(first.portalRoot.inert).toBe(false);
		expect(document.activeElement).toBe(trigger);
	});

	it('preserves existing inert and aria-hidden state, including dynamic body children', async () => {
		appRoot.setAttribute('aria-hidden', 'false');
		const preInertBackground = document.createElement('nav');
		preInertBackground.inert = true;
		preInertBackground.setAttribute('aria-hidden', 'false');
		document.body.append(preInertBackground);
		const existingBackground = document.createElement('aside');
		existingBackground.inert = false;
		existingBackground.setAttribute('aria-hidden', 'true');
		document.body.append(existingBackground);
		const overlay = createOverlay('only');
		const unregister = register(overlay);
		const dynamicBackground = document.createElement('section');
		dynamicBackground.inert = false;
		dynamicBackground.setAttribute('aria-hidden', 'false');

		document.body.append(dynamicBackground);
		await new Promise<void>((resolve) => queueMicrotask(resolve));

		expect(appRoot.inert).toBe(true);
		expect(appRoot.getAttribute('aria-hidden')).toBe('false');
		expect(preInertBackground.inert).toBe(true);
		expect(preInertBackground.getAttribute('aria-hidden')).toBe('false');
		expect(existingBackground.inert).toBe(true);
		expect(existingBackground.getAttribute('aria-hidden')).toBe('true');
		expect(dynamicBackground.inert).toBe(true);
		expect(dynamicBackground.getAttribute('aria-hidden')).toBe('false');

		unregister();

		expect(appRoot.inert).toBe(false);
		expect(appRoot.getAttribute('aria-hidden')).toBe('false');
		expect(preInertBackground.inert).toBe(true);
		expect(preInertBackground.getAttribute('aria-hidden')).toBe('false');
		expect(existingBackground.inert).toBe(false);
		expect(existingBackground.getAttribute('aria-hidden')).toBe('true');
		expect(dynamicBackground.inert).toBe(false);
		expect(dynamicBackground.getAttribute('aria-hidden')).toBe('false');
		expect(document.activeElement).toBe(trigger);
	});

	it('makes registration cleanup idempotent', () => {
		const overlay = createOverlay('only');
		const unregister = register(overlay);

		unregister();
		unregister();

		expect(appRoot.inert).toBe(false);
		expect(document.activeElement).toBe(trigger);
	});
});
