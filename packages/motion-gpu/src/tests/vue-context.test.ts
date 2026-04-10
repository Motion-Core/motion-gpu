import { render, waitFor } from '@testing-library/vue';
import { defineComponent, h, onMounted, type PropType } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { createCurrentWritable } from '../lib/core/current-value.js';
import { createFrameRegistry } from '../lib/core/frame-registry.js';
import type { MotionGPUContext } from '../lib/vue/motiongpu-context.js';
import { provideMotionGPUContext, useMotionGPU } from '../lib/vue/motiongpu-context.js';
import { provideFrameRegistry, useFrame, type UseFrameResult } from '../lib/vue/frame-context.js';
import {
	setMotionGPUUserContext,
	useMotionGPUUserContext
} from '../lib/vue/use-motiongpu-user-context.js';

function createRuntimeHarness() {
	const registry = createFrameRegistry();
	const size = createCurrentWritable({ width: 0, height: 0 });
	const dpr = createCurrentWritable(1);
	const maxDelta = createCurrentWritable(0.1);
	const renderMode = createCurrentWritable<'always' | 'manual' | 'on-demand'>('always');
	const autoRender = createCurrentWritable(true);
	const user = createCurrentWritable<Record<string | symbol, unknown>>({});

	const context: MotionGPUContext = {
		canvas: undefined,
		size,
		dpr,
		maxDelta,
		renderMode,
		autoRender,
		user,
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

	return { context, registry };
}

function createState(registry: ReturnType<typeof createFrameRegistry>, delta = 0.016) {
	return {
		time: 1,
		delta,
		setUniform: vi.fn(),
		setTexture: vi.fn(),
		writeStorageBuffer: vi.fn(),
		readStorageBuffer: vi.fn(() => Promise.resolve(new ArrayBuffer(0))),
		invalidate: registry.invalidate,
		advance: registry.advance,
		renderMode: registry.getRenderMode(),
		autoRender: registry.getAutoRender(),
		canvas: document.createElement('canvas')
	};
}

const Providers = defineComponent({
	name: 'VueAdapterProviders',
	props: {
		payload: {
			type: Object as PropType<ReturnType<typeof createRuntimeHarness>>,
			required: true
		},
		child: {
			type: Object as PropType<ReturnType<typeof defineComponent>>,
			required: true
		},
		childProps: {
			type: Object as PropType<Record<string, unknown>>,
			default: () => ({})
		}
	},
	setup(props) {
		provideFrameRegistry(props.payload.registry);
		provideMotionGPUContext(props.payload.context);
		return () => h(props.child, props.childProps);
	}
});

describe('vue adapter runtime hooks', () => {
	it('throws when useMotionGPU is called outside provider', () => {
		const Probe = defineComponent({
			name: 'OutsideMotionGPUProbe',
			setup() {
				useMotionGPU();
				return () => null;
			}
		});

		expect(() => render(Probe)).toThrow(/useMotionGPU must be used inside <FragCanvas>/);
	});

	it('registers useFrame callbacks and auto-unsubscribes on unmount', async () => {
		const payload = createRuntimeHarness();
		const callback = vi.fn();
		const onRegistration = vi.fn();

		const Probe = defineComponent({
			name: 'FrameRegistrationProbe',
			props: {
				onRegistration: {
					type: Function as PropType<(value: UseFrameResult) => void>,
					required: true
				}
			},
			setup(probeProps) {
				const registration = useFrame('probe-task', callback);
				onMounted(() => {
					probeProps.onRegistration(registration);
				});
				return () => null;
			}
		});

		const view = render(Providers, {
			props: {
				payload,
				child: Probe,
				childProps: { onRegistration }
			}
		});
		await waitFor(() => {
			expect(onRegistration).toHaveBeenCalledTimes(1);
		});
		const registration = onRegistration.mock.calls[0]?.[0] as UseFrameResult;

		await waitFor(() => {
			const stageWithTask = payload.registry
				.getSchedule()
				.stages.some((stage) => stage.tasks.includes('probe-task'));
			expect(stageWithTask).toBe(true);
		});

		expect(registration.task.key).toBe('probe-task');
		let startedValue = false;
		const unsubscribeStarted = registration.started.subscribe((value) => {
			startedValue = value;
		});
		expect(startedValue).toBe(true);
		unsubscribeStarted();

		payload.registry.run(createState(payload.registry));
		expect(callback).toHaveBeenCalledTimes(1);

		view.unmount();
		payload.registry.run(createState(payload.registry));
		expect(callback).toHaveBeenCalledTimes(1);
	});

	it('does not re-register useFrame when options object is semantically unchanged', async () => {
		const payload = createRuntimeHarness();
		const callback = vi.fn();
		const registerSpy = vi.spyOn(payload.registry, 'register');

		const Probe = defineComponent({
			name: 'StableFrameProbe',
			props: {
				frame: {
					type: Number,
					required: true
				}
			},
			setup() {
				useFrame('stable-task', callback, { autoInvalidate: false });
				return () => null;
			}
		});

		const view = render(Providers, {
			props: {
				payload,
				child: Probe,
				childProps: { frame: 0 }
			}
		});
		await waitFor(() => {
			expect(registerSpy).toHaveBeenCalledTimes(1);
		});

		await view.rerender({
			payload,
			child: Probe,
			childProps: { frame: 1 }
		});
		await waitFor(() => {
			expect(registerSpy).toHaveBeenCalledTimes(1);
		});
	});

	it('freezes useFrame registration options after first render', async () => {
		const payload = createRuntimeHarness();
		const callback = vi.fn();
		const registerSpy = vi.spyOn(payload.registry, 'register');

		const Probe = defineComponent({
			name: 'FrozenOptionsProbe',
			props: {
				autoInvalidate: {
					type: Boolean,
					required: true
				}
			},
			setup(probeProps) {
				useFrame('frozen-task', callback, { autoInvalidate: probeProps.autoInvalidate });
				return () => null;
			}
		});

		const view = render(Providers, {
			props: {
				payload,
				child: Probe,
				childProps: { autoInvalidate: false }
			}
		});
		await waitFor(() => {
			expect(registerSpy).toHaveBeenCalledTimes(1);
		});

		payload.registry.setRenderMode('on-demand');
		payload.registry.endFrame();
		payload.registry.run(createState(payload.registry));
		expect(payload.registry.shouldRender()).toBe(false);

		await view.rerender({
			payload,
			child: Probe,
			childProps: { autoInvalidate: true }
		});
		await waitFor(() => {
			expect(registerSpy).toHaveBeenCalledTimes(1);
		});

		payload.registry.endFrame();
		payload.registry.run(createState(payload.registry));
		expect(payload.registry.shouldRender()).toBe(false);
		expect(callback).toHaveBeenCalledTimes(2);
	});

	it('throws when useFrame is called outside FrameRegistry provider', () => {
		const Probe = defineComponent({
			name: 'OutsideFrameProbe',
			setup() {
				useFrame(() => undefined);
				return () => null;
			}
		});

		const payload = createRuntimeHarness();
		const MissingFrameProvider = defineComponent({
			name: 'MissingFrameProvider',
			setup() {
				provideMotionGPUContext(payload.context);
				return () => h(Probe);
			}
		});

		expect(() => render(MissingFrameProvider)).toThrow(/useFrame must be used inside <FragCanvas>/);
	});

	it('supports skip, merge and replace user-context semantics', async () => {
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
			setup(probeProps) {
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
					probeProps.onProbe({
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

		render(Providers, {
			props: {
				payload,
				child: Probe,
				childProps: { onProbe }
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
			pluginStore: { current: Record<string, unknown> | undefined };
			allStore: { current: Record<string | symbol, unknown> };
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
		expect(result.merged).toEqual({
			mode: 'initial',
			enabled: true,
			merged: true
		});
		expect(result.replaced).toEqual({ mode: 'replaced' });
		expect(result.skippedAfterReplace).toEqual({ mode: 'replaced' });

		expect(result.pluginStore.current).toEqual({ mode: 'replaced' });
		expect(result.allStore.current.plugin).toEqual({ mode: 'replaced' });
		expect(result.contextRefs.afterInitial).not.toBe(result.contextRefs.beforeInitial);
		expect(result.contextRefs.afterMerged).not.toBe(result.contextRefs.afterSkipped);
		expect(result.contextRefs.afterReplaced).not.toBe(result.contextRefs.afterMerged);
		expect(result.contextRefs.afterSkippedAfterReplace).toBe(result.contextRefs.afterReplaced);
	});
});
