import { svelte } from '@sveltejs/vite-plugin-svelte';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
	plugins: [svelte(), vue()],
	...(process.env['VITEST'] ? { resolve: { conditions: ['browser'] } } : {}),
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
		coverage: {
			provider: 'v8',
			reporter: ['text-summary', 'json-summary', 'lcov'],
			include: ['src/lib/**/*.{ts,tsx,svelte,vue}'],
			exclude: ['**/*.d.ts'],
			thresholds: {
				statements: 90,
				branches: 82,
				functions: 92,
				lines: 90
			}
		}
	}
}));
