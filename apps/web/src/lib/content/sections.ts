import type { ContentItem, ContentSectionLink } from '$lib/config/navigation';
import { contentSections, type ContentSectionConfig } from '$lib/config/navigation';
import { mergeSectionUiConfig, type SectionUiConfig } from '$lib/config/content-ui';
import { parseContentSource } from '$lib/content/frontmatter';
import {
	flattenNavigationToManifest,
	getAdjacentItems,
	getHref,
	getItemBySlug
} from '$lib/content/manifest';
import GithubSlugger from 'github-slugger';
import type { Component } from 'svelte';

export type ContentSectionId = string;

export type ContentMetadata = {
	href: string;
	slug: string;
	title: string;
	description?: string;
	sourceType: 'svx' | 'svelte';
};

export type ContentTocHeading = {
	id: string;
	text: string;
	level: number;
};

export type ContentModule = {
	default: Component;
	metadata?: Record<string, unknown>;
};

function basePathFor(id: string): string {
	return `/${id}`;
}

const contentSectionsById = Object.fromEntries(
	contentSections.map((section) => [section.id, section])
) as Record<ContentSectionId, ContentSectionConfig>;

const contentSectionOrder: ContentSectionId[] = contentSections.map((section) => section.id);

const contentManifests = Object.fromEntries(
	contentSections.map((section) => [section.id, flattenNavigationToManifest(section.navigation)])
) as Record<ContentSectionId, ContentItem[]>;

const allSvxRaw = import.meta.glob<string>('/src/lib/content/**/*.svx', {
	query: '?raw',
	eager: true,
	import: 'default'
});

const allSvxModules = import.meta.glob<ContentModule>('/src/lib/content/**/*.svx', {
	eager: true
});

const allSvelteModules = import.meta.glob<ContentModule>('/src/lib/content/**/*.svelte', {
	eager: true
});

const allSvelteMetadatas = import.meta.glob<Record<string, unknown>>(
	'/src/lib/content/**/*.svelte',
	{
		eager: true,
		import: 'metadata'
	}
);

function toBaseKey(sectionId: string, slug: string): string {
	const filename = slug === '' ? 'index' : slug;
	return `/src/lib/content/${sectionId}/${filename}`;
}

function toDirectoryIndexKey(sectionId: string, slug: string): string {
	return `/src/lib/content/${sectionId}/${slug}/index`;
}

function findSvxKey(sectionId: string, slug: string): string | null {
	const svxKey = `${toBaseKey(sectionId, slug)}.svx`;
	if (Object.prototype.hasOwnProperty.call(allSvxModules, svxKey)) return svxKey;
	if (!slug) return null;
	const directoryIndexKey = `${toDirectoryIndexKey(sectionId, slug)}.svx`;
	return Object.prototype.hasOwnProperty.call(allSvxModules, directoryIndexKey)
		? directoryIndexKey
		: null;
}

function findSvelteKey(sectionId: string, slug: string): string | null {
	const svelteKey = `${toBaseKey(sectionId, slug)}.svelte`;
	if (Object.prototype.hasOwnProperty.call(allSvelteModules, svelteKey)) return svelteKey;
	if (!slug) return null;
	const directoryIndexKey = `${toDirectoryIndexKey(sectionId, slug)}.svelte`;
	return Object.prototype.hasOwnProperty.call(allSvelteModules, directoryIndexKey)
		? directoryIndexKey
		: null;
}

export function getContentSectionConfig(sectionId: ContentSectionId) {
	return contentSectionsById[sectionId];
}

export function getContentSectionUiConfig(sectionId: ContentSectionId): SectionUiConfig {
	return mergeSectionUiConfig(contentSectionsById[sectionId].ui);
}

export function getContentSectionLinks(order: ContentSectionId[] = contentSectionOrder) {
	return order.map((sectionId): ContentSectionLink => {
		const section = contentSectionsById[sectionId];
		return {
			label: section.label,
			href: basePathFor(section.id),
			icon: section.icon,
			description: section.description
		};
	});
}

export function getContentSectionManifest(sectionId: ContentSectionId) {
	return contentManifests[sectionId];
}

export function getContentSectionSlug(sectionId: ContentSectionId, pathname: string) {
	return pathToSlug(basePathFor(sectionId), pathname);
}

export function getContentSectionMetadata(
	sectionId: ContentSectionId,
	pathname: string
): ContentMetadata | null {
	const section = contentSectionsById[sectionId];
	const normalizedPath = normalizePath(pathname);
	const slug = pathToSlug(basePathFor(sectionId), normalizedPath);
	const svxKey = findSvxKey(sectionId, slug);
	const svelteKey = findSvelteKey(sectionId, slug);

	if (!svxKey && !svelteKey) {
		return null;
	}

	const navItem = getItemBySlug(contentManifests[sectionId], slug);
	const fallbackTitle = slugToTitle(slug) || section.label;
	let title = navItem?.name ?? fallbackTitle;
	let description: string | undefined;
	const sourceType: ContentMetadata['sourceType'] = svxKey ? 'svx' : 'svelte';

	if (svxKey) {
		const rawSource = allSvxRaw[svxKey];
		const { metadata } = parseContentSource(rawSource);
		title = metadata.name ?? metadata.title ?? title;
		description = metadata.description;
	} else if (svelteKey) {
		const meta = allSvelteMetadatas[svelteKey];
		title =
			(typeof meta.name === 'string' ? meta.name : undefined) ??
			(typeof meta.title === 'string' ? meta.title : undefined) ??
			title;
		description = typeof meta.description === 'string' ? meta.description : undefined;
	}

	return {
		href: normalizedPath,
		slug,
		title,
		description,
		sourceType
	};
}

