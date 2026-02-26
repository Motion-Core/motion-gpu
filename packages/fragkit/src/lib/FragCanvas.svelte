<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import {
		createMaterial,
		resolveMaterial,
		type FragMaterial,
		type MaterialDefines
	} from './core/material';
	import { currentWritable } from './current-writable';
	import { createRenderer } from './core/renderer';
	import { resolveTextureKeys } from './core/textures';
	import type {
		OutputColorSpace,
		RenderPass,
		RenderMode,
		Renderer,
		RenderTargetDefinitionMap,
		TextureDefinitionMap,
		TextureMap,
		TextureValue,
		UniformType,
		UniformMap,
		UniformValue
	} from './core/types';
	import { provideFragkitContext } from './fragkit-context';
	import { assertUniformValueForType } from './core/uniforms';
	import { createFrameRegistry, provideFrameRegistry } from './frame-context';

	interface Props {
		fragmentWgsl?: string;
		material?: FragMaterial;
		uniforms?: UniformMap;
		textures?: TextureDefinitionMap;
		defines?: MaterialDefines;
		renderTargets?: RenderTargetDefinitionMap;
		passes?: RenderPass[];
		clearColor?: [number, number, number, number];
		outputColorSpace?: OutputColorSpace;
		renderMode?: RenderMode;
		autoRender?: boolean;
		dpr?: number;
		class?: string;
		style?: string;
		children?: Snippet;
	}

	const initialDpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1);

	let {
		fragmentWgsl,
		material = undefined,
		uniforms = {},
		textures = {},
		defines = {},
		renderTargets = {},
		passes = [],
		clearColor = [0, 0, 0, 1],
		outputColorSpace = 'srgb',
		renderMode = 'always',
		autoRender = true,
		dpr = initialDpr,
		class: className = '',
		style = '',
		children
	}: Props = $props();

	let canvas: HTMLCanvasElement | undefined;
	let errorMessage = $state<string | null>(null);

	const registry = createFrameRegistry();
	provideFrameRegistry(registry);
	const size = currentWritable({ width: 0, height: 0 });
	const dprState = currentWritable(initialDpr);
	const renderModeState = currentWritable<RenderMode>('always', registry.setRenderMode);
	const autoRenderState = currentWritable<boolean>(true, registry.setAutoRender);

	provideFragkitContext({
		get canvas() {
			return canvas;
		},
		size,
		dpr: dprState,
		renderMode: renderModeState,
		autoRender: autoRenderState,
		invalidate: registry.invalidate,
		advance: registry.advance,
		scheduler: {
			createStage: registry.createStage,
			getStage: registry.getStage
		}
	});

	$effect(() => {
		renderModeState.set(renderMode);
	});

	$effect(() => {
		autoRenderState.set(autoRender);
	});

	$effect(() => {
		dprState.set(dpr);
	});

	onMount(() => {
		if (!canvas) {
			errorMessage = 'Canvas element is not available';
			return () => registry.clear();
		}

		const canvasElement = canvas;
		let frameId = 0;
		let renderer: Renderer | null = null;
		let isDisposed = false;
		let previousTime = performance.now() / 1000;
		let activeRendererSignature = '';
		let rendererRebuildPromise: Promise<void> | null = null;

		const runtimeUniforms: UniformMap = {};
		const runtimeTextures: TextureMap = {};
		let activeUniforms: UniformMap = {};
		let activeTextures: TextureDefinitionMap = {};
		let uniformKeys: string[] = [];
		let uniformTypes = new Map<string, UniformType>();
		let textureKeys: string[] = [];

		const resetRuntimeMaps = (): void => {
			const validUniforms = new Set(uniformKeys);
			for (const key of Object.keys(runtimeUniforms)) {
				if (!validUniforms.has(key)) {
					Reflect.deleteProperty(runtimeUniforms, key);
				}
			}

			const validTextures = new Set(textureKeys);
			for (const key of Object.keys(runtimeTextures)) {
				if (!validTextures.has(key)) {
					Reflect.deleteProperty(runtimeTextures, key);
				}
			}
		};

		const resolveActiveMaterial = () => {
			const fallbackMaterial = createMaterial({
				fragment: fragmentWgsl ?? '',
				uniforms,
				textures,
				defines
			});
			const resolved = resolveMaterial({
				material: material ?? fallbackMaterial
			});

			resolveTextureKeys(resolved.textures);

			return resolved;
		};

		const setUniform = (name: string, value: UniformValue): void => {
			if (!uniformKeys.includes(name)) {
				throw new Error(`Unknown uniform "${name}". Declare it in FragCanvas uniforms prop first.`);
			}
			const expectedType = uniformTypes.get(name);
			if (!expectedType) {
				throw new Error(`Unknown uniform type for "${name}"`);
			}
			assertUniformValueForType(expectedType, value);
			runtimeUniforms[name] = value;
		};

		const setTexture = (name: string, value: TextureValue): void => {
			if (!textureKeys.includes(name)) {
				throw new Error(`Unknown texture "${name}". Declare it in FragCanvas textures prop first.`);
			}
			runtimeTextures[name] = value;
		};

		const renderFrame = (timestamp: number): void => {
			if (isDisposed) {
				return;
			}

			const materialState = resolveActiveMaterial();
			const rendererSignature = `${materialState.signature}|${outputColorSpace}|${clearColor.join(',')}`;
			activeUniforms = materialState.uniforms;
			activeTextures = materialState.textures;
			uniformKeys = materialState.uniformLayout.entries.map((entry) => entry.name);
			uniformTypes = new Map(
				materialState.uniformLayout.entries.map((entry) => [entry.name, entry.type])
			);
			textureKeys = materialState.textureKeys;
			resetRuntimeMaps();

			if (!renderer || activeRendererSignature !== rendererSignature) {
				if (!rendererRebuildPromise) {
					rendererRebuildPromise = (async () => {
						try {
							const nextRenderer = await createRenderer({
								canvas: canvasElement,
								fragmentWgsl: materialState.fragmentWgsl,
								uniformLayout: materialState.uniformLayout,
								textureKeys: materialState.textureKeys,
								textureDefinitions: materialState.textures,
								getRenderTargets: () => renderTargets,
								getPasses: () => passes,
								outputColorSpace,
								clearColor,
								getDpr: () => dprState.current
							});

							if (isDisposed) {
								nextRenderer.destroy();
								return;
							}

							renderer?.destroy();
							renderer = nextRenderer;
							activeRendererSignature = rendererSignature;
						} catch (error) {
							errorMessage = error instanceof Error ? error.message : 'Unknown FragCanvas error';
						} finally {
							rendererRebuildPromise = null;
						}
					})();
				}

				frameId = requestAnimationFrame(renderFrame);
				return;
			}

			const time = timestamp / 1000;
			const delta = Math.max(0, time - previousTime);
			previousTime = time;
			const width = canvasElement.clientWidth || canvasElement.width;
			const height = canvasElement.clientHeight || canvasElement.height;
			size.set({ width, height });

			registry.run({
				time,
				delta,
				setUniform,
				setTexture,
				invalidate: registry.invalidate,
				advance: registry.advance,
				renderMode: registry.getRenderMode(),
				autoRender: registry.getAutoRender(),
				canvas: canvasElement
			});

			if (registry.shouldRender()) {
				renderer.render({
					time,
					delta,
					uniforms: {
						...activeUniforms,
						...runtimeUniforms
					},
					textures: {
						...Object.fromEntries(
							textureKeys.map((key) => [key, activeTextures[key]?.source ?? null])
						),
						...runtimeTextures
					}
				});
			}

			registry.endFrame();

			frameId = requestAnimationFrame(renderFrame);
		};

		(async () => {
			try {
				const initialMaterial = resolveActiveMaterial();
				activeUniforms = initialMaterial.uniforms;
				activeTextures = initialMaterial.textures;
				uniformKeys = initialMaterial.uniformLayout.entries.map((entry) => entry.name);
				uniformTypes = new Map(
					initialMaterial.uniformLayout.entries.map((entry) => [entry.name, entry.type])
				);
				textureKeys = initialMaterial.textureKeys;
				activeRendererSignature = '';
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
