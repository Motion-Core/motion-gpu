import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import vue from '@vitejs/plugin-vue';

const dirname = path.dirname(fileURLToPath(import.meta.url));
type E2EFramework = 'svelte' | 'react' | 'vue';

function resolveFramework(value: string | undefined): E2EFramework {
	if (value === 'react') {
		return 'react';
	}
	if (value === 'vue') {
		return 'vue';
	}
	return 'svelte';
}

const framework = resolveFramework(process.env['MOTION_GPU_E2E_FRAMEWORK']);
const rootDirectory =
	framework === 'react' ? 'harness-react' : framework === 'vue' ? 'harness-vue' : 'harness';
const port = framework === 'react' ? 4176 : framework === 'vue' ? 4177 : 4175;

export default defineConfig({
	root: path.resolve(dirname, rootDirectory),
	plugins: framework === 'svelte' ? [svelte()] : framework === 'vue' ? [vue()] : [],
	server: {
		host: '127.0.0.1',
		port,
		strictPort: true
	},
	preview: {
		host: '127.0.0.1',
		port,
		strictPort: true
	}
});
