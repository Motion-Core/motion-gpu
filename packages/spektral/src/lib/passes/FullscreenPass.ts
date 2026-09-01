import type {
	RenderPass,
	RenderPassContext,
	RenderPassFlags,
	RenderPassInputSlot,
	RenderPassOutputSlot
} from '../core/types.js';
import { resolveTextureSamplingLayout } from '../core/textures.js';
import {
	assertFloatRenderableFormat,
	assertFloatSampledFormat
} from '../core/format-capabilities.js';
import {
	awaitRenderPipelineDiagnostics,
	toShaderPipelineDiagnosticError,
	type ShaderPipelineDiagnosticSource
} from '../core/pipeline-diagnostics.js';
import type { ShaderLineMap } from '../core/shader.js';
import {
	builtInRenderPassBrand,
	isFullscreenPassPrepared,
	preparedFullscreenPassBrand,
	prepareFullscreenPass,
	releaseFullscreenPass,
	type BuiltInRenderPassFormatContract,
	type FullscreenPassPreparation
} from '../core/pass-brand.js';

export interface FullscreenPassOptions extends RenderPassFlags {
	label?: string;
	enabled?: boolean;
	needsSwap?: boolean;
	input?: RenderPassInputSlot;
	output?: RenderPassOutputSlot;
	filter?: GPUFilterMode;
}

export interface FullscreenShaderProgram {
	readonly code: string;
	readonly lineMap: ShaderLineMap;
	/** User-authored fragment only. Generated wrapper WGSL is deliberately not retained here. */
	readonly fragmentSource: string;
}

interface PreparationDescriptor {
	inputFormat: GPUTextureFormat;
	outputFormat: GPUTextureFormat;
	samplingLayoutKey: string;
	pipelineKey: string;
	sampleType: GPUTextureSampleType;
	samplerType: GPUSamplerBindingType;
	effectiveFilter: GPUFilterMode;
}

interface SamplingResources {
	sampler: GPUSampler;
	bindGroupLayout: GPUBindGroupLayout;
	bindGroupByView: WeakMap<GPUTextureView, GPUBindGroup>;
}

interface ProgramResources {
	module: GPUShaderModule;
	compilationInfo: Promise<GPUCompilationInfo>;
}

interface PreparedPipeline {
	version: number;
	pipeline: GPURenderPipeline;
}

interface PreparationRequest {
	id: number;
	version: number;
	promise: Promise<void>;
}

interface DevicePreparationState {
	generation: number;
	ownerPipelineKeys: Map<object, Set<string>>;
	ownerCallbacks: Map<
		object,
		{
			reportRecoverableError?: (error: Error) => void;
			requestRender?: () => void;
		}
	>;
	descriptors: Map<string, PreparationDescriptor>;
	samplingResources: Map<string, SamplingResources>;
	programResources: Map<number, ProgramResources>;
	preparedPipelines: Map<string, PreparedPipeline>;
	pendingRequests: Map<string, PreparationRequest>;
	latestRequestId: Map<string, number>;
	latestFailure: Map<string, { id: number; version: number; error: unknown }>;
}

/** Shared base for fullscreen texture sampling passes. */
export abstract class FullscreenPass implements RenderPass {
	readonly [builtInRenderPassBrand]: BuiltInRenderPassFormatContract;
	readonly [preparedFullscreenPassBrand] = true as const;
	readonly label?: string;
	enabled: boolean;
	needsSwap: boolean;
	input: RenderPassInputSlot;
	output: RenderPassOutputSlot;
	clear: boolean;
	clearColor: [number, number, number, number];
	preserve: boolean;
	private readonly filter: GPUFilterMode;
	private readonly deviceStates = new Map<GPUDevice, DevicePreparationState>();
	private readonly ownerDevices = new Map<object, GPUDevice>();
	private programVersion = 0;
	private nextRequestId = 0;
	private nextStateGeneration = 0;
	private lifecycleGeneration = 0;

	protected constructor(passName: string, options: FullscreenPassOptions = {}) {
		this[builtInRenderPassBrand] = Object.freeze({
			passName,
			input: 'float-sampled',
			output: 'float-renderable'
		});
		if (options.label !== undefined) this.label = options.label;
		this.enabled = options.enabled ?? true;
		this.needsSwap = options.needsSwap ?? true;
		this.input = options.input ?? 'source';
		this.output = options.output ?? (this.needsSwap ? 'target' : 'source');
		this.clear = options.clear ?? false;
		this.clearColor = options.clearColor ?? [0, 0, 0, 1];
		this.preserve = options.preserve ?? true;
		this.filter = options.filter ?? 'linear';
	}

