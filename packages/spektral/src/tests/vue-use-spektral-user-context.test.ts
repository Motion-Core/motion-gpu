import { render, waitFor } from '@testing-library/vue';
import { defineComponent, h, onMounted, type PropType } from 'vue';
import { expect, vi } from 'vitest';
import { provideSpektralContext } from '../lib/vue/spektral-context.js';
import {
	setSpektralUserContext,
	useSpektralUserContext
} from '../lib/vue/use-spektral-user-context.js';
import {
	createUserContextRuntimeHarness,
	defineUserContextContract,
	runUserContextFunctionValue,
	runUserContextSemantics,
	runUserContextSubscriptions,
	runUserContextTypedNamespace,
	type UserContextSetter
} from './helpers/user-context-contract.js';

type Scenario = 'function-value' | 'semantics' | 'subscriptions' | 'typed-namespace';
type UserMap = { plugin: { enabled: boolean } };

function assertType<T>(value: T): void {
	void value;
}

const SpektralProvider = defineComponent({
	name: 'VueUserContextProvider',
	props: {
		payload: {
			type: Object as PropType<ReturnType<typeof createUserContextRuntimeHarness>>,
			required: true
		}
	},
	setup(props, { slots }) {
		provideSpektralContext(props.payload.context);
		return () => slots.default?.() ?? null;
	}
});

function createScenarioProbe(scenario: Scenario, onProbe: (value: unknown) => void) {
	return defineComponent({
		name: 'VueUserContextScenarioProbe',
		setup() {
			const allStore = useSpektralUserContext<Record<string | symbol, unknown>>();
			const pluginStore = useSpektralUserContext<{ plugin: unknown }>('plugin');
			const objectStore = useSpektralUserContext<{ plugin: Record<string, unknown> }>('plugin');
			const functionStore = useSpektralUserContext<{ plugin: () => string }>('plugin');
			const typedStore = useSpektralUserContext<UserMap>('plugin');
			let result: unknown;

			switch (scenario) {
				case 'semantics':
					result = runUserContextSemantics(allStore, objectStore, setSpektralUserContext);
					break;
				case 'subscriptions':
					result = runUserContextSubscriptions(allStore, pluginStore, setSpektralUserContext);
					break;
				case 'function-value':
					result = runUserContextFunctionValue('vue', functionStore, setSpektralUserContext);
					break;
				case 'typed-namespace':
					result = runUserContextTypedNamespace(typedStore, setSpektralUserContext);
			}

			onMounted(() => onProbe(result));
			// @ts-expect-error mapped namespace value should not expose unknown fields
			assertType<boolean>(typedStore.current?.missing);
			return () => null;
		}
	});
}

async function runScenario<T>(scenario: Scenario): Promise<T> {
	const payload = createUserContextRuntimeHarness();
	const onProbe = vi.fn();
	const Probe = createScenarioProbe(scenario, onProbe);
	render(SpektralProvider, {
		props: { payload },
		slots: { default: () => h(Probe) }
	});
	await waitFor(() => expect(onProbe).toHaveBeenCalledTimes(1));
	return onProbe.mock.calls[0]?.[0] as T;
}

defineUserContextContract({
	framework: 'vue',
	readOutside: () => {
		const OutsideProbe = defineComponent({
			name: 'OutsideUserContextProbe',
			render: () => null,
			setup() {
				useSpektralUserContext();
			}
		});
		render(OutsideProbe);
	},
	writeOutside: {
		name: 'throws when setSpektralUserContext is called outside component lifecycle',
		mount() {
			const payload = createUserContextRuntimeHarness();
			const PrimeStore = defineComponent({
				name: 'PrimeStore',
				setup() {
					useSpektralUserContext();
					return () => null;
				}
			});
			render(SpektralProvider, {
				props: { payload },
				slots: { default: () => h(PrimeStore) }
			});
			return {
				invoke: () => {
					setSpektralUserContext('plugin', () => ({ mode: 'outside-render' }), {
						existing: 'replace'
					});
				},
				current: () => payload.context.user.current.plugin
			};
		}
	},
	runSemantics: () => runScenario('semantics'),
	runSubscriptions: () => runScenario('subscriptions'),
	runFunctionValue: () => runScenario('function-value'),
	runTypedNamespace: () => runScenario('typed-namespace')
});

assertType<UserContextSetter>(setSpektralUserContext);
