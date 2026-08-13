import { render, waitFor } from '@testing-library/svelte';
import { expect, vi } from 'vitest';
import MotionGPUUserOutside from './fixtures/MotionGPUUserOutside.svelte';
import MotionGPUWithUserFunctionValueProbe from './fixtures/MotionGPUWithUserFunctionValueProbe.svelte';
import MotionGPUWithUserProbe from './fixtures/MotionGPUWithUserProbe.svelte';
import MotionGPUWithUserSubscribeProbe from './fixtures/MotionGPUWithUserSubscribeProbe.svelte';
import MotionGPUWithUserTypedNamespaceProbe from './fixtures/MotionGPUWithUserTypedNamespaceProbe.svelte';
import {
	defineUserContextContract,
	type UserContextFunctionValueResult,
	type UserContextSemanticsResult,
	type UserContextSubscriptionResult
} from './helpers/user-context-contract.js';

defineUserContextContract({
	framework: 'svelte',
	readOutside: () => {
		render(MotionGPUUserOutside);
	},
	async runSemantics() {
		const onProbe = vi.fn();
		render(MotionGPUWithUserProbe, { props: { onProbe } });
		await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
		return onProbe.mock.calls[0]?.[0] as UserContextSemanticsResult;
	},
	async runSubscriptions() {
		const onProbe = vi.fn();
		render(MotionGPUWithUserSubscribeProbe, { props: { onProbe } });
		await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
		return onProbe.mock.calls[0]?.[0] as UserContextSubscriptionResult;
	},
	async runFunctionValue() {
		const onProbe = vi.fn();
		render(MotionGPUWithUserFunctionValueProbe, { props: { onProbe } });
		await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
		return onProbe.mock.calls[0]?.[0] as UserContextFunctionValueResult;
	},
	async runTypedNamespace() {
		const onProbe = vi.fn();
		render(MotionGPUWithUserTypedNamespaceProbe, { props: { onProbe } });
		await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
		return onProbe.mock.calls[0]?.[0] as { enabled: boolean };
	}
});
