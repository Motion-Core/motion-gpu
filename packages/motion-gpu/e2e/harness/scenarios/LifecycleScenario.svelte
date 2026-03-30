<script lang="ts">
	import { onMount } from 'svelte';
	import FragCanvas from '../../../src/lib/svelte/FragCanvas.svelte';
	import { defineMaterial, type FragMaterial } from '../../../src/lib/core/material';
	import type { MotionGPUErrorReport } from '../../../src/lib/core/error-report';
	import { useTexture } from '../../../src/lib/svelte/use-texture';
	import LifecycleProbe, { type LifecycleProbeControls } from './LifecycleProbe.svelte';

	const simpleMaterial = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	let center = vec2f(0.5, 0.5);
	if (distance(uv, center) > 0.35) {
		discard;
	}
	return vec4f(uv, 0.5, 1.0);
}
`
	});

	const texturedMaterial = defineMaterial({
		fragment: `
fn frag(uv: vec2f) -> vec4f {
	return textureSample(artwork, artworkSampler, uv);
}
`,
		textures: {
			artwork: {}
		}
	});

	function createTestTextureUrl(): string {
		const canvas = document.createElement('canvas');
		canvas.width = 4;
		canvas.height = 4;
		const context = canvas.getContext('2d');
		if (!context) {
			return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
		}

		context.fillStyle = '#ff6600';
		context.fillRect(0, 0, 4, 4);
		context.fillStyle = '#0066ff';
		context.fillRect(0, 0, 2, 2);
		context.fillStyle = '#00ff66';
		context.fillRect(2, 2, 2, 2);
		return canvas.toDataURL('image/png');
	}

	const TEST_TEXTURE_URL = createTestTextureUrl();

	type ClearColorMode = 'red' | 'blue' | 'default';
	type SceneMode = 'simple' | 'textured';

	let gpuStatus = $state<'checking' | 'unavailable' | 'no-adapter' | 'ready'>('checking');
	let controls = $state<LifecycleProbeControls | null>(null);
	let frameCount = $state(0);
	let lastError = $state('none');
	let clearColorMode = $state<ClearColorMode>('default');
	let sceneMode = $state<SceneMode>('simple');
	let frameCallbackRunning = $state(true);

	let activeMaterial = $state<FragMaterial>(simpleMaterial);
	let clearColor = $state<[number, number, number, number]>([0, 0, 0, 1]);

	let textureUrls = $state<string[]>([TEST_TEXTURE_URL]);
	const textureResult = useTexture(() => textureUrls);
	let textureLoading = $state(true);
	let textureCount = $state(0);

	$effect(() => {
		const unsubscribe = textureResult.loading.subscribe((value) => {
			textureLoading = value;
		});
		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = textureResult.textures.subscribe((value) => {
			textureCount = value?.length ?? 0;
		});
		return unsubscribe;
	});

	function setClearColorMode(mode: ClearColorMode): void {
		clearColorMode = mode;
		switch (mode) {
			case 'red':
				clearColor = [1, 0, 0, 1];
				break;
			case 'blue':
				clearColor = [0, 0, 1, 1];
				break;
			case 'default':
				clearColor = [0, 0, 0, 1];
				break;
		}
	}

	function setSceneMode(mode: SceneMode): void {
		sceneMode = mode;
		activeMaterial = mode === 'textured' ? texturedMaterial : simpleMaterial;
	}

	const handleError = (report: MotionGPUErrorReport): void => {
		lastError = `${report.title}: ${report.rawMessage}`;
	};

	onMount(async () => {
		if (!navigator.gpu) {
			gpuStatus = 'unavailable';
			return;
		}

		try {
			const adapter = await navigator.gpu.requestAdapter();
			gpuStatus = adapter ? 'ready' : 'no-adapter';
		} catch {
			gpuStatus = 'no-adapter';
		}
	});
</script>

<main>
	<section class="controls">
		<div data-testid="gpu-status">{gpuStatus}</div>
		<div data-testid="controls-ready">{controls ? 'yes' : 'no'}</div>
		<div data-testid="frame-count">{frameCount}</div>
		<div data-testid="last-error">{lastError}</div>
		<div data-testid="clear-color-mode">{clearColorMode}</div>
		<div data-testid="scene-mode">{sceneMode}</div>
		<div data-testid="frame-callback-running">{frameCallbackRunning ? 'yes' : 'no'}</div>
		<div data-testid="texture-loading">{textureLoading ? 'yes' : 'no'}</div>
		<div data-testid="texture-count">{textureCount}</div>

		<button data-testid="set-clear-red" onclick={() => setClearColorMode('red')}>clear red</button>
		<button data-testid="set-clear-blue" onclick={() => setClearColorMode('blue')}
			>clear blue</button
		>
		<button data-testid="set-clear-default" onclick={() => setClearColorMode('default')}
			>clear default</button
		>

		<button data-testid="set-scene-simple" onclick={() => setSceneMode('simple')}>simple</button>
		<button data-testid="set-scene-textured" onclick={() => setSceneMode('textured')}
			>textured</button
		>

		<button
			data-testid="start-frame-callback"
			onclick={() => {
				frameCallbackRunning = true;
				controls?.startFrameCallback();
			}}
		>
			start callback
		</button>
		<button
			data-testid="stop-frame-callback"
			onclick={() => {
				frameCallbackRunning = false;
				controls?.stopFrameCallback();
			}}
		>
			stop callback
		</button>

		<button data-testid="advance-once" onclick={() => controls?.advance()}>advance</button>
		<button data-testid="set-mode-always" onclick={() => controls?.setRenderMode('always')}
			>always</button
		>
		<button data-testid="set-mode-manual" onclick={() => controls?.setRenderMode('manual')}
			>manual</button
		>
	</section>

	<div class="canvas-shell">
		<FragCanvas
			material={activeMaterial}
			{clearColor}
			showErrorOverlay={false}
			onError={handleError}
		>
			<LifecycleProbe
				onFrame={(count) => {
					frameCount = count;
				}}
				onReady={(nextControls) => {
					controls = nextControls;
					nextControls.setRenderMode('manual');
				}}
			/>
		</FragCanvas>
	</div>
</main>

<style>
	main {
		font-family: sans-serif;
		display: grid;
		gap: 0.75rem;
		padding: 0.75rem;
	}

	.controls {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.5rem;
	}

	button {
		padding: 0.35rem 0.5rem;
		font: inherit;
	}

	.canvas-shell {
		width: 320px;
		height: 220px;
		border: 1px solid #d0d0d0;
	}
</style>
