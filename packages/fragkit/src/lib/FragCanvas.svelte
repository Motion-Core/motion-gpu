<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { resolveMaterial, type FragMaterial } from './core/material';
	import {
		toFragkitErrorReport,
		type FragkitErrorPhase,
		type FragkitErrorReport
	} from './core/error-report';
	import Portal from './Portal.svelte';
	import { currentWritable } from './current-writable';
	import { createRenderer } from './core/renderer';
	import { buildRendererPipelineSignature } from './core/recompile-policy';
	import type {
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
	import { provideFragkitContext } from './fragkit-context';
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
		onError?: (report: FragkitErrorReport) => void;
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
		onError = undefined,
		class: className = '',
		style = '',
		children
	}: Props = $props();

	let canvas: HTMLCanvasElement | undefined;
	let errorReport = $state<FragkitErrorReport | null>(null);

	const normalizeErrorText = (value: string): string => {
		return value
			.trim()
			.replace(/[.:!]+$/g, '')
			.toLowerCase();
	};

	const shouldShowErrorMessage = (report: FragkitErrorReport): boolean => {
		return normalizeErrorText(report.message) !== normalizeErrorText(report.title);
	};

	const getRendererRetryDelayMs = (attempt: number): number => {
		return Math.min(8000, 250 * 2 ** Math.max(0, attempt - 1));
	};

	const registry = createFrameRegistry({ maxDelta: 0.1 });
	provideFrameRegistry(registry);
	const size = currentWritable({ width: 0, height: 0 });
	const dprState = currentWritable(initialDpr);
	const maxDeltaState = currentWritable<number>(0.1, registry.setMaxDelta);
	const renderModeState = currentWritable<RenderMode>('always', registry.setRenderMode);
	const autoRenderState = currentWritable<boolean>(true, registry.setAutoRender);
	const userState = currentWritable<Record<string | symbol, unknown>>({});

	provideFragkitContext({
		get canvas() {
			return canvas;
		},
		size,
		dpr: dprState,
		maxDelta: maxDeltaState,
		renderMode: renderModeState,
		autoRender: autoRenderState,
		user: userState,
		invalidate: registry.invalidate,
		advance: registry.advance,
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
	});

	$effect(() => {
		autoRenderState.set(autoRender);
	});

	$effect(() => {
		maxDeltaState.set(maxDelta);
	});

	$effect(() => {
		dprState.set(dpr);
	});

	onMount(() => {
		const setError = (error: unknown, phase: FragkitErrorPhase): void => {
			const report = toFragkitErrorReport(error, phase);
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
		let frameId = 0;
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
			if (isDisposed) {
				return;
			}

			let materialState: ReturnType<typeof resolveActiveMaterial>;
			try {
				materialState = resolveActiveMaterial();
			} catch (error) {
				setError(error, 'initialization');
				frameId = requestAnimationFrame(renderFrame);
				return;
			}

			const rendererSignature = buildRendererPipelineSignature({
				materialSignature: materialState.signature,
				outputColorSpace
			});
			activeUniforms = materialState.uniforms;
			activeTextures = materialState.textures;
			uniformKeys = materialState.uniformLayout.entries.map((entry) => entry.name);
			uniformTypes = new Map(
				materialState.uniformLayout.entries.map((entry) => [entry.name, entry.type])
			);
			textureKeys = materialState.textureKeys;
			uniformKeySet = new Set(uniformKeys);
			textureKeySet = new Set(textureKeys);
			resetRuntimeMaps();

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
					frameId = requestAnimationFrame(renderFrame);
					return;
				}

				if (!rendererRebuildPromise) {
					rendererRebuildPromise = (async () => {
						try {
							const nextRenderer = await createRenderer({
								canvas: canvasElement,
								fragmentWgsl: materialState.fragmentWgsl,
								fragmentLineMap: materialState.fragmentLineMap,
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
							nextRendererRetryAt =
								performance.now() + getRendererRetryDelayMs(failedRendererAttempts);
							setError(error, 'initialization');
						} finally {
							rendererRebuildPromise = null;
						}
					})();
				}

				frameId = requestAnimationFrame(renderFrame);
				return;
			}

			const time = timestamp / 1000;
			const rawDelta = Math.max(0, time - previousTime);
			const delta = Math.min(rawDelta, maxDeltaState.current);
			previousTime = time;
			const width = canvasElement.clientWidth || canvasElement.width;
			const height = canvasElement.clientHeight || canvasElement.height;
			size.set({ width, height });

			try {
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
						renderMode: registry.getRenderMode(),
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

				clearError();
			} catch (error) {
				setError(error, 'render');
			} finally {
				registry.endFrame();
			}

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
				uniformKeySet = new Set(uniformKeys);
				textureKeySet = new Set(textureKeys);
				activeRendererSignature = '';
				frameId = requestAnimationFrame(renderFrame);
			} catch (error) {
				setError(error, 'initialization');
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
	{#if showErrorOverlay && errorReport}
		<Portal>
			<div class="fragkit-error-overlay" role="presentation">
				<div
					class="fragkit-error-dialog"
					role="alertdialog"
					aria-live="assertive"
					aria-modal="true"
					data-testid="fragkit-error"
				>
					<p class="fragkit-error-phase">{errorReport.phase}</p>
					<p class="fragkit-error-title">{errorReport.title}</p>
					{#if shouldShowErrorMessage(errorReport)}
						<p class="fragkit-error-message">{errorReport.message}</p>
					{/if}
					<p class="fragkit-error-hint">{errorReport.hint}</p>
					{#if errorReport.details.length > 0}
						<details class="fragkit-error-details" open>
							<summary>Technical details</summary>
							<pre>{errorReport.details.join('\n')}</pre>
						</details>
					{/if}
					{#if errorReport.stack.length > 0}
						<details class="fragkit-error-details">
							<summary>Stack trace</summary>
							<pre>{errorReport.stack.join('\n')}</pre>
						</details>
					{/if}
				</div>
			</div>
		</Portal>
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

	.fragkit-error-overlay {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(0, 0, 0, 0.9);
		backdrop-filter: blur(10px);
		z-index: 2147483647;
	}

	.fragkit-error-dialog {
		width: min(48rem, 100%);
		max-height: min(80vh, 44rem);
		overflow: auto;
		margin: 0;
		padding: 1rem 1.1rem;
		border-radius: 0.85rem;
		border: 1px solid rgba(255, 255, 255, 0.14);
		font-size: 0.84rem;
		line-height: 1.4;
		background: rgba(12, 12, 12, 0.97);
		color: #f2f2f2;
	}

	.fragkit-error-phase {
		margin: 0;
		font-size: 0.66rem;
		text-transform: uppercase;
		color: #b8b8b8;
	}

	.fragkit-error-title {
		margin: 0.3rem 0 0;
		font-size: 1rem;
		font-weight: 600;
		color: #f3f3f3;
	}

	.fragkit-error-message {
		margin: 0.45rem 0 0;
		font-weight: 500;
		color: #ff6b6b;
	}

	.fragkit-error-hint {
		margin: 0.55rem 0 0;
		color: #d4d4d4;
	}

	.fragkit-error-details {
		margin-top: 0.7rem;
		padding-top: 0.65rem;
		border-top: 1px solid rgba(255, 255, 255, 0.12);
	}

	.fragkit-error-details summary {
		cursor: pointer;
		font-weight: 600;
		color: #e5e5e5;
	}

	.fragkit-error-details pre {
		margin: 0.45rem 0 0;
		white-space: pre-wrap;
		word-break: break-word;
		font-size: 0.75rem;
		line-height: 1.4;
		color: #cccccc;
		font-family:
			ui-monospace,
			SFMono-Regular,
			Menlo,
			Monaco,
			Consolas,
			Liberation Mono,
			Courier New,
			monospace;
	}
</style>
