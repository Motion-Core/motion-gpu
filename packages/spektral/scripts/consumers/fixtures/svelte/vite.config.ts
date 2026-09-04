import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import { preserveSpektralSourceMaps } from '../vite-spektral-source-maps.mjs';

export default defineConfig({
	plugins: [preserveSpektralSourceMaps(), svelte()],
	build: { sourcemap: true }
});