	protected abstract getProgram(): FullscreenShaderProgram;
	protected abstract getVertexEntryPoint(): string;
	protected abstract getFragmentEntryPoint(): string;
	protected getDiagnosticPassKind(): string {
		return this[builtInRenderPassBrand].passName;
	}

	/** Starts background preparation for a new program while retaining the last-known-good pipeline. */
	protected invalidateFullscreenCache(): void {
		this.programVersion += 1;
		const version = this.programVersion;
		const program = this.getProgram();
		for (const [device, state] of this.deviceStates) {
			for (const descriptor of state.descriptors.values()) {
				if (!this.hasOwnersForPipeline(state, descriptor.pipelineKey)) continue;
				const request = this.startPreparation(device, state, descriptor, version, program);
				void request.promise.catch(() => {
					// A hot-edit failure is recoverable: retain last-known-good and wait for a retry/edit.
				});
			}
		}
	}

	private resolveDescriptor(
		device: GPUDevice,
		inputFormat: GPUTextureFormat,
		outputFormat: GPUTextureFormat
	): PreparationDescriptor {
		const passName = this[builtInRenderPassBrand].passName;
		assertFloatSampledFormat({
			format: inputFormat,
			target: String(this.input),
			pass: passName,
			deviceFeatures: device.features
		});
		assertFloatRenderableFormat({
			format: outputFormat,
			target: String(this.output),
			pass: passName,
			deviceFeatures: device.features
		});
		const samplingLayout = resolveTextureSamplingLayout({
			format: inputFormat,
			filter: this.filter,
			deviceFeatures: device.features
		});
		const samplingLayoutKey = [
			inputFormat,
			samplingLayout.sampleType,
			samplingLayout.samplerType,
			samplingLayout.effectiveFilter
		].join('|');
		return {
			inputFormat,
			outputFormat,
			samplingLayoutKey,
			pipelineKey: `${outputFormat}|${samplingLayoutKey}`,
			sampleType: samplingLayout.sampleType,
			samplerType: samplingLayout.samplerType,
			effectiveFilter: samplingLayout.effectiveFilter
		};
	}

	private getOrCreateDeviceState(device: GPUDevice): DevicePreparationState {
		let state = this.deviceStates.get(device);
		if (!state) {
			state = {
				generation: ++this.nextStateGeneration,
				ownerPipelineKeys: new Map(),
				ownerCallbacks: new Map(),
				descriptors: new Map(),
				samplingResources: new Map(),
				programResources: new Map(),
				preparedPipelines: new Map(),
				pendingRequests: new Map(),
				latestRequestId: new Map(),
				latestFailure: new Map()
			};
			this.deviceStates.set(device, state);
		}
		return state;
	}

