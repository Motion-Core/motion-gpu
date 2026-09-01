<script lang="ts">
	import { onMount } from 'svelte';
	import { createCurrentWritable } from '../../lib/core/current-value';
	import { createFrameRegistry } from '../../lib/core/frame-registry';
	import type { RenderMode } from '../../lib/core/types';
	import { provideSpektralContext, type SpektralContext } from '../../lib/svelte/spektral-context';
	import {
		usePointer,
		type UsePointerOptions,
		type UsePointerResult
	} from '../../lib/svelte/use-pointer';

	interface ProbePayload {
		context: SpektralContext;
		pointer: UsePointerResult;
	}

	interface Props {
		advanceSpy?: () => void;
		canvas: HTMLCanvasElement;
		invalidateSpy?: () => void;
		onProbe: (value: ProbePayload) => void;
		pointerOptions?: UsePointerOptions;
		renderMode?: RenderMode;
	}

	let {
		advanceSpy = () => {},
		canvas,
		invalidateSpy = () => {},
		onProbe,
		pointerOptions = {},
		renderMode = 'always'
	}: Props = $props();

	const registry = createFrameRegistry();
	const size = createCurrentWritable({ width: 0, height: 0 });
	const dpr = createCurrentWritable(1);
	const maxDelta = createCurrentWritable(0.1);
	const renderModeState = createCurrentWritable<RenderMode>('always');
	const autoRender = createCurrentWritable(true);
	const user = createCurrentWritable<Record<string | symbol, unknown>>({});

	const context: SpektralContext = {
		get canvas() {
			return canvas;
		},
		size,
		dpr,
		maxDelta,
		renderMode: renderModeState,
		autoRender,
		user,
		invalidate: () => {
			invalidateSpy();
			registry.invalidate();
		},
		advance: () => {
			advanceSpy();
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

	provideSpektralContext(context);
	const pointer = usePointer(() => pointerOptions);

	$effect(() => {
		renderModeState.set(renderMode);
	});

	onMount(() => {
		onProbe({ context, pointer });
	});
</script>

<div></div>
