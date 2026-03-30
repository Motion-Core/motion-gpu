import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
let pkg_root: Promise<string> | null = null;

const MIME: Record<string, string> = {
	'.js': 'application/javascript',
	'.mjs': 'application/javascript',
	'.json': 'application/json',
	'.svelte': 'text/plain',
	'.ts': 'text/plain',
	'.map': 'application/json'
};

const EXTENSIONS = ['', '.js', '.mjs', '.ts', '/index.js', '/index.mjs'];

async function findFile(basePath: string): Promise<string | null> {
	for (const ext of EXTENSIONS) {
		const candidate = basePath + ext;
		try {
			await access(candidate);
			return candidate;
		} catch {
			// try next
		}
	}
	return null;
}

async function resolve_pkg_root(): Promise<string> {
	if (pkg_root) return pkg_root;

	pkg_root = (async () => {
		const candidates: string[] = [
			resolve('node_modules/@motion-core/motion-gpu'),
			resolve('apps/web/node_modules/@motion-core/motion-gpu'),
			resolve('packages/motion-gpu')
		];

		for (const candidate of candidates) {
			try {
				await access(resolve(candidate, 'package.json'));
				return candidate;
			} catch {
				// try next
			}
		}

		throw new Error('Could not locate @motion-core/motion-gpu package root');
	})();

	return pkg_root;
}

export const GET: RequestHandler = async ({ params }) => {
	const filePath = params.path;
	if (!filePath) throw error(400, 'Missing path');

	// Prevent directory traversal
	if (filePath.includes('..')) throw error(400, 'Invalid path');

	let pkg_root_path: string;
	try {
		pkg_root_path = await resolve_pkg_root();
	} catch {
		// Some runtimes (e.g. deployed Workers) cannot read local node_modules.
		throw error(404, `File not found: ${filePath}`);
	}
	const basePath = resolve(pkg_root_path, filePath);
	if (!basePath.startsWith(pkg_root_path)) throw error(403, 'Forbidden');

	const absolute = await findFile(basePath);
	if (!absolute || !absolute.startsWith(pkg_root_path))
		throw error(404, `File not found: ${filePath}`);

	try {
		const contents = await readFile(absolute);
		const ext = '.' + absolute.split('.').pop();
		const mime = MIME[ext] ?? 'application/octet-stream';

		return new Response(contents, {
			headers: {
				'Content-Type': mime,
				'Access-Control-Allow-Origin': '*',
				'Cache-Control': 'no-cache'
			}
		});
	} catch {
		throw error(404, `File not found: ${filePath}`);
	}
};
