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

async function runProbe<T>(component: Parameters<typeof render>[0]): Promise<T> {
	const onProbe = vi.fn();
	render(component, { props: { onProbe } });
	await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
	return onProbe.mock.calls[0]?.[0] as T;
}

defineUserContextContract({
	framework: 'svelte',
	readOutside: () => {
		render(MotionGPUUserOutside);
	},
	runSemantics: () => runProbe<UserContextSemanticsResult>(MotionGPUWithUserProbe),
	runSubscriptions: () => runProbe<UserContextSubscriptionResult>(MotionGPUWithUserSubscribeProbe),
	runFunctionValue: () =>
		runProbe<UserContextFunctionValueResult>(MotionGPUWithUserFunctionValueProbe),
	runTypedNamespace: () => runProbe<{ enabled: boolean }>(MotionGPUWithUserTypedNamespaceProbe)
});
