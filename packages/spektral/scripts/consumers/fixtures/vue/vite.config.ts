import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';
import { preserveSpektralSourceMaps } from '../vite-spektral-source-maps.mjs';

export default defineConfig({
	plugins: [preserveSpektralSourceMaps(), vue()],
	build: { sourcemap: true }
});
