/**
 * Canonical site-level metadata shared across SEO tags, manifests, and feeds.
 * Keep this object project-specific when using the docs template for a new brand.
 */
export const siteConfig = {
	/** Primary site name used in titles and Open Graph site fields. */
	name: 'Motion GPU',
	/** Compact site name for environments with strict length limits. */
	shortName: 'Motion GPU Docs',
	/** Public canonical URL used to build absolute links. */
	url: 'https://motion-gpu.dev',
	/** Default SEO description for the homepage and fallback metadata. */
	description:
		'A WebGPU-first library for Svelte 5 and React 19. Build high-performance, GPU-accelerated visualizations with a declarative API, strict runtime contracts, and type-safe WGSL shaders.',
	/** Author shown in metadata and structured data. */
	author: 'Marek Jóźwiak',
	/** Primary SEO keywords for indexing and discovery. */
	keywords: [
		'webgpu',
		'svelte',
		'svelte 5',
		'react',
		'shaders',
		'wgsl',
		'graphics',
		'gpu',
		'visualization',
		'creative coding',
		'motion-gpu'
	],
	/** Default social preview image path. */
	ogImage: '/og-image.jpg',
	/** External profile links used by docs actions and metadata. */
	links: {
		github: 'https://github.com/motion-core/motion-gpu',
		twitter: 'https://x.com/madebyhex'
	},
	package: {
		name: '@motion-core/motion-gpu'
	}
};

/** Inferred type for strongly-typed consumers of `siteConfig`. */
export type SiteConfig = typeof siteConfig;
