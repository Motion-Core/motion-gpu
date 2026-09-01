import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { preserveSpektralSourceMaps } from '../vite-spektral-source-maps.mjs';

export default defineConfig({
	plugins: [preserveSpektralSourceMaps(), sveltekit()],
	build: { sourcemap: true }
});
