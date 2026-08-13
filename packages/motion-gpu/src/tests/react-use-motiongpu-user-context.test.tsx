import { render, waitFor } from '@testing-library/react';
import { useEffect, useRef, type ReactElement } from 'react';
import { expect, vi } from 'vitest';
import { MotionGPUReactContext } from '../lib/react/motiongpu-context.js';
import {
	setMotionGPUUserContext,
	useMotionGPUUserContext,
	useSetMotionGPUUserContext
} from '../lib/react/use-motiongpu-user-context.js';
import {
	createUserContextRuntimeHarness,
	defineUserContextContract,
	runUserContextFunctionValue,
	runUserContextSemantics,
	runUserContextSubscriptions,
	runUserContextTypedNamespace,
	type UserContextSemanticsResult,
	type UserContextSetter
} from './helpers/user-context-contract.js';

type Scenario = 'function-value' | 'subscriptions' | 'typed-namespace';
type UserMap = { plugin: { enabled: boolean } };

function assertType<T>(value: T): void {
	void value;
}

function withProvider(
	ui: ReactElement,
	payload: ReturnType<typeof createUserContextRuntimeHarness>
): ReactElement {
	return (
		<MotionGPUReactContext.Provider value={payload.context}>{ui}</MotionGPUReactContext.Provider>
	);
}

function SemanticsProbe({ onProbe }: { onProbe: (value: UserContextSemanticsResult) => void }) {
	const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
	const pluginStore = useMotionGPUUserContext<{ plugin: Record<string, unknown> }>('plugin');
	const result = runUserContextSemantics(allStore, pluginStore, setMotionGPUUserContext);

	useEffect(() => {
		onProbe(result);
	}, [onProbe, result]);
	return null;
}

function ScenarioProbe({
	scenario,
	onProbe
}: {
	scenario: Scenario;
	onProbe: (value: unknown) => void;
}) {
	const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
	const pluginStore = useMotionGPUUserContext<{ plugin: unknown }>('plugin');
	const functionStore = useMotionGPUUserContext<{ plugin: () => string }>('plugin');
	const typedStore = useMotionGPUUserContext<UserMap>('plugin');
	const setUserContext = useSetMotionGPUUserContext();

	useEffect(() => {
		switch (scenario) {
			case 'subscriptions':
				onProbe(runUserContextSubscriptions(allStore, pluginStore, setUserContext));
				break;
			case 'function-value':
				onProbe(runUserContextFunctionValue('react', functionStore, setUserContext));
				break;
			case 'typed-namespace':
				onProbe(runUserContextTypedNamespace(typedStore, setUserContext));
		}
	}, [allStore, functionStore, onProbe, pluginStore, scenario, setUserContext, typedStore]);

	// @ts-expect-error mapped namespace value should not expose unknown fields
	assertType<boolean>(typedStore.current?.missing);
	return null;
}

async function runScenario<T>(scenario: Scenario): Promise<T> {
	const payload = createUserContextRuntimeHarness();
	const onProbe = vi.fn();
	render(withProvider(<ScenarioProbe scenario={scenario} onProbe={onProbe} />, payload));
	await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
	return onProbe.mock.calls[0]?.[0] as T;
}

defineUserContextContract({
	framework: 'react',
	readOutside: () => {
		function OutsideProbe() {
			useMotionGPUUserContext();
			return null;
		}
		render(<OutsideProbe />);
	},
	writeOutside: {
		name: 'throws when setMotionGPUUserContext is called outside React render lifecycle',
		mount() {
			const payload = createUserContextRuntimeHarness();
			function PrimeStore() {
				useMotionGPUUserContext();
				return null;
			}
			render(withProvider(<PrimeStore />, payload));
			return {
				invoke: () => {
					setMotionGPUUserContext('plugin', () => ({ mode: 'outside-render' }), {
						existing: 'replace'
					});
				},
				current: () => payload.context.user.current.plugin
			};
		}
	},
	async runSemantics() {
		const payload = createUserContextRuntimeHarness();
		const onProbe = vi.fn();
		render(withProvider(<SemanticsProbe onProbe={onProbe} />, payload));
		await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
		return onProbe.mock.calls[0]?.[0] as UserContextSemanticsResult;
	},
	runSubscriptions: () => runScenario('subscriptions'),
	runFunctionValue: () => runScenario('function-value'),
	runTypedNamespace: () => runScenario('typed-namespace'),
	async runStability() {
		const payload = createUserContextRuntimeHarness();
		const onProbe = vi.fn();

		function StabilityProbe({ step }: { step: number }) {
			const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
			const pluginStore = useMotionGPUUserContext<{ plugin: unknown }>('plugin');
			const lastRef = useRef({ allStore, pluginStore });

			useEffect(() => {
				onProbe({
					step,
					sameAllStore: lastRef.current.allStore === allStore,
					samePluginStore: lastRef.current.pluginStore === pluginStore
				});
				lastRef.current = { allStore, pluginStore };
			}, [allStore, pluginStore, step]);

			return null;
		}

		const view = render(withProvider(<StabilityProbe step={0} />, payload));
		await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
		view.rerender(withProvider(<StabilityProbe step={1} />, payload));
		await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(2));
		view.rerender(withProvider(<StabilityProbe step={2} />, payload));
		await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(3));
		return onProbe.mock.calls.slice(1).map(([result]) => result);
	}
});

assertType<UserContextSetter>(setMotionGPUUserContext);
