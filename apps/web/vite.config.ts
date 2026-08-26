import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [tailwindcss(), sveltekit()],
	optimizeDeps: {
		exclude: ['@rollup/browser']
	},
	worker: {
		format: 'es'
	},
	test: {
		include: ['src/**/*.test.{js,ts}'],
		exclude: [...configDefaults.exclude, 'tests/e2e/**']
	}
});