	private getOrCreateSamplingResources(
		device: GPUDevice,
		state: DevicePreparationState,
		descriptor: PreparationDescriptor
	): SamplingResources {
		let resources = state.samplingResources.get(descriptor.samplingLayoutKey);
		if (!resources) {
			const sampler = device.createSampler({
				magFilter: descriptor.effectiveFilter,
				minFilter: descriptor.effectiveFilter,
				addressModeU: 'clamp-to-edge',
				addressModeV: 'clamp-to-edge'
			});
			const bindGroupLayout = device.createBindGroupLayout({
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.FRAGMENT,
						sampler: { type: descriptor.samplerType }
					},
					{
						binding: 1,
						visibility: GPUShaderStage.FRAGMENT,
						texture: {
							sampleType: descriptor.sampleType,
							viewDimension: '2d',
							multisampled: false
						}
					}
				]
			});
			resources = { sampler, bindGroupLayout, bindGroupByView: new WeakMap() };
			state.samplingResources.set(descriptor.samplingLayoutKey, resources);
		}
		return resources;
	}

	private getOrCreateProgramResources(
		device: GPUDevice,
		state: DevicePreparationState,
		version: number,
		program: FullscreenShaderProgram
	): ProgramResources {
		let resources = state.programResources.get(version);
		if (!resources) {
			const module = device.createShaderModule({ code: program.code });
			resources = { module, compilationInfo: module.getCompilationInfo() };
			state.programResources.set(version, resources);
		}
		return resources;
	}

	private startPreparation(
		device: GPUDevice,
		state: DevicePreparationState,
		descriptor: PreparationDescriptor,
		version: number,
		program: FullscreenShaderProgram
	): PreparationRequest {
		const existing = state.pendingRequests.get(descriptor.pipelineKey);
		if (existing?.version === version) return existing;

		const id = ++this.nextRequestId;
		const stateGeneration = state.generation;
		const lifecycleGeneration = this.lifecycleGeneration;
		const hadLastKnownGood = state.preparedPipelines.has(descriptor.pipelineKey);
		const isRecovery = state.latestFailure.has(descriptor.pipelineKey);
		state.latestRequestId.set(descriptor.pipelineKey, id);
		state.latestFailure.delete(descriptor.pipelineKey);
		const diagnosticSource: ShaderPipelineDiagnosticSource = {
			lineMap: program.lineMap,
			fragmentSource: program.fragmentSource,
			pipeline: {
				passKind: this.getDiagnosticPassKind(),
				...(this.label !== undefined ? { passLabel: this.label } : {}),
				inputFormat: descriptor.inputFormat,
				outputFormat: descriptor.outputFormat
			}
		};
		const errorPrefix = `WGSL compilation failed in ${this.getDiagnosticPassKind()}`;
		let pipelineAttempt: Promise<GPURenderPipeline>;
		let errorScopePushed = false;
		try {
			device.pushErrorScope('validation');
			errorScopePushed = true;
			const sampling = this.getOrCreateSamplingResources(device, state, descriptor);
			const programResources = this.getOrCreateProgramResources(device, state, version, program);
			const pipelineLayout = device.createPipelineLayout({
				bindGroupLayouts: [sampling.bindGroupLayout]
			});
			let pipelinePromise: Promise<GPURenderPipeline>;
			try {
				pipelinePromise = device.createRenderPipelineAsync({
					layout: pipelineLayout,
					vertex: {
						module: programResources.module,
						entryPoint: this.getVertexEntryPoint()
					},
					fragment: {
						module: programResources.module,
						entryPoint: this.getFragmentEntryPoint(),
						targets: [{ format: descriptor.outputFormat }]
					},
					primitive: { topology: 'triangle-list' }
				});
			} catch (error) {
				pipelinePromise = Promise.reject(error);
			}
			const validationScope = device.popErrorScope();
			errorScopePushed = false;
			pipelineAttempt = awaitRenderPipelineDiagnostics({
				...diagnosticSource,
				compilationInfo: programResources.compilationInfo,
				pipelinePromise,
				validationScope,
				errorPrefix,
				shaderStage: 'fragment'
			});
		} catch (error) {
			if (errorScopePushed) {
				void device.popErrorScope().catch(() => undefined);
			}
			pipelineAttempt = Promise.reject(
				toShaderPipelineDiagnosticError({
					error,
					source: diagnosticSource,
					errorPrefix,
					shaderStage: 'fragment'
				})
			);
		}
		const promise = pipelineAttempt
			.then((pipeline) => {
				if (
					this.lifecycleGeneration !== lifecycleGeneration ||
					this.deviceStates.get(device) !== state ||
					state.generation !== stateGeneration ||
					state.latestRequestId.get(descriptor.pipelineKey) !== id ||
					this.programVersion !== version ||
					!this.hasOwnersForPipeline(state, descriptor.pipelineKey)
				) {
					return;
				}
				state.preparedPipelines.set(descriptor.pipelineKey, { version, pipeline });
				if (hadLastKnownGood || isRecovery) {
					this.notifyOwners(state, descriptor.pipelineKey, 'requestRender');
				}
			})
			.catch((error: unknown) => {
				const normalizedError =
					error instanceof Error ? error : new Error(String(error ?? 'Unknown WebGPU error'));
				const isCurrentLifecycle =
					this.lifecycleGeneration === lifecycleGeneration &&
					this.deviceStates.get(device) === state &&
					state.latestRequestId.get(descriptor.pipelineKey) === id &&
					this.programVersion === version &&
					this.hasOwnersForPipeline(state, descriptor.pipelineKey);
				if (isCurrentLifecycle) {
					state.latestFailure.set(descriptor.pipelineKey, {
						id,
						version,
						error: normalizedError
					});
					if (hadLastKnownGood || isRecovery) {
						this.notifyOwners(
							state,
							descriptor.pipelineKey,
							'reportRecoverableError',
							normalizedError
						);
					}
					throw normalizedError;
				}
				// The request belonged to an owner/device/program generation that was
				// released or superseded. Its late rejection is lifecycle completion,
				// not an error observable by the stale caller.
			})
			.finally(() => {
				if (state.pendingRequests.get(descriptor.pipelineKey)?.id === id) {
					state.pendingRequests.delete(descriptor.pipelineKey);
				}
				this.pruneProgramResources(state);
			});
		const request = { id, version, promise };
		state.pendingRequests.set(descriptor.pipelineKey, request);
		return request;
	}

	private hasOwnersForPipeline(state: DevicePreparationState, pipelineKey: string): boolean {
		for (const keys of state.ownerPipelineKeys.values()) {
			if (keys.has(pipelineKey)) return true;
		}
		return false;
	}

	private notifyOwners(
		state: DevicePreparationState,
		pipelineKey: string,
		callback: 'reportRecoverableError' | 'requestRender',
		error?: Error
	): void {
		for (const [owner, keys] of state.ownerPipelineKeys) {
			if (!keys.has(pipelineKey)) continue;
			try {
				if (callback === 'reportRecoverableError' && error) {
					state.ownerCallbacks.get(owner)?.reportRecoverableError?.(error);
				} else if (callback === 'requestRender') {
					state.ownerCallbacks.get(owner)?.requestRender?.();
				}
			} catch {
				// Host callbacks must not change async preparation state or LKG recovery.
			}
		}
	}

	private selectRenderablePipeline(
		state: DevicePreparationState,
		pipelineKey: string
	): PreparedPipeline | undefined {
		const prepared = state.preparedPipelines.get(pipelineKey);
		if (!prepared) return undefined;
		const currentVersion = this.programVersion;
		if (prepared.version === currentVersion) return prepared;

		const latestRequestId = state.latestRequestId.get(pipelineKey);
		const pending = state.pendingRequests.get(pipelineKey);
		if (pending?.version === currentVersion && pending.id === latestRequestId) return prepared;

		const failure = state.latestFailure.get(pipelineKey);
		if (failure?.version === currentVersion && failure.id === latestRequestId) return prepared;
		return undefined;
	}

	private pruneProgramResources(state: DevicePreparationState): void {
		const retainedVersions = new Set<number>();
		for (const prepared of state.preparedPipelines.values()) retainedVersions.add(prepared.version);
		for (const pending of state.pendingRequests.values()) retainedVersions.add(pending.version);
		for (const version of state.programResources.keys()) {
			if (!retainedVersions.has(version)) state.programResources.delete(version);
		}
	}

	private releaseOwnerPipelineKey(
		device: GPUDevice,
		state: DevicePreparationState,
		owner: object,
		pipelineKey: string
	): void {
		const keys = state.ownerPipelineKeys.get(owner);
		if (!keys) return;
		keys.delete(pipelineKey);
		if (keys.size === 0) {
			state.ownerPipelineKeys.delete(owner);
			state.ownerCallbacks.delete(owner);
			if (this.ownerDevices.get(owner) === device) this.ownerDevices.delete(owner);
		}
		if (!this.hasOwnersForPipeline(state, pipelineKey)) {
			state.preparedPipelines.delete(pipelineKey);
			state.descriptors.delete(pipelineKey);
			state.latestRequestId.delete(pipelineKey);
			state.latestFailure.delete(pipelineKey);
		}
		if (state.ownerPipelineKeys.size === 0) this.deviceStates.delete(device);
	}

	async [prepareFullscreenPass](input: FullscreenPassPreparation): Promise<void> {
		const requestFloor = this.nextRequestId;
		const descriptor = this.resolveDescriptor(input.device, input.inputFormat, input.outputFormat);
		const previousDevice = this.ownerDevices.get(input.owner);
		if (previousDevice && previousDevice !== input.device) {
			this[releaseFullscreenPass](previousDevice, input.owner);
		}
		this.ownerDevices.set(input.owner, input.device);
		const state = this.getOrCreateDeviceState(input.device);
		state.ownerCallbacks.set(input.owner, {
			...(input.reportRecoverableError !== undefined
				? { reportRecoverableError: input.reportRecoverableError }
				: {}),
			...(input.requestRender !== undefined ? { requestRender: input.requestRender } : {})
		});
		let ownerKeys = state.ownerPipelineKeys.get(input.owner);
		if (!ownerKeys) {
			ownerKeys = new Set();
			state.ownerPipelineKeys.set(input.owner, ownerKeys);
		}
		ownerKeys.add(descriptor.pipelineKey);
		state.descriptors.set(descriptor.pipelineKey, descriptor);

		while (this.ownerDevices.get(input.owner) === input.device) {
			const version = this.programVersion;
			const prepared = state.preparedPipelines.get(descriptor.pipelineKey);
			if (prepared?.version === version) {
				if (input.replaceOwnerFormats) {
					for (const pipelineKey of [...ownerKeys]) {
						if (pipelineKey !== descriptor.pipelineKey) {
							this.releaseOwnerPipelineKey(input.device, state, input.owner, pipelineKey);
						}
					}
				}
				return;
			}
			const latestFailure = state.latestFailure.get(descriptor.pipelineKey);
			if (latestFailure?.version === version && latestFailure.id > requestFloor) {
				if (!input.retainOwnerOnFailure) {
					this.releaseOwnerPipelineKey(input.device, state, input.owner, descriptor.pipelineKey);
				}
				throw latestFailure.error;
			}
			const request = this.startPreparation(
				input.device,
				state,
				descriptor,
				version,
				this.getProgram()
			);
			try {
				await request.promise;
			} catch (error) {
				const currentOwnerKeys = state.ownerPipelineKeys.get(input.owner);
				if (
					this.ownerDevices.get(input.owner) !== input.device ||
					!currentOwnerKeys?.has(descriptor.pipelineKey)
				) {
					return;
				}
				const isLatest =
					this.programVersion === version &&
					state.latestRequestId.get(descriptor.pipelineKey) === request.id;
				if (!isLatest) continue;
				if (!input.retainOwnerOnFailure) {
					this.releaseOwnerPipelineKey(input.device, state, input.owner, descriptor.pipelineKey);
				}
				throw error;
			}
			if (this.programVersion !== version) continue;
			if (state.preparedPipelines.get(descriptor.pipelineKey)?.version === version) {
				if (input.replaceOwnerFormats) {
					for (const pipelineKey of [...ownerKeys]) {
						if (pipelineKey !== descriptor.pipelineKey) {
							this.releaseOwnerPipelineKey(input.device, state, input.owner, pipelineKey);
						}
					}
				}
				return;
			}
			if (this.deviceStates.get(input.device) !== state) return;
		}
	}

	[releaseFullscreenPass](device: GPUDevice, owner: object): void {
		const state = this.deviceStates.get(device);
		const keys = state?.ownerPipelineKeys.get(owner);
		if (!state || !keys) return;
		for (const pipelineKey of [...keys]) {
			this.releaseOwnerPipelineKey(device, state, owner, pipelineKey);
		}
	}

	[isFullscreenPassPrepared](
		device: GPUDevice,
		inputFormat: GPUTextureFormat,
		outputFormat: GPUTextureFormat
	): boolean {
		const descriptor = this.resolveDescriptor(device, inputFormat, outputFormat);
		const state = this.deviceStates.get(device);
		return Boolean(
			state &&
			this.selectRenderablePipeline(state, descriptor.pipelineKey) &&
			this.hasOwnersForPipeline(state, descriptor.pipelineKey)
		);
	}

	setSize(width: number, height: number): void {
		void width;
		void height;
	}

	protected renderFullscreen(context: RenderPassContext): void {
		const descriptor = this.resolveDescriptor(
			context.device,
			context.input.format,
			context.output.format
		);
		const state = this.deviceStates.get(context.device);
		const prepared = state
			? this.selectRenderablePipeline(state, descriptor.pipelineKey)
			: undefined;
		const sampling = state?.samplingResources.get(descriptor.samplingLayoutKey);
		if (
			!state ||
			!prepared ||
			!sampling ||
			!this.hasOwnersForPipeline(state, descriptor.pipelineKey)
		) {
			throw new Error(
				`${this[builtInRenderPassBrand].passName} pipeline was not prepared before render.`
			);
		}
		const inputView = context.input.view;
		let bindGroup = sampling.bindGroupByView.get(inputView);
		if (!bindGroup) {
			bindGroup = context.device.createBindGroup({
				layout: sampling.bindGroupLayout,
				entries: [
					{ binding: 0, resource: sampling.sampler },
					{ binding: 1, resource: inputView }
				]
			});
			sampling.bindGroupByView.set(inputView, bindGroup);
		}
		const pass = context.beginRenderPass();
		pass.setPipeline(prepared.pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();
	}

	render(context: RenderPassContext): void {
		this.renderFullscreen(context);
	}

	dispose(): void {
		this.lifecycleGeneration += 1;
		this.deviceStates.clear();
		this.ownerDevices.clear();
	}
}
