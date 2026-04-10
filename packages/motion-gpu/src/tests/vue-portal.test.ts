import { cleanup, render, screen, waitFor } from '@testing-library/vue';
import { defineComponent, h, type PropType } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import Portal from '../lib/vue/Portal.vue';

const PortalHarness = defineComponent({
	name: 'PortalHarness',
	props: {
		target: {
			type: [String, Object] as PropType<string | HTMLElement | null>,
			default: 'body'
		}
	},
	setup(props) {
		return () =>
			h(
				Portal,
				{ target: props.target },
				{ default: () => h('span', { 'data-testid': 'portal-content' }, 'portal content') }
			);
	}
});

describe('vue Portal', () => {
	afterEach(() => {
		cleanup();
		document.body.innerHTML = '';
	});

	it('mounts into body by default and removes portal root on unmount', async () => {
		const view = render(PortalHarness);
		const content = await screen.findByTestId('portal-content');
		const portalRoot = content.parentElement;

		expect(portalRoot?.parentElement).toBe(document.body);

		view.unmount();
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

	it('moves mounted content when target changes at runtime', async () => {
		const firstTarget = document.createElement('section');
		const secondTarget = document.createElement('section');
		document.body.appendChild(firstTarget);
		document.body.appendChild(secondTarget);

		const view = render(PortalHarness, { props: { target: firstTarget } });
		const content = await screen.findByTestId('portal-content');
		expect(content.parentElement?.parentElement).toBe(firstTarget);

		await view.rerender({ target: secondTarget });
		await waitFor(() => {
			expect(screen.getByTestId('portal-content').parentElement?.parentElement).toBe(secondTarget);
		});

		view.unmount();
		expect(content.isConnected).toBe(false);
		firstTarget.remove();
		secondTarget.remove();
	});
});
