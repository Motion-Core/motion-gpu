import { render, waitFor } from '@testing-library/svelte';
import { expect, vi } from 'vitest';
import SpektralUserOutside from './fixtures/SpektralUserOutside.svelte';
import SpektralWithUserFunctionValueProbe from './fixtures/SpektralWithUserFunctionValueProbe.svelte';
import SpektralWithUserProbe from './fixtures/SpektralWithUserProbe.svelte';
import SpektralWithUserSubscribeProbe from './fixtures/SpektralWithUserSubscribeProbe.svelte';
import SpektralWithUserTypedNamespaceProbe from './fixtures/SpektralWithUserTypedNamespaceProbe.svelte';
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
		render(SpektralUserOutside);
	},
	runSemantics: () => runProbe<UserContextSemanticsResult>(SpektralWithUserProbe),
	runSubscriptions: () => runProbe<UserContextSubscriptionResult>(SpektralWithUserSubscribeProbe),
	runFunctionValue: () =>
		runProbe<UserContextFunctionValueResult>(SpektralWithUserFunctionValueProbe),
	runTypedNamespace: () => runProbe<{ enabled: boolean }>(SpektralWithUserTypedNamespaceProbe)
});
