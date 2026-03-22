import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

const dirname = path.dirname(fileURLToPath(import.meta.url));
type E2EFramework = 'svelte' | 'react';

function resolveFramework(value: string | undefined): E2EFramework {
	return value === 'react' ? 'react' : 'svelte';
}

const framework = resolveFramework(process.env['MOTION_GPU_E2E_FRAMEWORK']);
const rootDirectory = framework === 'react' ? 'harness-react' : 'harness';
const port = framework === 'react' ? 4176 : 4175;

export default defineConfig({
	root: path.resolve(dirname, rootDirectory),
	plugins: framework === 'svelte' ? [svelte()] : [],
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
