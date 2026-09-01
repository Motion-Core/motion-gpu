import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { emitDts } from 'svelte2tsx';

const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, '../..');
const distDirectory = path.resolve(packageRoot, 'dist');
const sourceDirectory = path.resolve(packageRoot, 'src/lib');

await emitDts({
	declarationDir: distDirectory,
	libRoot: sourceDirectory,
	tsconfig: path.resolve(packageRoot, 'tsconfig.json'),
	svelteShimsPath: require.resolve('svelte2tsx/svelte-shims-v4.d.ts')
});

console.log('Generated declaration files for src/lib');
