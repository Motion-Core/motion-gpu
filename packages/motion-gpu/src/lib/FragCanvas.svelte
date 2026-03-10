<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { resolveMaterial, type FragMaterial } from './core/material';
	import {
		toMotionGPUErrorReport,
		type MotionGPUErrorPhase,
		type MotionGPUErrorReport
	} from './core/error-report';
	import MotionGPUErrorOverlay from './MotionGPUErrorOverlay.svelte';
	import { currentWritable } from './current-writable';
	import { createRenderer } from './core/renderer';
	import { buildRendererPipelineSignature } from './core/recompile-policy';
	import type {
		FrameInvalidationToken,
		OutputColorSpace,
		RenderPass,
		RenderMode,
		Renderer,
		RenderTargetDefinitionMap,
		TextureMap,
		TextureValue,
		UniformType,
		UniformValue
	} from './core/types';
	import { provideMotionGPUContext } from './motiongpu-context';
	import { assertUniformValueForType } from './core/uniforms';
	import { createFrameRegistry, provideFrameRegistry } from './frame-context';

	interface Props {
		material: FragMaterial;
		renderTargets?: RenderTargetDefinitionMap;
		passes?: RenderPass[];
		clearColor?: [number, number, number, number];
		outputColorSpace?: OutputColorSpace;
		renderMode?: RenderMode;
		autoRender?: boolean;
		maxDelta?: number;
		adapterOptions?: GPURequestAdapterOptions;
		deviceDescriptor?: GPUDeviceDescriptor;
		dpr?: number;
		showErrorOverlay?: boolean;
		errorRenderer?: Snippet<[MotionGPUErrorReport]>;
		onError?: (report: MotionGPUErrorReport) => void;
		class?: string;
		style?: string;
		children?: Snippet;
	}

	const initialDpr = typeof window === 'undefined' ? 1 : (window.devicePixelRatio ?? 1);

	let {
		material,
		renderTargets = {},
		passes = [],
		clearColor = [0, 0, 0, 1],
		outputColorSpace = 'srgb',
		renderMode = 'always',
		autoRender = true,
		maxDelta = 0.1,
		adapterOptions = undefined,
		deviceDescriptor = undefined,
		dpr = initialDpr,
		showErrorOverlay = true,
		errorRenderer = undefined,
		onError = undefined,
		class: className = '',
		style = '',
		children
	}: Props = $props();

	let canvas: HTMLCanvasElement | undefined;
	let errorReport = $state<MotionGPUErrorReport | null>(null);

	const bindCanvas = (node: HTMLCanvasElement) => {
		canvas = node;
		return {
			destroy: () => {
				if (canvas === node) {
					canvas = undefined;
				}
			}
		};
	};

	const getRendererRetryDelayMs = (attempt: number): number => {
		return Math.min(8000, 250 * 2 ** Math.max(0, attempt - 1));
	};

	const registry = createFrameRegistry({ maxDelta: 0.1 });
	provideFrameRegistry(registry);
	let requestFrameSignal: (() => void) | null = null;
	const requestFrame = (): void => {
		requestFrameSignal?.();
	};
	const invalidateFrame = (token?: FrameInvalidationToken): void => {
		registry.invalidate(token);
		requestFrame();
	};
	const advanceFrame = (): void => {
		registry.advance();
		requestFrame();
	};
	const size = currentWritable({ width: 0, height: 0 });
	const dprState = currentWritable(initialDpr);
	const maxDeltaState = currentWritable<number>(0.1, registry.setMaxDelta);
	const renderModeState = currentWritable<RenderMode>('always', registry.setRenderMode);
	const autoRenderState = currentWritable<boolean>(true, registry.setAutoRender);
	const userState = currentWritable<Record<string | symbol, unknown>>({});

	provideMotionGPUContext({
		get canvas() {
			return canvas;
		},
		size,
		dpr: dprState,
		maxDelta: maxDeltaState,
		renderMode: renderModeState,
		autoRender: autoRenderState,
		user: userState,
		invalidate: () => invalidateFrame(),
		advance: advanceFrame,
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
	});

	$effect(() => {
		renderModeState.set(renderMode);
		requestFrame();
	});

	$effect(() => {
		autoRenderState.set(autoRender);
		requestFrame();
	});

	$effect(() => {
		maxDeltaState.set(maxDelta);
		requestFrame();
	});

	$effect(() => {
		dprState.set(dpr);
		requestFrame();
	});

	onMount(() => {
		const setError = (error: unknown, phase: MotionGPUErrorPhase): void => {
			const report = toMotionGPUErrorReport(error, phase);
			errorReport = report;
			onError?.(report);
		};

		const clearError = (): void => {
			errorReport = null;
		};

		if (!canvas) {
			setError(new Error('Canvas element is not available'), 'initialization');
			return () => registry.clear();
		}

		const canvasElement = canvas;
		let frameId: number | null = null;
		let renderer: Renderer | null = null;
		let isDisposed = false;
		let previousTime = performance.now() / 1000;
		let activeRendererSignature = '';
		let failedRendererSignature: string | null = null;
		let failedRendererAttempts = 0;
		let nextRendererRetryAt = 0;
		let rendererRebuildPromise: Promise<void> | null = null;

		const runtimeUniforms: Record<string, UniformValue> = {};
		const runtimeTextures: TextureMap = {};
		let activeUniforms: Record<string, UniformValue> = {};
		let activeTextures: Record<string, { source?: TextureValue }> = {};
		let uniformKeys: string[] = [];
		let uniformKeySet = new Set<string>();
		let uniformTypes = new Map<string, UniformType>();
		let textureKeys: string[] = [];
		let textureKeySet = new Set<string>();
		let activeMaterialSignature = '';
		let currentCssWidth = -1;
		let currentCssHeight = -1;
		const renderUniforms: Record<string, UniformValue> = {};
		const renderTextures: TextureMap = {};
		const canvasSize = { width: 0, height: 0 };
		let shouldContinueAfterFrame = false;

		const scheduleFrame = (): void => {
			if (isDisposed || frameId !== null) {
				return;
			}

			frameId = requestAnimationFrame(renderFrame);
		};

		requestFrameSignal = scheduleFrame;

		const resetRuntimeMaps = (): void => {
			for (const key of Object.keys(runtimeUniforms)) {
				if (!uniformKeySet.has(key)) {
					Reflect.deleteProperty(runtimeUniforms, key);
				}
			}

			for (const key of Object.keys(runtimeTextures)) {
				if (!textureKeySet.has(key)) {
					Reflect.deleteProperty(runtimeTextures, key);
				}
			}
		};

		const resetRenderPayloadMaps = (): void => {
			for (const key of Object.keys(renderUniforms)) {
				if (!uniformKeySet.has(key)) {
					Reflect.deleteProperty(renderUniforms, key);
				}
			}

			for (const key of Object.keys(renderTextures)) {
				if (!textureKeySet.has(key)) {
					Reflect.deleteProperty(renderTextures, key);
				}
			}
		};

		const syncMaterialRuntimeState = (materialState: ReturnType<typeof resolveMaterial>): void => {
			const signatureChanged = activeMaterialSignature !== materialState.signature;
			const defaultsChanged =
				activeUniforms !== materialState.uniforms || activeTextures !== materialState.textures;

			if (!signatureChanged && !defaultsChanged) {
				return;
			}

			activeUniforms = materialState.uniforms;
			activeTextures = materialState.textures;
			if (!signatureChanged) {
				return;
			}

			uniformKeys = materialState.uniformLayout.entries.map((entry) => entry.name);
			uniformTypes = new Map(
				materialState.uniformLayout.entries.map((entry) => [entry.name, entry.type])
			);
			textureKeys = materialState.textureKeys;
			uniformKeySet = new Set(uniformKeys);
			textureKeySet = new Set(textureKeys);
			resetRuntimeMaps();
			resetRenderPayloadMaps();
			activeMaterialSignature = materialState.signature;
		};

		const resolveActiveMaterial = () => {
			return resolveMaterial(material);
		};

		const setUniform = (name: string, value: UniformValue): void => {
			if (!uniformKeySet.has(name)) {
				throw new Error(`Unknown uniform "${name}". Declare it in material.uniforms first.`);
			}
			const expectedType = uniformTypes.get(name);
			if (!expectedType) {
				throw new Error(`Unknown uniform type for "${name}"`);
			}
			assertUniformValueForType(expectedType, value);
			runtimeUniforms[name] = value;
		};

		const setTexture = (name: string, value: TextureValue): void => {
			if (!textureKeySet.has(name)) {
				throw new Error(`Unknown texture "${name}". Declare it in material.textures first.`);
			}
			runtimeTextures[name] = value;
		};

		const renderFrame = (timestamp: number): void => {
			frameId = null;
			if (isDisposed) {
				return;
			}

			let materialState: ReturnType<typeof resolveActiveMaterial>;
			try {
				materialState = resolveActiveMaterial();
			} catch (error) {
				setError(error, 'initialization');
				scheduleFrame();
				return;
			}

			shouldContinueAfterFrame = false;

			const rendererSignature = buildRendererPipelineSignature({
				materialSignature: materialState.signature,
				outputColorSpace
			});
			syncMaterialRuntimeState(materialState);

			if (failedRendererSignature && failedRendererSignature !== rendererSignature) {
				failedRendererSignature = null;
				failedRendererAttempts = 0;
				nextRendererRetryAt = 0;
			}

			if (!renderer || activeRendererSignature !== rendererSignature) {
				if (
					failedRendererSignature === rendererSignature &&
					performance.now() < nextRendererRetryAt
				) {
					scheduleFrame();
					return;
				}

				if (!rendererRebuildPromise) {
					rendererRebuildPromise = (async () => {
						try {
							const nextRenderer = await createRenderer({
								canvas: canvasElement,
								fragmentWgsl: materialState.fragmentWgsl,
								fragmentLineMap: materialState.fragmentLineMap,
								fragmentSource: materialState.fragmentSource,
								includeSources: materialState.includeSources,
								defineBlockSource: materialState.defineBlockSource,
								materialSource: materialState.source,
								uniformLayout: materialState.uniformLayout,
								textureKeys: materialState.textureKeys,
								textureDefinitions: materialState.textures,
								getRenderTargets: () => renderTargets,
								getPasses: () => passes,
								outputColorSpace,
								getClearColor: () => clearColor,
								getDpr: () => dprState.current,
								adapterOptions,
								deviceDescriptor
							});

							if (isDisposed) {
								nextRenderer.destroy();
								return;
							}

							renderer?.destroy();
							renderer = nextRenderer;
							activeRendererSignature = rendererSignature;
							failedRendererSignature = null;
							failedRendererAttempts = 0;
							nextRendererRetryAt = 0;
							clearError();
						} catch (error) {
							failedRendererSignature = rendererSignature;
							failedRendererAttempts += 1;
							const retryDelayMs = getRendererRetryDelayMs(failedRendererAttempts);
							nextRendererRetryAt = performance.now() + retryDelayMs;
							setError(error, 'initialization');
						} finally {
							rendererRebuildPromise = null;
							scheduleFrame();
						}
					})();
				}

				return;
			}

			const time = timestamp / 1000;
			const rawDelta = Math.max(0, time - previousTime);
			const delta = Math.min(rawDelta, maxDeltaState.current);
			previousTime = time;
			const rect = canvasElement.getBoundingClientRect();
			const width = Math.max(0, Math.floor(rect.width));
			const height = Math.max(0, Math.floor(rect.height));
			if (width !== currentCssWidth || height !== currentCssHeight) {
				currentCssWidth = width;
				currentCssHeight = height;
				size.set({ width, height });
			}

			try {
				registry.run({
					time,
					delta,
					setUniform,
					setTexture,
					invalidate: invalidateFrame,
					advance: advanceFrame,
					renderMode: registry.getRenderMode(),
					autoRender: registry.getAutoRender(),
					canvas: canvasElement
				});

				const shouldRenderFrame = registry.shouldRender();
				shouldContinueAfterFrame =
					registry.getRenderMode() === 'always' ||
					(registry.getRenderMode() === 'on-demand' && shouldRenderFrame);

				if (shouldRenderFrame) {
					for (const key of uniformKeys) {
						const runtimeValue = runtimeUniforms[key];
						renderUniforms[key] =
							runtimeValue === undefined ? (activeUniforms[key] as UniformValue) : runtimeValue;
					}

					for (const key of textureKeys) {
						const runtimeValue = runtimeTextures[key];
						renderTextures[key] =
							runtimeValue === undefined ? (activeTextures[key]?.source ?? null) : runtimeValue;
					}

					canvasSize.width = width;
					canvasSize.height = height;
					renderer.render({
						time,
						delta,
						renderMode: registry.getRenderMode(),
						uniforms: renderUniforms,
						textures: renderTextures,
						canvasSize
					});
				}

				clearError();
			} catch (error) {
				setError(error, 'render');
			} finally {
				registry.endFrame();
			}

			if (shouldContinueAfterFrame) {
				scheduleFrame();
			}
		};

		(async () => {
			try {
				const initialMaterial = resolveActiveMaterial();
				syncMaterialRuntimeState(initialMaterial);
				activeRendererSignature = '';
				scheduleFrame();
			} catch (error) {
				setError(error, 'initialization');
				scheduleFrame();
			}
		})();

		return () => {
			isDisposed = true;
			requestFrameSignal = null;
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
				frameId = null;
			}
			renderer?.destroy();
			registry.clear();
		};
	});
</script>

<div class="motiongpu-canvas-wrap">
	<canvas use:bindCanvas class={className} {style}></canvas>
	{#if showErrorOverlay && errorReport}
		{#if errorRenderer}
			{@render errorRenderer(errorReport)}
		{:else}
			<MotionGPUErrorOverlay report={errorReport} />
		{/if}
	{/if}
	{@render children?.()}
</div>

<style>
	.motiongpu-canvas-wrap {
		position: relative;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
	}

	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
