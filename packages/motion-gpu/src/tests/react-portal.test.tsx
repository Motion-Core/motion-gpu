import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Portal } from '../lib/react/Portal.js';

interface PortalHarnessProps {
	target?: string | HTMLElement | null;
}

function PortalHarness({ target = 'body' }: PortalHarnessProps) {
	return (
		<Portal target={target}>
			<span data-testid="portal-content">portal content</span>
		</Portal>
	);
}

describe('react Portal', () => {
	afterEach(() => {
		cleanup();
		document.body.innerHTML = '';
	});

	it('mounts into body by default and removes portal root on unmount', async () => {
		const view = render(<PortalHarness />);
		const content = await screen.findByTestId('portal-content');

		expect(content.parentElement).toBe(document.body);

		view.unmount();
		expect(content.isConnected).toBe(false);
		expect(screen.queryByTestId('portal-content')).toBeNull();
	});

	it('mounts into target element selected by css selector and falls back to body when missing', async () => {
		const target = document.createElement('section');
		target.id = 'portal-target';
		document.body.appendChild(target);

		render(<PortalHarness target="#portal-target" />);
		const selectedTargetContent = await screen.findByTestId('portal-content');
		expect(selectedTargetContent.parentElement).toBe(target);

		cleanup();

		render(<PortalHarness target="#missing-target" />);
		const fallbackContent = await screen.findByTestId('portal-content');
		expect(fallbackContent.parentElement).toBe(document.body);

		target.remove();
	});

	it('supports HTMLElement target and null target fallback', async () => {
		const target = document.createElement('aside');
		document.body.appendChild(target);

		render(<PortalHarness target={target} />);
		const elementTargetContent = await screen.findByTestId('portal-content');
		expect(elementTargetContent.parentElement).toBe(target);

		cleanup();

		render(<PortalHarness target={null} />);
		const nullTargetContent = await screen.findByTestId('portal-content');
		expect(nullTargetContent.parentElement).toBe(document.body);

		target.remove();
	});

	it('moves mounted content when target changes at runtime', async () => {
		const firstTarget = document.createElement('section');
		const secondTarget = document.createElement('section');
		document.body.appendChild(firstTarget);
		document.body.appendChild(secondTarget);

		const view = render(<PortalHarness target={firstTarget} />);
		const content = await screen.findByTestId('portal-content');
		expect(content.parentElement).toBe(firstTarget);

		view.rerender(<PortalHarness target={secondTarget} />);
		await waitFor(() => {
			expect(screen.getByTestId('portal-content').parentElement).toBe(secondTarget);
		});

		view.unmount();
		expect(content.isConnected).toBe(false);
		firstTarget.remove();
		secondTarget.remove();
	});
});
