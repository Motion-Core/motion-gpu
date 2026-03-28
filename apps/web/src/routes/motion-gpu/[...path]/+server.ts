import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

const PKG_ROOT = resolve('node_modules/@motion-core/motion-gpu');

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

export const GET: RequestHandler = async ({ params }) => {
	const filePath = params.path;
	if (!filePath) throw error(400, 'Missing path');

	// Prevent directory traversal
	if (filePath.includes('..')) throw error(400, 'Invalid path');

	const basePath = resolve(PKG_ROOT, filePath);
	if (!basePath.startsWith(PKG_ROOT)) throw error(403, 'Forbidden');

	const absolute = await findFile(basePath);
	if (!absolute || !absolute.startsWith(PKG_ROOT)) throw error(404, `File not found: ${filePath}`);

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
