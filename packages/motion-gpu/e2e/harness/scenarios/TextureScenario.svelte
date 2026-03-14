<script lang="ts">
	import { useTexture } from '../../../src/lib/svelte/use-texture';

	function createSuccessTextureUrl(): string {
		const canvas = document.createElement('canvas');
		canvas.width = 2;
		canvas.height = 2;
		const context = canvas.getContext('2d');
		if (!context) {
			return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
		}

		context.fillStyle = '#20a4f3';
		context.fillRect(0, 0, 2, 2);
		context.fillStyle = '#f39c12';
		context.fillRect(1, 1, 1, 1);
		return canvas.toDataURL('image/png');
	}

	const SUCCESS_URL = createSuccessTextureUrl();
	const MISSING_URL = '/missing-texture-e2e.png';

	let urls = $state<string[]>([SUCCESS_URL]);
	const result = useTexture(() => urls);
	let loading = $state(true);
	let errorMessage = $state('none');
	let textureCount = $state(0);

	$effect(() => {
		const unsubscribe = result.loading.subscribe((value) => {
			loading = value;
		});

		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = result.error.subscribe((value) => {
			errorMessage = value?.message ?? 'none';
		});

		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = result.textures.subscribe((value) => {
			textureCount = value?.length ?? 0;
		});

		return unsubscribe;
	});
</script>

<main>
	<section class="controls">
		<div data-testid="texture-loading">{loading ? 'yes' : 'no'}</div>
		<div data-testid="texture-error">{errorMessage}</div>
		<div data-testid="texture-count">{textureCount}</div>
		<div data-testid="texture-url-mode">{urls[0] === SUCCESS_URL ? 'success' : 'missing'}</div>

		<button
			data-testid="set-success-url"
			onclick={() => {
				urls = [SUCCESS_URL];
			}}
		>
			set success url
		</button>
		<button
			data-testid="set-missing-url"
			onclick={() => {
				urls = [MISSING_URL];
			}}
		>
			set missing url
		</button>
		<button
			data-testid="reload-textures"
			onclick={() => {
				void result.reload();
			}}
		>
			reload
		</button>
	</section>
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
</style>
