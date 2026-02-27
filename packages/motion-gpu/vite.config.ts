import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
	plugins: [svelte()],
	...(process.env['VITEST'] ? { resolve: { conditions: ['browser'] } } : {}),
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts']
	}
}));
