import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const slug = (params.slug ?? '').replace(/^\/+|\/+$/g, '');
	const targetSlug = slug === 'index' || slug === 'docs' ? '' : slug;

	const modules = import.meta.glob('/src/routes/docs/**/*.svx', {
		query: '?raw',
		import: 'default',
		eager: true
	});

	let content = '';
	let found = false;

	for (const [path, fileContent] of Object.entries(modules)) {
		const normalizedPath = path
			.replace('/src/routes/docs', '')
			.replace('/+page.svx', '')
			.replace(/^\/+/, '');

		if (normalizedPath === targetSlug) {
			content = fileContent as string;
			found = true;
			break;
		}
	}

	if (!found) {
		throw error(404, 'Document not found');
	}

	return new Response(content, {
		headers: {
			'Content-Type': 'text/markdown; charset=utf-8',
			'Cache-Control': 'public, max-age=60',
			'X-Robots-Tag': 'noindex, nofollow'
		}
	});
};
