(() => {
	const GPU_TIMEOUT_MS = 30_000;

	function percentile(sorted, fraction) {
		if (sorted.length === 0) {
			return 0;
		}
		const index = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction));
		return sorted[index] ?? 0;
	}

	function summarize(samples) {
		const sorted = [...samples].sort((a, b) => a - b);
		const mean = samples.reduce((sum, value) => sum + value, 0) / Math.max(1, samples.length);
		const variance =
			samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, samples.length);
		return {
			samples,
			mean,
			median: percentile(sorted, 0.5),
			p95: percentile(sorted, 0.95),
			min: sorted[0] ?? 0,
			max: sorted[sorted.length - 1] ?? 0,
			coefficientOfVariationPct: mean === 0 ? 0 : (Math.sqrt(variance) / mean) * 100
		};
	}

	function adapterInfo(adapter) {
		const info = adapter.info;
		return {
			vendor: info.vendor ?? '',
			architecture: info.architecture ?? '',
			device: info.device ?? '',
			description: info.description ?? '',
			backend: info.backend ?? '',
			type: info.type ?? '',
			driver: info.driver ?? '',
			isFallbackAdapter: adapter.isFallbackAdapter ?? false
		};
	}

	function assertHardwareAdapter(info) {
		const softwareLabel =
			`${info.vendor} ${info.description} ${info.backend} ${info.type}`.toLowerCase();
		if (
			info.isFallbackAdapter ||
			info.type.toLowerCase() === 'cpu' ||
			info.backend.toLowerCase() === 'null' ||
			/(swiftshader|llvmpipe|software rasterizer|software adapter)/.test(softwareLabel)
		) {
			throw new Error(`Hardware benchmark refused software adapter: ${JSON.stringify(info)}`);
		}
		if (!info.backend || !info.description) {
			throw new Error(
				`Hardware benchmark could not verify adapter identity: ${JSON.stringify(info)}`
			);
		}
	}

	async function withTimeout(promise, label) {
		let timeoutId;
		try {
			return await Promise.race([
				promise,
				new Promise((_, reject) => {
					timeoutId = window.setTimeout(() => {
						reject(new Error(`${label} timed out after ${GPU_TIMEOUT_MS} ms`));
					}, GPU_TIMEOUT_MS);
				})
			]);
		} finally {
			window.clearTimeout(timeoutId);
		}
	}

	function createUniformResources(device, workload, visibility) {
		const frameBuffer = device.createBuffer({
			size: 16,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		const uniformBuffer = device.createBuffer({
			size: Math.max(16, workload.uniformByteLength),
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(
			frameBuffer,
			0,
			new Float32Array([
				1,
				1 / 60,
				workload.width ?? workload.elementCount ?? 1,
				workload.height ?? 1
			])
		);
		device.queue.writeBuffer(
			uniformBuffer,
			0,
			new Float32Array(Math.max(4, workload.uniformByteLength / 4)).fill(0.25)
		);

		const entries = [
			{
				binding: 0,
				visibility,
				buffer: { type: 'uniform', minBindingSize: 16 }
			},
			{
				binding: 1,
				visibility,
				buffer: { type: 'uniform', minBindingSize: Math.max(16, workload.uniformByteLength) }
			}
		];

		return {
			frameBuffer,
			uniformBuffer,
			entries,
			destroy() {
				frameBuffer.destroy();
				uniformBuffer.destroy();
			}
		};
	}

	async function createRenderTimestampMarker(device) {
		const module = device.createShaderModule({
			label: 'timestamp-marker-module',
			code: `
@vertex
fn vertexMain(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
	let positions = array(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
	return vec4f(positions[index], 0.0, 1.0);
}

@fragment
fn fragmentMain() -> @location(0) vec4f {
	return vec4f(0.25, 0.5, 0.75, 1.0);
}
`
		});
		const pipeline = await device.createRenderPipelineAsync({
			label: 'timestamp-marker-pipeline',
			layout: 'auto',
			vertex: { module, entryPoint: 'vertexMain' },
			fragment: {
				module,
				entryPoint: 'fragmentMain',
				targets: [{ format: 'rgba8unorm' }]
			},
			primitive: { topology: 'triangle-list' }
		});
		const texture = device.createTexture({
			label: 'timestamp-marker-texture',
			size: [1, 1],
			format: 'rgba8unorm',
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
		});
		const view = texture.createView();
		const warmupEncoder = device.createCommandEncoder();
		const warmupPass = warmupEncoder.beginRenderPass({
			colorAttachments: [
				{
					view,
					clearValue: { r: 0, g: 0, b: 0, a: 1 },
					loadOp: 'clear',
					storeOp: 'store'
				}
			]
		});
		warmupPass.setPipeline(pipeline);
		warmupPass.draw(3);
		warmupPass.end();
		device.queue.submit([warmupEncoder.finish()]);
		await withTimeout(device.queue.onSubmittedWorkDone(), 'timestamp marker warmup');

		return {
			pipeline,
			texture,
			view,
			destroy() {
				texture.destroy();
			}
		};
	}

	async function compileRenderPipeline(device, workload, bindGroupLayout, pipelineLayout) {
		const compileSamples = [];
		let pipeline = null;
		for (let index = 0; index < workload.compileSamples; index += 1) {
			const uniqueSource = `${workload.shaderCode}\nconst spektralBenchmarkCompileSalt${index}: f32 = ${index}.0;`;
			const startedAt = performance.now();
			const module = device.createShaderModule({
				label: `${workload.name}-module-${index}`,
				code: uniqueSource
			});
			pipeline = await device.createRenderPipelineAsync({
				label: `${workload.name}-pipeline-${index}`,
				layout: pipelineLayout,
				vertex: {
					module,
					entryPoint: 'spektralVertex'
				},
				fragment: {
					module,
					entryPoint: 'spektralFragmentMain',
					targets: [{ format: workload.format }]
				},
				primitive: { topology: 'triangle-list' }
			});
			compileSamples.push(performance.now() - startedAt);
			const compilationInfo = await module.getCompilationInfo();
			const errors = compilationInfo.messages.filter((message) => message.type === 'error');
			if (errors.length > 0) {
				throw new Error(
					`${workload.name} WGSL compilation failed:\n${errors.map((error) => error.message).join('\n')}`
				);
			}
		}
		if (!pipeline) {
			throw new Error(`${workload.name} did not produce a render pipeline`);
		}
		return { pipeline, compileStatsMs: summarize(compileSamples), bindGroupLayout };
	}

	function createRenderTextureBindings(
		device,
		workload,
		layoutEntries,
		bindGroupEntries,
		resources
	) {
		if (!workload.usesTexture) {
			return;
		}
		const sampler = device.createSampler({
			magFilter: 'linear',
			minFilter: 'linear',
			addressModeU: 'repeat',
			addressModeV: 'repeat'
		});
		const inputTexture = device.createTexture({
			label: `${workload.name}-input`,
			size: [workload.width, workload.height],
			format: 'rgba8unorm',
			usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
		});
		const pixel = new Uint8Array(workload.width * workload.height * 4);
		for (let index = 0; index < pixel.length; index += 4) {
			const value = (index / 4) % 251;
			pixel[index] = value;
			pixel[index + 1] = 255 - value;
			pixel[index + 2] = value ^ 0x5a;
			pixel[index + 3] = 255;
		}
		device.queue.writeTexture(
			{ texture: inputTexture },
			pixel,
			{ bytesPerRow: workload.width * 4 },
			[workload.width, workload.height]
		);
		layoutEntries.push(
			{ binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
			{
				binding: 3,
				visibility: GPUShaderStage.FRAGMENT,
				texture: { sampleType: 'float', viewDimension: '2d' }
			}
		);
		bindGroupEntries.push(
			{ binding: 2, resource: sampler },
			{ binding: 3, resource: inputTexture.createView() }
		);
		resources.push(inputTexture);
	}

	async function measureRenderWorkload(device, timestampMarker, workload) {
		const uniforms = createUniformResources(device, workload, GPUShaderStage.FRAGMENT);
		const layoutEntries = [...uniforms.entries];
		const bindGroupEntries = [
			{ binding: 0, resource: { buffer: uniforms.frameBuffer } },
			{ binding: 1, resource: { buffer: uniforms.uniformBuffer } }
		];
		const extraResources = [];
		createRenderTextureBindings(device, workload, layoutEntries, bindGroupEntries, extraResources);
		const bindGroupLayout = device.createBindGroupLayout({ entries: layoutEntries });
		const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [bindGroupLayout] });
		const bindGroup = device.createBindGroup({
			layout: bindGroupLayout,
			entries: bindGroupEntries
		});
		const { pipeline, compileStatsMs } = await compileRenderPipeline(
			device,
			workload,
			bindGroupLayout,
			pipelineLayout
		);
		const outputTexture = device.createTexture({
			label: `${workload.name}-output`,
			size: [workload.width, workload.height],
			format: workload.format,
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
		});
		const outputView = outputTexture.createView();

		const warmupEncoder = device.createCommandEncoder();
		for (let index = 0; index < workload.warmupIterations; index += 1) {
			const pass = warmupEncoder.beginRenderPass({
				colorAttachments: [
					{
						view: outputView,
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
						loadOp: 'clear',
						storeOp: 'store'
					}
				]
			});
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, bindGroup);
			pass.draw(3);
			pass.end();
		}
		device.queue.submit([warmupEncoder.finish()]);
		await withTimeout(device.queue.onSubmittedWorkDone(), `${workload.name} warmup`);

		const queryCount = workload.sampleCount * 2;
		const querySet = device.createQuerySet({ type: 'timestamp', count: queryCount });
		const resultSize = queryCount * BigUint64Array.BYTES_PER_ELEMENT;
		const resolveBuffer = device.createBuffer({
			size: resultSize,
			usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
		});
		const readBuffer = device.createBuffer({
			size: resultSize,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});
		const observationBuffer = device.createBuffer({
			size: workload.sampleCount * 512,
			usage: GPUBufferUsage.COPY_DST
		});
		const commandBuffers = [];
		for (let sample = 0; sample < workload.sampleCount; sample += 1) {
			const encoder = device.createCommandEncoder();
			const markerPass = encoder.beginRenderPass({
				colorAttachments: [
					{
						view: timestampMarker.view,
						clearValue: { r: 0, g: 0, b: 0, a: 1 },
						loadOp: 'clear',
						storeOp: 'store'
					}
				],
				timestampWrites: {
					querySet,
					endOfPassWriteIndex: sample * 2
				}
			});
			markerPass.setPipeline(timestampMarker.pipeline);
			markerPass.draw(3);
			markerPass.end();
			for (let iteration = 0; iteration < workload.iterationsPerSample; iteration += 1) {
				const last = iteration === workload.iterationsPerSample - 1;
				const pass = encoder.beginRenderPass({
					colorAttachments: [
						{
							view: outputView,
							clearValue: { r: 0, g: 0, b: 0, a: 1 },
							loadOp: 'clear',
							storeOp: 'store'
						}
					],
					...(last
						? {
								timestampWrites: {
									querySet,
									endOfPassWriteIndex: sample * 2 + 1
								}
							}
						: {})
				});
				pass.setPipeline(pipeline);
				pass.setBindGroup(0, bindGroup);
				pass.draw(3);
				pass.end();
			}
			encoder.copyTextureToBuffer(
				{ texture: timestampMarker.texture },
				{
					buffer: observationBuffer,
					offset: sample * 512,
					bytesPerRow: 256
				},
				[1, 1, 1]
			);
			encoder.copyTextureToBuffer(
				{
					texture: outputTexture,
					origin: [Math.floor(workload.width / 2), Math.floor(workload.height / 2), 0]
				},
				{
					buffer: observationBuffer,
					offset: sample * 512 + 256,
					bytesPerRow: 256
				},
				[1, 1, 1]
			);
			commandBuffers.push(encoder.finish());
		}
		const resolveEncoder = device.createCommandEncoder();
		resolveEncoder.resolveQuerySet(querySet, 0, queryCount, resolveBuffer, 0);
		resolveEncoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, resultSize);
		commandBuffers.push(resolveEncoder.finish());
		const submitStartedAt = performance.now();
		device.queue.submit(commandBuffers);
		await withTimeout(readBuffer.mapAsync(GPUMapMode.READ), `${workload.name} readback`);
		const submitToReadbackMs = performance.now() - submitStartedAt;
		const timestamps = new BigUint64Array(readBuffer.getMappedRange());
		const gpuNsPerIteration = [];
		for (let sample = 0; sample < workload.sampleCount; sample += 1) {
			const start = timestamps[sample * 2] ?? 0n;
			const end = timestamps[sample * 2 + 1] ?? 0n;
			if (end > start) {
				gpuNsPerIteration.push(Number(end - start) / workload.iterationsPerSample);
			}
		}
		const firstTimestamps = [...timestamps.slice(0, 8)].map(String);
		readBuffer.unmap();

		querySet.destroy();
		resolveBuffer.destroy();
		readBuffer.destroy();
		observationBuffer.destroy();
		outputTexture.destroy();
		for (const resource of extraResources) {
			resource.destroy();
		}
		uniforms.destroy();

		if (gpuNsPerIteration.length !== workload.sampleCount) {
			throw new Error(
				`${workload.name} produced ${gpuNsPerIteration.length}/${workload.sampleCount} valid timestamp samples; first timestamps=${firstTimestamps.join(',')}`
			);
		}

		const gpuStatsNs = summarize(gpuNsPerIteration);
		return {
			kind: 'render',
			name: workload.name,
			width: workload.width,
			height: workload.height,
			format: workload.format,
			pixelsPerIteration: workload.width * workload.height,
			compileStatsMs,
			gpuStatsNs,
			submitToReadbackMs,
			throughputMPixelsPerSec:
				gpuStatsNs.median === 0 ? 0 : (workload.width * workload.height * 1_000) / gpuStatsNs.median
		};
	}

	async function compileComputePipeline(device, workload, pipelineLayout) {
		const compileSamples = [];
		let pipeline = null;
		for (let index = 0; index < workload.compileSamples; index += 1) {
			const uniqueSource = `${workload.shaderCode}\nconst spektralBenchmarkCompileSalt${index}: f32 = ${index}.0;`;
			const startedAt = performance.now();
			const module = device.createShaderModule({
				label: `${workload.name}-module-${index}`,
				code: uniqueSource
			});
			pipeline = await device.createComputePipelineAsync({
				label: `${workload.name}-pipeline-${index}`,
				layout: pipelineLayout,
				compute: { module, entryPoint: 'compute' }
			});
			compileSamples.push(performance.now() - startedAt);
			const compilationInfo = await module.getCompilationInfo();
			const errors = compilationInfo.messages.filter((message) => message.type === 'error');
			if (errors.length > 0) {
				throw new Error(
					`${workload.name} WGSL compilation failed:\n${errors.map((error) => error.message).join('\n')}`
				);
			}
		}
		if (!pipeline) {
			throw new Error(`${workload.name} did not produce a compute pipeline`);
		}
		return { pipeline, compileStatsMs: summarize(compileSamples) };
	}

	async function measureComputeWorkload(device, workload) {
		const uniforms = createUniformResources(device, workload, GPUShaderStage.COMPUTE);
		const uniformBindGroupLayout = device.createBindGroupLayout({ entries: uniforms.entries });
		const uniformBindGroup = device.createBindGroup({
			layout: uniformBindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: uniforms.frameBuffer } },
				{ binding: 1, resource: { buffer: uniforms.uniformBuffer } }
			]
		});
		const storageBuffer = device.createBuffer({
			label: `${workload.name}-storage`,
			size: workload.storageByteLength,
			usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
		});
		const seed = new Float32Array(workload.storageByteLength / 4);
		for (let index = 0; index < seed.length; index += 1) {
			seed[index] = (index % 257) / 257;
		}
		device.queue.writeBuffer(storageBuffer, 0, seed);
		const storageBindGroupLayout = device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.COMPUTE,
					buffer: { type: 'storage', minBindingSize: workload.storageByteLength }
				}
			]
		});
		const storageBindGroup = device.createBindGroup({
			layout: storageBindGroupLayout,
			entries: [{ binding: 0, resource: { buffer: storageBuffer } }]
		});
		const pipelineLayout = device.createPipelineLayout({
			bindGroupLayouts: [uniformBindGroupLayout, storageBindGroupLayout]
		});
		const { pipeline, compileStatsMs } = await compileComputePipeline(
			device,
			workload,
			pipelineLayout
		);

		const warmupEncoder = device.createCommandEncoder();
		for (let index = 0; index < workload.warmupIterations; index += 1) {
			const pass = warmupEncoder.beginComputePass();
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, uniformBindGroup);
			pass.setBindGroup(1, storageBindGroup);
			pass.dispatchWorkgroups(workload.dispatchWorkgroups);
			pass.end();
		}
		device.queue.submit([warmupEncoder.finish()]);
		await withTimeout(device.queue.onSubmittedWorkDone(), `${workload.name} warmup`);

		const queryCount = workload.sampleCount * 2;
		const querySet = device.createQuerySet({ type: 'timestamp', count: queryCount });
		const resultSize = queryCount * BigUint64Array.BYTES_PER_ELEMENT;
		const resolveBuffer = device.createBuffer({
			size: resultSize,
			usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC
		});
		const readBuffer = device.createBuffer({
			size: resultSize,
			usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
		});
		const commandBuffers = [];
		for (let sample = 0; sample < workload.sampleCount; sample += 1) {
			const encoder = device.createCommandEncoder();
			for (let iteration = 0; iteration < workload.iterationsPerSample; iteration += 1) {
				const first = iteration === 0;
				const last = iteration === workload.iterationsPerSample - 1;
				const pass = encoder.beginComputePass({
					...(first || last
						? {
								timestampWrites: {
									querySet,
									...(first ? { beginningOfPassWriteIndex: sample * 2 } : {}),
									...(last ? { endOfPassWriteIndex: sample * 2 + 1 } : {})
								}
							}
						: {})
				});
				pass.setPipeline(pipeline);
				pass.setBindGroup(0, uniformBindGroup);
				pass.setBindGroup(1, storageBindGroup);
				pass.dispatchWorkgroups(workload.dispatchWorkgroups);
				pass.end();
			}
			commandBuffers.push(encoder.finish());
		}
		const resolveEncoder = device.createCommandEncoder();
		resolveEncoder.resolveQuerySet(querySet, 0, queryCount, resolveBuffer, 0);
		resolveEncoder.copyBufferToBuffer(resolveBuffer, 0, readBuffer, 0, resultSize);
		commandBuffers.push(resolveEncoder.finish());
		const submitStartedAt = performance.now();
		device.queue.submit(commandBuffers);
		await withTimeout(readBuffer.mapAsync(GPUMapMode.READ), `${workload.name} readback`);
		const submitToReadbackMs = performance.now() - submitStartedAt;
		const timestamps = new BigUint64Array(readBuffer.getMappedRange());
		const gpuNsPerIteration = [];
		for (let sample = 0; sample < workload.sampleCount; sample += 1) {
			const start = timestamps[sample * 2] ?? 0n;
			const end = timestamps[sample * 2 + 1] ?? 0n;
			if (end > start) {
				gpuNsPerIteration.push(Number(end - start) / workload.iterationsPerSample);
			}
		}
		const firstTimestamps = [...timestamps.slice(0, 8)].map(String);
		readBuffer.unmap();

		querySet.destroy();
		resolveBuffer.destroy();
		readBuffer.destroy();
		storageBuffer.destroy();
		uniforms.destroy();

		if (gpuNsPerIteration.length !== workload.sampleCount) {
			throw new Error(
				`${workload.name} produced ${gpuNsPerIteration.length}/${workload.sampleCount} valid timestamp samples; first timestamps=${firstTimestamps.join(',')}`
			);
		}

		const gpuStatsNs = summarize(gpuNsPerIteration);
		return {
			kind: 'compute',
			name: workload.name,
			elementCount: workload.elementCount,
			storageByteLength: workload.storageByteLength,
			dispatchWorkgroups: workload.dispatchWorkgroups,
			compileStatsMs,
			gpuStatsNs,
			submitToReadbackMs,
			throughputMElementsPerSec:
				gpuStatsNs.median === 0 ? 0 : (workload.elementCount * 1_000) / gpuStatsNs.median
		};
	}

	async function run(payload) {
		if (!navigator.gpu) {
			throw new Error('WebGPU is unavailable');
		}
		const deviceStart = performance.now();
		const adapterStart = performance.now();
		const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
		const adapterReady = performance.now();
		if (!adapter) {
			throw new Error('Unable to acquire a WebGPU adapter');
		}
		const info = adapterInfo(adapter);
		assertHardwareAdapter(info);
		if (!adapter.features.has('timestamp-query')) {
			throw new Error(`Adapter does not expose timestamp-query: ${JSON.stringify(info)}`);
		}
		const requestDeviceStart = performance.now();
		const device = await adapter.requestDevice({ requiredFeatures: ['timestamp-query'] });
		const deviceReady = performance.now();
		let uncapturedError = null;
		device.addEventListener('uncapturederror', (event) => {
			uncapturedError = event.error?.message ?? String(event.error);
		});
		const timestampMarker = await createRenderTimestampMarker(device);

		try {
			const workloads = [];
			for (const workload of payload.renderWorkloads) {
				workloads.push(await measureRenderWorkload(device, timestampMarker, workload));
				if (uncapturedError) {
					throw new Error(`Uncaptured WebGPU error: ${uncapturedError}`);
				}
			}
			for (const workload of payload.computeWorkloads) {
				workloads.push(await measureComputeWorkload(device, workload));
				if (uncapturedError) {
					throw new Error(`Uncaptured WebGPU error: ${uncapturedError}`);
				}
			}
			return {
				adapter: info,
				deviceTimingMs: {
					adapterRequest: adapterReady - adapterStart,
					deviceRequest: deviceReady - requestDeviceStart,
					total: deviceReady - deviceStart
				},
				features: [...adapter.features].sort(),
				limits: {
					maxBufferSize: Number(device.limits.maxBufferSize),
					maxStorageBufferBindingSize: Number(device.limits.maxStorageBufferBindingSize),
					maxComputeWorkgroupsPerDimension: Number(device.limits.maxComputeWorkgroupsPerDimension)
				},
				workloads
			};
		} finally {
			timestampMarker.destroy();
			device.destroy();
		}
	}

	globalThis.__SPEKTRAL_HARDWARE_BENCHMARK__ = run;
})();
