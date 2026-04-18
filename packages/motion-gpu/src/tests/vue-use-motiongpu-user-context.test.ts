import { render, waitFor } from '@testing-library/vue';
import { defineComponent, h, onMounted, type PropType } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { CurrentReadable } from '../lib/core/current-value.js';
import { createCurrentWritable } from '../lib/core/current-value.js';
import { createFrameRegistry } from '../lib/core/frame-registry.js';
import type { MotionGPUContext } from '../lib/vue/motiongpu-context.js';
import { provideMotionGPUContext } from '../lib/vue/motiongpu-context.js';
import {
	setMotionGPUUserContext,
	useMotionGPUUserContext
} from '../lib/vue/use-motiongpu-user-context.js';

function assertType<T>(value: T): void {
	void value;
}

function createRuntimeHarness() {
	const registry = createFrameRegistry();
	const context: MotionGPUContext = {
		canvas: undefined,
		size: createCurrentWritable({ width: 0, height: 0 }),
		dpr: createCurrentWritable(1),
		maxDelta: createCurrentWritable(0.1),
		renderMode: createCurrentWritable<'always' | 'manual' | 'on-demand'>('always'),
		autoRender: createCurrentWritable(true),
		user: createCurrentWritable<Record<string | symbol, unknown>>({}),
		invalidate: () => {
			registry.invalidate();
		},
		advance: () => {
			registry.advance();
		},
		scheduler: {
			createStage: registry.createStage,
			getStage: registry.getStage,
			setDiagnosticsEnabled: registry.setDiagnosticsEnabled,
			getDiagnosticsEnabled: registry.getDiagnosticsEnabled,
			getLastRunTimings: registry.getLastRunTimings,
			getSchedule: registry.getSchedule,
			setProfilingEnabled: registry.setProfilingEnabled,
			setProfilingWindow: registry.setProfilingWindow,
			resetProfiling: registry.resetProfiling,
			getProfilingEnabled: registry.getProfilingEnabled,
			getProfilingWindow: registry.getProfilingWindow,
			getProfilingSnapshot: registry.getProfilingSnapshot
		}
	};

	return { context };
}

const MotionGPUProvider = defineComponent({
	name: 'VueUserContextProvider',
	props: {
		payload: {
			type: Object as PropType<ReturnType<typeof createRuntimeHarness>>,
			required: true
		}
	},
	setup(props, { slots }) {
		provideMotionGPUContext(props.payload.context);
		return () => slots.default?.() ?? null;
	}
});

