<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { createRenderer } from './core/renderer';
	import type { Renderer, UniformMap, UniformValue } from './core/types';
	import { resolveUniformKeys } from './core/uniforms';
	import { createFrameRegistry, provideFrameRegistry } from './frame-context';

	interface Props {
		fragmentWgsl: string;
		uniforms?: UniformMap;
		clearColor?: [number, number, number, number];
		class?: string;
		style?: string;
		children?: Snippet;
	}

	let {
		fragmentWgsl,
		uniforms = {},
		clearColor = [0, 0, 0, 1],
		class: className = '',
		style = '',
		children
	}: Props = $props();

	let canvas: HTMLCanvasElement;
	let errorMessage = $state<string | null>(null);

	const registry = createFrameRegistry();
	provideFrameRegistry(registry);

	onMount(() => {
		let frameId = 0;
		let renderer: Renderer | null = null;
		let isDisposed = false;
		let previousTime = performance.now() / 1000;

		const runtimeUniforms: UniformMap = {};
		const uniformKeys = resolveUniformKeys(uniforms);

		const setUniform = (name: string, value: UniformValue): void => {
			if (!uniformKeys.includes(name)) {
				throw new Error(`Unknown uniform "${name}". Declare it in FragCanvas uniforms prop first.`);
			}
			runtimeUniforms[name] = value;
		};

		const renderFrame = (timestamp: number): void => {
			if (isDisposed || !renderer) {
				return;
			}

			const time = timestamp / 1000;
			const delta = Math.max(0, time - previousTime);
			previousTime = time;

			registry.run({ time, delta, setUniform, canvas });

			renderer.render({
				time,
				delta,
				uniforms: {
					...uniforms,
					...runtimeUniforms
				}
			});

			frameId = requestAnimationFrame(renderFrame);
		};

		(async () => {
			try {
				renderer = await createRenderer({
					canvas,
					fragmentWgsl,
					uniformKeys,
					clearColor
				});
				frameId = requestAnimationFrame(renderFrame);
			} catch (error) {
				errorMessage = error instanceof Error ? error.message : 'Unknown FragCanvas error';
			}
		})();

		return () => {
			isDisposed = true;
			cancelAnimationFrame(frameId);
			renderer?.destroy();
			registry.clear();
		};
	});
</script>

<div class="fragkit-canvas-wrap">
	<canvas bind:this={canvas} class={className} {style}></canvas>
	{#if errorMessage}
		<p class="fragkit-error" data-testid="fragkit-error">{errorMessage}</p>
	{/if}
	{@render children?.()}
</div>

<style>
	.fragkit-canvas-wrap {
		position: relative;
		display: grid;
		width: 100%;
		height: 100%;
	}

	canvas {
		display: block;
		width: 100%;
		height: 100%;
	}

	.fragkit-error {
		position: absolute;
		left: 0.75rem;
		top: 0.75rem;
		margin: 0;
		padding: 0.5rem 0.75rem;
		border-radius: 0.5rem;
		font-size: 0.85rem;
		line-height: 1.2;
		background: rgba(20, 20, 20, 0.75);
		color: #ffcece;
	}
</style>
