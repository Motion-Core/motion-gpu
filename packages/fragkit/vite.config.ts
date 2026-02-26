import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [svelte()],
	resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
	build: {
		lib: {
			entry: 'src/index.ts',
			formats: ['es'],
			fileName: 'index'
		},
		rollupOptions: {
			external: ['svelte']
		}
	},
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts']
	}
});
