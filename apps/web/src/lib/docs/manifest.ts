import type { DocItem } from '../types/doc';
import { docsNavigation } from '$lib/config/navigation';

function flattenManifest(items: DocItem[], category?: string): DocItem[] {
	return items.reduce<DocItem[]>((acc, item) => {
		if (item.items) {
			acc.push(...flattenManifest(item.items, item.name));
		} else {
			acc.push({ ...item, category: item.category ?? category });
		}
		return acc;
	}, []);
}

export const docsManifest: DocItem[] = flattenManifest(docsNavigation);

export const getDocBySlug = (slug: string) => {
	return docsManifest.find((doc) => doc.slug === slug);
};

export const getDocHref = (slug: string) => {
	return slug ? `/docs/${slug}` : '/docs';
};

export const getAdjacentDocs = (slug: string) => {
	const index = docsManifest.findIndex((doc) => doc.slug === slug);
	if (index === -1) {
		return { previous: null, next: null };
	}
	const previous = index > 0 ? docsManifest[index - 1] : null;
	const next = index < docsManifest.length - 1 ? docsManifest[index + 1] : null;
	return { previous, next };
};
