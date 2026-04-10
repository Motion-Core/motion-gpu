<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTexture } from '../../../src/lib/vue';
import { useCurrent } from '../use-current';

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

const urls = ref<string[]>([SUCCESS_URL]);
const result = useTexture(() => urls.value);

const loading = useCurrent(result.loading);
const error = useCurrent(result.error);
const textures = useCurrent(result.textures);
const textureUrlMode = computed(() => (urls.value[0] === SUCCESS_URL ? 'success' : 'missing'));
</script>

<template>
	<main class="harness-main">
		<section class="harness-controls">
			<div data-testid="texture-loading">{{ loading ? 'yes' : 'no' }}</div>
			<div data-testid="texture-error">{{ error?.message ?? 'none' }}</div>
			<div data-testid="texture-count">{{ textures?.length ?? 0 }}</div>
			<div data-testid="texture-url-mode">{{ textureUrlMode }}</div>

			<button class="harness-button" data-testid="set-success-url" @click="urls = [SUCCESS_URL]">
				set success url
			</button>
			<button class="harness-button" data-testid="set-missing-url" @click="urls = [MISSING_URL]">
				set missing url
			</button>
			<button class="harness-button" data-testid="reload-textures" @click="result.reload()">
				reload
			</button>
		</section>
	</main>
</template>
