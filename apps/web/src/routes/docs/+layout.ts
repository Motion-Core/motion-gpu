import type { LayoutLoad } from './$types';
import { getAdjacentDocs, getDocBySlug, getDocTocHeadings } from '$lib/docs/manifest';
import { getDocMetadata } from '$lib/docs/metadata';

function pathToSlug(pathname: string): string {
	const normalized = pathname.replace(/\/+$/, '');
	if (normalized === '/docs' || normalized === '') return '';
	return normalized.replace(/^\/docs\//, '');
}

export const load: LayoutLoad = ({ url }) => {
	const slug = pathToSlug(url.pathname);
	const currentDoc = getDocBySlug(slug);
	const { previous, next } = getAdjacentDocs(slug);
	const metadata = getDocMetadata(url.pathname);
	const tocHeadings = getDocTocHeadings(slug);

	return {
		slug,
		metadata,
		currentDoc: {
			...currentDoc,
			title: metadata?.title ?? currentDoc?.name ?? 'Untitled',
			description: metadata?.description ?? ''
		},
		previousDoc: previous,
		nextDoc: next,
		tocHeadings,
		docOrigin: url.origin
	};
};
