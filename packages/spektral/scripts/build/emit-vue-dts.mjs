import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(dirname, '../..');

function runVueTsc() {
	return new Promise((resolve, reject) => {
		const vueTscBin = path.resolve(packageRoot, 'node_modules/.bin/vue-tsc');
		const child = spawn(vueTscBin, ['--project', 'tsconfig.vue.json'], {
			cwd: packageRoot,
			stdio: 'inherit'
		});

		child.once('error', reject);
		child.once('exit', (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			reject(new Error(`vue-tsc failed with exit code ${code ?? 'unknown'}`));
		});
	});
}

await runVueTsc();
console.log('Generated Vue declaration files');
