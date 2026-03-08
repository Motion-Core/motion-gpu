import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import PortalHarness from './fixtures/PortalHarness.svelte';

describe('Portal', () => {
	afterEach(() => {
		cleanup();
	});

	it('mounts into body by default and removes portal root on unmount', async () => {
		const { unmount } = render(PortalHarness);
		const content = await screen.findByTestId('portal-content');
		const portalRoot = content.parentElement;

		expect(portalRoot?.parentElement).toBe(document.body);

		unmount();
		expect(portalRoot?.isConnected).toBe(false);
		expect(screen.queryByTestId('portal-content')).toBeNull();
	});

	it('mounts into target element selected by css selector and falls back to body when missing', async () => {
		const target = document.createElement('section');
		target.id = 'portal-target';
		document.body.appendChild(target);

		render(PortalHarness, { props: { target: '#portal-target' } });
		const selectedTargetContent = await screen.findByTestId('portal-content');
		expect(selectedTargetContent.parentElement?.parentElement).toBe(target);

		cleanup();

		render(PortalHarness, { props: { target: '#missing-target' } });
		const fallbackContent = await screen.findByTestId('portal-content');
		expect(fallbackContent.parentElement?.parentElement).toBe(document.body);

		target.remove();
	});

	it('supports HTMLElement target and null target fallback', async () => {
		const target = document.createElement('aside');
		document.body.appendChild(target);

		render(PortalHarness, { props: { target } });
		const elementTargetContent = await screen.findByTestId('portal-content');
		expect(elementTargetContent.parentElement?.parentElement).toBe(target);

		cleanup();

		render(PortalHarness, { props: { target: null } });
		const nullTargetContent = await screen.findByTestId('portal-content');
		expect(nullTargetContent.parentElement?.parentElement).toBe(document.body);

		target.remove();
	});
});
