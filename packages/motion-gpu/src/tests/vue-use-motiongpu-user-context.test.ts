import { render, waitFor } from '@testing-library/vue';
import { defineComponent, h, onMounted, type PropType } from 'vue';
import { expect, vi } from 'vitest';
import { provideMotionGPUContext } from '../lib/vue/motiongpu-context.js';
import {
	setMotionGPUUserContext,
	useMotionGPUUserContext
} from '../lib/vue/use-motiongpu-user-context.js';
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

const MotionGPUProvider = defineComponent({
	name: 'VueUserContextProvider',
	props: {
		payload: {
			type: Object as PropType<ReturnType<typeof createUserContextRuntimeHarness>>,
			required: true
		}
	},
	setup(props, { slots }) {
		provideMotionGPUContext(props.payload.context);
		return () => slots.default?.() ?? null;
	}
});

function createScenarioProbe(scenario: Scenario, onProbe: (value: unknown) => void) {
	return defineComponent({
		name: 'VueUserContextScenarioProbe',
		setup() {
			const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
			const pluginStore = useMotionGPUUserContext<{ plugin: unknown }>('plugin');
			const objectStore = useMotionGPUUserContext<{ plugin: Record<string, unknown> }>('plugin');
			const functionStore = useMotionGPUUserContext<{ plugin: () => string }>('plugin');
			const typedStore = useMotionGPUUserContext<UserMap>('plugin');
			let result: unknown;

			switch (scenario) {
				case 'semantics':
					result = runUserContextSemantics(allStore, objectStore, setMotionGPUUserContext);
					break;
				case 'subscriptions':
					result = runUserContextSubscriptions(allStore, pluginStore, setMotionGPUUserContext);
					break;
				case 'function-value':
					result = runUserContextFunctionValue('vue', functionStore, setMotionGPUUserContext);
					break;
				case 'typed-namespace':
					result = runUserContextTypedNamespace(typedStore, setMotionGPUUserContext);
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
	render(MotionGPUProvider, {
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
				useMotionGPUUserContext();
			}
		});
		render(OutsideProbe);
	},
	writeOutside: {
		name: 'throws when setMotionGPUUserContext is called outside component lifecycle',
		mount() {
			const payload = createUserContextRuntimeHarness();
			const PrimeStore = defineComponent({
				name: 'PrimeStore',
				setup() {
					useMotionGPUUserContext();
					return () => null;
				}
			});
			render(MotionGPUProvider, {
				props: { payload },
				slots: { default: () => h(PrimeStore) }
			});
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
	runSemantics: () => runScenario('semantics'),
	runSubscriptions: () => runScenario('subscriptions'),
	runFunctionValue: () => runScenario('function-value'),
	runTypedNamespace: () => runScenario('typed-namespace')
});

assertType<UserContextSetter>(setMotionGPUUserContext);
