import { defineConfig } from 'vite';
import { preserveSpektralSourceMaps } from '../vite-spektral-source-maps.mjs';

export default defineConfig({
	plugins: [preserveSpektralSourceMaps()],
	build: { sourcemap: true }
});
