import type { CurrentReadable, CurrentWritable } from './current-value.js';
import { resolveMaterial, type FragMaterial, type ResolvedMaterial } from './material.js';
import {
	toMotionGPUErrorReport,
	type MotionGPUErrorPhase,
	type MotionGPUErrorReport
} from './error-report.js';
import { createRenderer } from './renderer.js';
import { buildRendererPipelineSignature } from './recompile-policy.js';
import { assertUniformValueForType } from './uniforms.js';
import type { FrameRegistry } from './frame-registry.js';
import type {
	FrameInvalidationToken,
	OutputColorSpace,
	RenderPass,
	Renderer,
	RenderTargetDefinitionMap,
	TextureMap,
	TextureValue,
	UniformType,
	UniformValue
} from './types.js';

export interface MotionGPURuntimeLoopOptions {
	canvas: HTMLCanvasElement;
	registry: FrameRegistry;
	size: CurrentWritable<{ width: number; height: number }>;
	dpr: CurrentReadable<number>;
	maxDelta: CurrentReadable<number>;
	getMaterial: () => FragMaterial;
	getRenderTargets: () => RenderTargetDefinitionMap;
	getPasses: () => RenderPass[];
	getClearColor: () => [number, number, number, number];
	getOutputColorSpace: () => OutputColorSpace;
	getAdapterOptions: () => GPURequestAdapterOptions | undefined;
	getDeviceDescriptor: () => GPUDeviceDescriptor | undefined;
	getOnError: () => ((report: MotionGPUErrorReport) => void) | undefined;
	reportError: (report: MotionGPUErrorReport | null) => void;
	getErrorHistoryLimit?: () => number | undefined;
	getOnErrorHistory?: () => ((history: MotionGPUErrorReport[]) => void) | undefined;
	reportErrorHistory?: (history: MotionGPUErrorReport[]) => void;
}

export interface MotionGPURuntimeLoop {
	requestFrame: () => void;
	invalidate: (token?: FrameInvalidationToken) => void;
	advance: () => void;
	destroy: () => void;
}

function getRendererRetryDelayMs(attempt: number): number {
	return Math.min(8000, 250 * 2 ** Math.max(0, attempt - 1));
}

export function createMotionGPURuntimeLoop(
	options: MotionGPURuntimeLoopOptions
): MotionGPURuntimeLoop {
	const { canvas: canvasElement, registry, size } = options;
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
	let activeErrorKey: string | null = null;
	let errorHistory: MotionGPUErrorReport[] = [];

	const getHistoryLimit = (): number => {
		const value = options.getErrorHistoryLimit?.() ?? 0;
		if (!Number.isFinite(value) || value <= 0) {
			return 0;
		}

		return Math.floor(value);
	};

	const publishErrorHistory = (): void => {
		options.reportErrorHistory?.(errorHistory);
		const onErrorHistory = options.getOnErrorHistory?.();
		if (!onErrorHistory) {
			return;
		}

		try {
			onErrorHistory(errorHistory);
		} catch {
			// User-provided error history handlers must not break runtime error recovery.
		}
	};

	const syncErrorHistory = (): void => {
		const limit = getHistoryLimit();
		if (limit <= 0) {
			if (errorHistory.length === 0) {
				return;
			}
			errorHistory = [];
			publishErrorHistory();
			return;
		}

		if (errorHistory.length <= limit) {
			return;
		}

		errorHistory = errorHistory.slice(errorHistory.length - limit);
		publishErrorHistory();
	};

	const setError = (error: unknown, phase: MotionGPUErrorPhase): void => {
		const report = toMotionGPUErrorReport(error, phase);
		const reportKey = JSON.stringify({
			phase: report.phase,
			title: report.title,
			message: report.message,
			rawMessage: report.rawMessage
		});
		if (activeErrorKey === reportKey) {
			return;
		}
		activeErrorKey = reportKey;
		const historyLimit = getHistoryLimit();
		if (historyLimit > 0) {
			errorHistory = [...errorHistory, report];
			if (errorHistory.length > historyLimit) {
				errorHistory = errorHistory.slice(errorHistory.length - historyLimit);
			}
			publishErrorHistory();
		}
		options.reportError(report);
		const onError = options.getOnError();
		if (!onError) {
			return;
		}

		try {
			onError(report);
		} catch {
			// User-provided error handlers must not break runtime error recovery.
		}
	};

	const clearError = (): void => {
		if (activeErrorKey === null) {
			return;
		}

		activeErrorKey = null;
		options.reportError(null);
	};

	const scheduleFrame = (): void => {
		if (isDisposed || frameId !== null) {
			return;
		}

		frameId = requestAnimationFrame(renderFrame);
	};

	const requestFrame = (): void => {
		scheduleFrame();
	};

	const invalidate = (token?: FrameInvalidationToken): void => {
		registry.invalidate(token);
		requestFrame();
	};

	const advance = (): void => {
		registry.advance();
		requestFrame();
	};

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

	const syncMaterialRuntimeState = (materialState: ResolvedMaterial): void => {
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

	const resolveActiveMaterial = (): ResolvedMaterial => {
		return resolveMaterial(options.getMaterial());
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
		syncErrorHistory();

		let materialState: ResolvedMaterial;
		try {
			materialState = resolveActiveMaterial();
		} catch (error) {
			setError(error, 'initialization');
			scheduleFrame();
			return;
		}

		shouldContinueAfterFrame = false;

		const outputColorSpace = options.getOutputColorSpace();
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
							materialSignature: materialState.signature,
							uniformLayout: materialState.uniformLayout,
							textureKeys: materialState.textureKeys,
							textureDefinitions: materialState.textures,
							getRenderTargets: options.getRenderTargets,
							getPasses: options.getPasses,
							outputColorSpace,
							getClearColor: options.getClearColor,
							getDpr: () => options.dpr.current,
							adapterOptions: options.getAdapterOptions(),
							deviceDescriptor: options.getDeviceDescriptor()
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
		const delta = Math.min(rawDelta, options.maxDelta.current);
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
				invalidate,
				advance,
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

	return {
		requestFrame,
		invalidate,
		advance,
		destroy: () => {
			isDisposed = true;
			if (frameId !== null) {
				cancelAnimationFrame(frameId);
				frameId = null;
			}
			renderer?.destroy();
			registry.clear();
		}
	};
}