describe('vue useMotionGPUUserContext', () => {
	it('throws when used outside <FragCanvas>', () => {
		const OutsideProbe = defineComponent({
			name: 'OutsideUserContextProbe',
			render: () => null,
			setup() {
				useMotionGPUUserContext();
			}
		});

		expect(() => render(OutsideProbe)).toThrow(/useMotionGPU must be used inside <FragCanvas>/);
	});

	it('throws when setMotionGPUUserContext is called outside component lifecycle', () => {
		const payload = createRuntimeHarness();
		const PrimeStore = defineComponent({
			name: 'PrimeStore',
			setup() {
				useMotionGPUUserContext();
				return () => null;
			}
		});

		render(MotionGPUProvider, {
			props: {
				payload
			},
			slots: {
				default: () => h(PrimeStore)
			}
		});

		expect(() => {
			setMotionGPUUserContext('plugin', () => ({ mode: 'outside-render' }), {
				existing: 'replace'
			});
		}).toThrow();
		expect(payload.context.user.current.plugin).toBeUndefined();
	});

	it('supports scoped set/get with skip, merge and replace modes', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();

		const Probe = defineComponent({
			name: 'UserContextSemanticsProbe',
			props: {
				onProbe: {
					type: Function as PropType<(value: unknown) => void>,
					required: true
				}
			},
			setup(props) {
				const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
				const beforeInitial = allStore.current;
				const initial = setMotionGPUUserContext('plugin', () => ({
					mode: 'initial',
					enabled: true
				}));
				const afterInitial = allStore.current;
				const skipped = setMotionGPUUserContext('plugin', () => ({ mode: 'skipped' }));
				const afterSkipped = allStore.current;
				const merged = setMotionGPUUserContext('plugin', () => ({ merged: true }), {
					existing: 'merge'
				});
				const afterMerged = allStore.current;
				const replaced = setMotionGPUUserContext('plugin', () => ({ mode: 'replaced' }), {
					existing: 'replace'
				});
				const afterReplaced = allStore.current;
				const skippedAfterReplace = setMotionGPUUserContext('plugin', () => ({
					mode: 'unchanged'
				}));
				const afterSkippedAfterReplace = allStore.current;
				const pluginStore = useMotionGPUUserContext<Record<string, unknown>>('plugin');

				onMounted(() => {
					props.onProbe({
						initial,
						skipped,
						merged,
						replaced,
						skippedAfterReplace,
						pluginStore,
						allStore,
						contextRefs: {
							beforeInitial,
							afterInitial,
							afterSkipped,
							afterMerged,
							afterReplaced,
							afterSkippedAfterReplace
						}
					});
				});

				return () => null;
			}
		});

		render(MotionGPUProvider, {
			props: {
				payload
			},
			slots: {
				default: () => h(Probe, { onProbe })
			}
		});

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			initial: Record<string, unknown>;
			skipped: Record<string, unknown>;
			merged: Record<string, unknown>;
			replaced: Record<string, unknown>;
			skippedAfterReplace: Record<string, unknown>;
			pluginStore: CurrentReadable<Record<string, unknown> | undefined>;
			allStore: CurrentReadable<Record<string | symbol, unknown>>;
			contextRefs: {
				beforeInitial: Record<string | symbol, unknown>;
				afterInitial: Record<string | symbol, unknown>;
				afterSkipped: Record<string | symbol, unknown>;
				afterMerged: Record<string | symbol, unknown>;
				afterReplaced: Record<string | symbol, unknown>;
				afterSkippedAfterReplace: Record<string | symbol, unknown>;
			};
		};

		expect(result.initial).toEqual({ mode: 'initial', enabled: true });
		expect(result.skipped).toEqual({ mode: 'initial', enabled: true });
		expect(result.merged).toEqual({ mode: 'initial', enabled: true, merged: true });
		expect(result.replaced).toEqual({ mode: 'replaced' });
		expect(result.skippedAfterReplace).toEqual({ mode: 'replaced' });
		expect(result.pluginStore.current).toEqual({ mode: 'replaced' });
		expect(result.allStore.current.plugin).toEqual({ mode: 'replaced' });
		expect(result.contextRefs.afterInitial).not.toBe(result.contextRefs.beforeInitial);
		expect(result.contextRefs.afterMerged).not.toBe(result.contextRefs.afterSkipped);
		expect(result.contextRefs.afterReplaced).not.toBe(result.contextRefs.afterMerged);
		expect(result.contextRefs.afterSkippedAfterReplace).toBe(result.contextRefs.afterReplaced);
	});

	it('emits updates via all-store and scoped-store subscriptions and stops after unsubscribe', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();

		const Probe = defineComponent({
			name: 'UserContextSubscribeProbe',
			props: {
				onProbe: {
					type: Function as PropType<(value: unknown) => void>,
					required: true
				}
			},
			setup(props) {
				const allStore = useMotionGPUUserContext<Record<string | symbol, unknown>>();
				const pluginStore = useMotionGPUUserContext<{ plugin: unknown }>('plugin');

				const allEvents: Array<Record<string | symbol, unknown>> = [];
				const pluginEvents: unknown[] = [];

				const unsubscribeAll = allStore.subscribe((value) => {
					allEvents.push(value);
				});
				const unsubscribePlugin = pluginStore.subscribe((value) => {
					pluginEvents.push(value);
				});

				setMotionGPUUserContext('plugin', () => ({ mode: 'first' }), {
					existing: 'replace'
				});
				setMotionGPUUserContext('plugin', () => ({ enabled: true }), {
					existing: 'merge'
				});
				setMotionGPUUserContext<unknown>('plugin', () => 7, {
					existing: 'replace'
				});
				const mergedFallback = setMotionGPUUserContext('plugin', () => ({ mode: 'fallback' }), {
					existing: 'merge'
				});

				const beforeUnsubscribeCounts = {
					all: allEvents.length,
					plugin: pluginEvents.length
				};

				unsubscribeAll();
				unsubscribePlugin();

				setMotionGPUUserContext('plugin', () => ({ mode: 'after-unsubscribe' }), {
					existing: 'replace'
				});

				onMounted(() => {
					props.onProbe({
						allEvents,
						pluginEvents,
						beforeUnsubscribeCounts,
						mergedFallback,
						currentPlugin: pluginStore.current
					});
				});

				return () => null;
			}
		});

		render(MotionGPUProvider, {
			props: {
				payload
			},
			slots: {
				default: () => h(Probe, { onProbe })
			}
		});

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			allEvents: Array<Record<string | symbol, unknown>>;
			pluginEvents: unknown[];
			beforeUnsubscribeCounts: { all: number; plugin: number };
			mergedFallback: Record<string, unknown>;
			currentPlugin: Record<string, unknown>;
		};

		expect(result.beforeUnsubscribeCounts).toEqual({ all: 5, plugin: 5 });
		expect(result.allEvents).toHaveLength(5);
		expect(result.pluginEvents).toEqual([
			undefined,
			{ mode: 'first' },
			{ mode: 'first', enabled: true },
			7,
			{ mode: 'fallback' }
		]);
		expect(result.currentPlugin).toEqual({ mode: 'after-unsubscribe' });
	});

	it('falls back to replace semantics when merge mode receives a non-object existing value', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();

		const Probe = defineComponent({
			name: 'MergeFallbackProbe',
			props: {
				onProbe: {
					type: Function as PropType<(value: unknown) => void>,
					required: true
				}
			},
			setup(props) {
				useMotionGPUUserContext<{ plugin: unknown }>('plugin');
				setMotionGPUUserContext<unknown>('plugin', () => 7, {
					existing: 'replace'
				});
				const mergedFallback = setMotionGPUUserContext('plugin', () => ({ mode: 'fallback' }), {
					existing: 'merge'
				});

				onMounted(() => {
					props.onProbe({ mergedFallback });
				});

				return () => null;
			}
		});

		render(MotionGPUProvider, {
			props: {
				payload
			},
			slots: {
				default: () => h(Probe, { onProbe })
			}
		});
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			mergedFallback: Record<string, unknown>;
		};
		expect(result.mergedFallback).toEqual({ mode: 'fallback' });
	});

	it('stores function values when functionValue mode is set to value', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();
		const storedFunction = vi.fn(() => 'vue-function');

		const Probe = defineComponent({
			name: 'FunctionValueProbe',
			props: {
				onProbe: {
					type: Function as PropType<(value: unknown) => void>,
					required: true
				}
			},
			setup(props) {
				const pluginStore = useMotionGPUUserContext<{ plugin: () => string }>('plugin');
				const result = setMotionGPUUserContext<() => string>('plugin', storedFunction, {
					existing: 'replace',
					functionValue: 'value'
				});
				const current = pluginStore.current;
				const callsAfterSet = storedFunction.mock.calls.length;
				const invokedValue = current?.() ?? null;
				const callsAfterInvoke = storedFunction.mock.calls.length;

				onMounted(() => {
					props.onProbe({
						sameReference: result === storedFunction && current === storedFunction,
						callsAfterSet,
						invokedValue,
						callsAfterInvoke
					});
				});

				return () => null;
			}
		});

		render(MotionGPUProvider, {
			props: {
				payload
			},
			slots: {
				default: () => h(Probe, { onProbe })
			}
		});
		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});

		const result = onProbe.mock.calls[0]?.[0] as {
			sameReference: boolean;
			callsAfterSet: number;
			invokedValue: string | null;
			callsAfterInvoke: number;
		};

		expect(result.sameReference).toBe(true);
		expect(result.callsAfterSet).toBe(0);
		expect(result.invokedValue).toBe('vue-function');
		expect(result.callsAfterInvoke).toBe(1);
	});

	it('infers scoped namespace value type from typed context map', async () => {
		const payload = createRuntimeHarness();
		const onProbe = vi.fn();

		type UserMap = {
			plugin: {
				enabled: boolean;
			};
		};

		const Probe = defineComponent({
			name: 'TypedNamespaceProbe',
			props: {
				onProbe: {
					type: Function as PropType<(value: unknown) => void>,
					required: true
				}
			},
			setup(props) {
				const pluginStore = useMotionGPUUserContext<UserMap>('plugin');
				setMotionGPUUserContext('plugin', () => ({ enabled: true }), { existing: 'replace' });
				const enabled = pluginStore.current?.enabled ?? false;
				assertType<boolean>(enabled);

				onMounted(() => {
					props.onProbe({ enabled });
				});

				return () => null;
			}
		});

		render(MotionGPUProvider, {
			props: {
				payload
			},
			slots: {
				default: () => h(Probe, { onProbe })
			}
		});

		await waitFor(() => {
			expect(onProbe).toHaveBeenCalledTimes(1);
		});
		expect(onProbe.mock.calls[0]?.[0]).toEqual({ enabled: true });
	});
});
