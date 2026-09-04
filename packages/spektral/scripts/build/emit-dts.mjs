import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { emitDts } from 'svelte2tsx';

const require = createRequire(import.meta.url);
const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, '../..');
const distDirectory = path.resolve(packageRoot, 'dist');
const sourceDirectory = path.resolve(packageRoot, 'src/lib');

// Keep declarations in the public artifact, but omit declaration maps: they do not embed
// sourcesContent, duplicate source paths already covered by executable JS maps, and would consume
// the release's strict 1.5 MB unpacked-size budget without improving source navigation.
await emitDts({
	declarationDir: distDirectory,
	libRoot: sourceDirectory,
	tsconfig: path.resolve(packageRoot, 'tsconfig.json'),
	svelteShimsPath: require.resolve('svelte2tsx/svelte-shims-v4.d.ts')
});

console.log('Generated declaration files for src/lib');
