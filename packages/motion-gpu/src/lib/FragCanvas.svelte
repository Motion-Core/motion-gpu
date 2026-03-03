<script lang="ts">
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import { resolveMaterial, type FragMaterial } from './core/material';
	import {
		toMotionGPUErrorReport,
		type MotionGPUErrorPhase,
		type MotionGPUErrorReport
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
		onError = undefined,
		class: className = '',
		style = '',
		children
	}: Props = $props();

	let canvas: HTMLCanvasElement | undefined;
	let errorReport = $state<MotionGPUErrorReport | null>(null);

	const normalizeErrorText = (value: string): string => {
		return value
			.trim()
			.replace(/[.:!]+$/g, '')
			.toLowerCase();
	};

	const shouldShowErrorMessage = (report: MotionGPUErrorReport): boolean => {
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
								fragmentSource: materialState.fragmentSource,
								includeSources: materialState.includeSources,
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
			const rect = canvasElement.getBoundingClientRect();
			const width = Math.max(0, Math.floor(rect.width));
			const height = Math.max(0, Math.floor(rect.height));
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
				frameId = requestAnimationFrame(renderFrame);
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

<div class="motiongpu-canvas-wrap">
	<canvas bind:this={canvas} class={className} {style}></canvas>
	{#if showErrorOverlay && errorReport}
		<Portal>
			<div class="motiongpu-error-overlay" role="presentation">
				<section
					class="motiongpu-error-dialog"
					role="alertdialog"
					aria-live="assertive"
					aria-modal="true"
					data-testid="motiongpu-error"
				>
					<header class="motiongpu-error-header">
						<p class="motiongpu-error-phase">
							{errorReport.phase}
						</p>
						<h2 class="motiongpu-error-title">{errorReport.title}</h2>
					</header>
					<div class="motiongpu-error-body">
						{#if shouldShowErrorMessage(errorReport)}
							<p class="motiongpu-error-message">{errorReport.message}</p>
						{/if}
						<p class="motiongpu-error-hint">{errorReport.hint}</p>
					</div>

					{#if errorReport.source}
						<section class="motiongpu-error-source" aria-label="Source">
							<h3 class="motiongpu-error-source-title">Source</h3>
							<div class="motiongpu-error-source-frame" role="presentation">
								<div class="motiongpu-error-source-tabs" role="tablist" aria-label="Source files">
									<span
										class="motiongpu-error-source-tab motiongpu-error-source-tab-active"
										role="tab"
										aria-selected="true"
										>{errorReport.source.component} (fragment line {errorReport.source
											.line}{#if errorReport.source.column}, col {errorReport.source
												.column}{/if})</span
									>
									<span class="motiongpu-error-source-tab-spacer" aria-hidden="true"></span>
								</div>

								<div class="motiongpu-error-source-snippet">
									{#each errorReport.source.snippet as snippetLine (`snippet-${snippetLine.number}`)}
										<div
											class="motiongpu-error-source-row"
											class:motiongpu-error-source-row-active={snippetLine.highlight}
										>
											<span class="motiongpu-error-source-line">{snippetLine.number}</span>
											<span class="motiongpu-error-source-code">{snippetLine.code || ' '}</span>
										</div>
									{/each}
								</div>
							</div>
						</section>
					{/if}

					<div class="motiongpu-error-sections">
						{#if errorReport.details.length > 0}
							<details class="motiongpu-error-details" open>
								<summary
									>{errorReport.source ? 'Additional diagnostics' : 'Technical details'}</summary
								>
								<pre>{errorReport.details.join('\n')}</pre>
							</details>
						{/if}
						{#if errorReport.stack.length > 0}
							<details class="motiongpu-error-details">
								<summary>Stack trace</summary>
								<pre>{errorReport.stack.join('\n')}</pre>
							</details>
						{/if}
					</div>
				</section>
			</div>
		</Portal>
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

	.motiongpu-error-overlay {
		--motiongpu-color-background: #f4f4f4;
		--motiongpu-color-background-muted: #fff;
		--motiongpu-color-foreground: #262626;
		--motiongpu-color-foreground-muted: #747474;
		--motiongpu-color-card: #f4f4f4;
		--motiongpu-color-accent: #ff6900;
		--motiongpu-color-border: rgba(107, 107, 107, 0.15);
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		padding: 1rem;
		background: rgba(24, 24, 24, 0.42);
		backdrop-filter: blur(12px);
		z-index: 2147483647;
	}

	.motiongpu-error-dialog {
		width: min(48rem, calc(100vw - 2rem));
		max-height: min(84vh, 44rem);
		overflow: auto;
		margin: 0;
		padding: 1rem;
		border: 1px solid var(--motiongpu-color-border);
		max-width: calc(100vw - 2rem);
		box-sizing: border-box;
		font-size: 0.875rem;
		font-weight: 400;
		line-height: 1.45;
		background: var(--motiongpu-color-card);
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-header {
		display: grid;
		gap: 0.45rem;
		padding-bottom: 0.7rem;
		border-bottom: 1px solid var(--motiongpu-color-border);
	}

	.motiongpu-error-phase {
		display: inline-flex;
		align-items: center;
		margin: 0;
		font-size: 0.67rem;
		letter-spacing: 0.025em;
		line-height: 1;
		font-weight: 400;
		text-transform: uppercase;
		color: var(--motiongpu-color-foreground-muted);
	}

	.motiongpu-error-title {
		margin: 0;
		font-size: 1.12rem;
		font-weight: 400;
		line-height: 1.2;
		letter-spacing: -0.02em;
		text-wrap: balance;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-body {
		display: grid;
		gap: 0.55rem;
		margin-top: 0.82rem;
	}

	.motiongpu-error-message {
		margin: 0;
		padding: 0.6rem 0.68rem;
		border: 1px solid rgba(255, 105, 0, 0.22);
		background: rgba(255, 105, 0, 0.1);
		font-size: 0.81rem;
		line-height: 1.4;
		font-weight: 400;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-hint {
		margin: 0;
		font-size: 0.81rem;
		line-height: 1.45;
		font-weight: 400;
		color: var(--motiongpu-color-foreground-muted);
	}

	.motiongpu-error-sections {
		display: grid;
		gap: 0.7rem;
		margin-top: 0.85rem;
	}

	.motiongpu-error-source {
		display: grid;
		gap: 0.4rem;
		margin-top: 0.9rem;
	}

	.motiongpu-error-source-title {
		margin: 0;
		font-size: 0.86rem;
		font-weight: 400;
		line-height: 1.3;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-source-frame {
		border: 1px solid var(--motiongpu-color-border);
		background: var(--motiongpu-color-background-muted);
	}

	.motiongpu-error-source-tabs {
		display: flex;
		align-items: stretch;
		border-bottom: 1px solid var(--motiongpu-color-border);
		background: var(--motiongpu-color-background);
	}

	.motiongpu-error-source-tab {
		display: inline-flex;
		align-items: center;
		padding: 0.52rem 0.7rem;
		font-size: 0.76rem;
		font-weight: 400;
		line-height: 1.2;
		color: var(--motiongpu-color-foreground-muted);
		border-right: 1px solid var(--motiongpu-color-border);
	}

	.motiongpu-error-source-tab-active {
		color: var(--motiongpu-color-foreground);
		background: var(--motiongpu-color-background-muted);
	}

	.motiongpu-error-source-tab-spacer {
		flex: 1 1 auto;
	}

	.motiongpu-error-source-snippet {
		display: grid;
		background: var(--motiongpu-color-background-muted);
	}

	.motiongpu-error-source-row {
		display: grid;
		grid-template-columns: 1.5rem minmax(0, 1fr);
		align-items: start;
		gap: 0.35rem;
		padding: 0.17rem 0.62rem;
	}

	.motiongpu-error-source-row-active {
		background: rgba(255, 105, 0, 0.1);
	}

	.motiongpu-error-source-line {
		font-size: 0.77rem;
		font-weight: 400;
		line-height: 1.3;
		border-right: 1px solid var(--motiongpu-color-border);
		color: var(--motiongpu-color-foreground-muted);
		text-align: left;
	}

	.motiongpu-error-source-code {
		font-size: 0.77rem;
		font-weight: 400;
		line-height: 1.3;
		color: var(--motiongpu-color-foreground);
		white-space: pre-wrap;
		word-break: break-word;
	}

	.motiongpu-error-details {
		border: 1px solid var(--motiongpu-color-border);
		background: var(--motiongpu-color-background);
	}

	.motiongpu-error-details summary {
		cursor: pointer;
		padding: 0.56rem 0.68rem;
		font-size: 0.72rem;
		letter-spacing: 0.045em;
		line-height: 1.2;
		font-weight: 400;
		text-transform: uppercase;
		color: var(--motiongpu-color-foreground);
	}

	.motiongpu-error-details[open] summary {
		border-bottom: 1px solid var(--motiongpu-color-border);
	}

	.motiongpu-error-details pre {
		margin: 0;
		padding: 0.62rem 0.68rem;
		white-space: pre-wrap;
		word-break: break-word;
		overflow: auto;
		background: var(--motiongpu-color-background-muted);
		font-size: 0.74rem;
		line-height: 1.4;
		font-weight: 400;
		color: var(--motiongpu-color-foreground);
		font-family: inherit;
	}

	@media (max-width: 42rem) {
		.motiongpu-error-overlay {
			padding: 0.75rem;
		}

		.motiongpu-error-dialog {
			padding: 0.8rem;
		}

		.motiongpu-error-title {
			font-size: 1rem;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.motiongpu-error-overlay {
			backdrop-filter: none;
		}
	}
</style>