export function getContentSectionModule(
	sectionId: ContentSectionId,
	slug: string
): ContentModule | null {
	const svxKey = findSvxKey(sectionId, slug);
	if (svxKey) {
		return allSvxModules[svxKey] ?? null;
	}

	const svelteKey = findSvelteKey(sectionId, slug);
	if (svelteKey) {
		return allSvelteModules[svelteKey] ?? null;
	}

	return null;
}

export function getContentSectionRawSource(
	sectionId: ContentSectionId,
	slug: string
): string | null {
	const svxKey = findSvxKey(sectionId, slug);
	if (!svxKey) return null;
	return allSvxRaw[svxKey] ?? null;
}

export function getContentSectionTocHeadings(
	sectionId: ContentSectionId,
	slug: string,
	selector: string
): ContentTocHeading[] {
	const rawSource = getContentSectionRawSource(sectionId, slug);
	if (!rawSource) return [];

	const { body } = parseContentSource(rawSource);
	return extractTocHeadings(body, selector);
}

export function getContentSectionItemBySlug(sectionId: ContentSectionId, slug: string) {
	return getItemBySlug(contentManifests[sectionId], slug);
}

export function getContentSectionAdjacentItems(sectionId: ContentSectionId, slug: string) {
	return getAdjacentItems(contentManifests[sectionId], slug);
}

export function getContentSectionHref(sectionId: ContentSectionId, slug: string) {
	return getHref(basePathFor(sectionId), slug);
}

export function getContentSectionRawHref(sectionId: ContentSectionId, slug: string) {
	const prefix = basePathFor(sectionId);
	const normalizedSlug = slug || 'index';
	return `${prefix}/raw/${normalizedSlug}`;
}

export function getContentSectionByPathname(pathname: string) {
	const normalized = normalizePath(pathname);
	const section = Object.values(contentSectionsById).find((s) => {
		const bp = basePathFor(s.id);
		return normalized === bp || normalized.startsWith(`${bp}/`);
	});
	return section ?? null;
}

function slugToTitle(slug: string) {
	return slug
		.split('/')
		.filter(Boolean)
		.map((segment) => segment.replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()))
		.join(' - ');
}

function normalizePath(path: string) {
	if (path === '/') return path;
	return path.replace(/\/+$/, '');
}

function pathToSlug(basePath: string, pathname: string) {
	const normalized = normalizePath(pathname);
	if (normalized === basePath || normalized === '') return '';
	return normalized.replace(new RegExp(`^${basePath}/`), '');
}

function extractHeadingLevels(selector: string) {
	const levels = new Set<number>();
	const headingRe = /\bh([1-6])\b/gi;
	let match: RegExpExecArray | null;

	while ((match = headingRe.exec(selector))) {
		levels.add(Number(match[1]));
	}

	return levels.size > 0 ? levels : new Set([2, 3]);
}

function decodeHtmlEntities(value: string) {
	const namedEntities: Record<string, string> = {
		amp: '&',
		lt: '<',
		gt: '>',
		quot: '"',
		apos: "'"
	};

	return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, raw: string) => {
		if (raw.startsWith('#')) {
			const radix = raw[1].toLowerCase() === 'x' ? 16 : 10;
			const codePoint = Number.parseInt(raw.slice(radix === 16 ? 2 : 1), radix);
			return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : entity;
		}

		return namedEntities[raw.toLowerCase()] ?? entity;
	});
}

function normalizeHeadingText(rawText: string) {
	return decodeHtmlEntities(
		rawText
			.replace(/\s+#+\s*$/g, '')
			.replace(/\\([\\`*_[\]{}()#+.!|-])/g, '$1')
			.replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
			.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
			.replace(/`([^`]*)`/g, '$1')
			.replace(/<[^>]+>/g, '')
			.replace(/\{([^{}]*)\}/g, '$1')
			.replace(/[*_~]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

function extractTocHeadings(source: string, selector: string): ContentTocHeading[] {
	const levels = extractHeadingLevels(selector);
	const slugger = new GithubSlugger();
	const headings: ContentTocHeading[] = [];
	let inFence = false;

	for (const line of source.split(/\r?\n/)) {
		if (/^\s*(```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}

		if (inFence) continue;

		const match = /^( {0,3})(#{1,6})\s+(.+?)\s*$/.exec(line);
		if (!match) continue;

		const level = match[2].length;
		if (!levels.has(level)) continue;

		const text = normalizeHeadingText(match[3]);
		if (!text) continue;

		headings.push({
			id: slugger.slug(text),
			text,
			level
		});
	}

	return headings;
}
