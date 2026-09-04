import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const nextManifest = require('next/package.json');
const nextCli = require.resolve('next/dist/bin/next');
const major = Number.parseInt(nextManifest.version.split('.')[0], 10);
if (!Number.isSafeInteger(major)) {
	throw new Error(`Could not parse installed Next.js version ${nextManifest.version}.`);
}

// Next 16 defaults to Turbopack. This fixture intentionally exercises the
// supported webpack path for the accepted Next/Webpack source-navigation gate.
const result = spawnSync(
	process.execPath,
	[nextCli, 'build', ...(major >= 16 ? ['--webpack'] : [])],
	{
		stdio: 'inherit'
	}
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
