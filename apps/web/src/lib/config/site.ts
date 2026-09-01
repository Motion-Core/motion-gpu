/**
 * Canonical site-level metadata shared across SEO tags, manifests, and feeds.
 * Keep this object project-specific when using the docs template for a new brand.
 */
export const siteConfig = {
	/** Primary site name used in titles and Open Graph site fields. */
	name: 'Spektral',
	/** Compact site name for environments with strict length limits. */
	shortName: 'Spektral Docs',
	/** Public canonical URL used to build absolute links. */
	url: 'https://spektral.dev',
	/** Default SEO description for the homepage and fallback metadata. */
	description:
		'A minimalist WebGPU framework for Svelte 5, React 19, and Vue 3. Build high-performance, GPU-accelerated visualizations with a declarative API, strict runtime contracts, and type-safe WGSL shaders.',
	/** Author shown in metadata and structured data. */
	author: 'Marek Jóźwiak',
	/** Primary SEO keywords for indexing and discovery. */
	keywords: [
		'webgpu',
		'svelte',
		'svelte 5',
		'react',
		'vue',
		'shaders',
		'wgsl',
		'graphics',
		'gpu',
		'visualization',
		'creative coding',
		'spektral'
	],
	/** Default social preview image endpoint. */
	ogImage: '/og',
	/** Browser chrome colors synchronized with the light and dark inset surfaces. */
	themeColor: {
		light: '#f0f0f1',
		dark: '#121418'
	},
	/** External profile links used by docs actions and metadata. */
	links: {
		github: 'https://github.com/kaltwrk/spektral',
		twitter: 'https://x.com/madebyhex'
	},
	/** Package metadata used in installation snippets and docs helpers. */
	package: {
		name: 'spektral'
	}
};

/** Inferred type for strongly-typed consumers of `siteConfig`. */
export type SiteConfig = typeof siteConfig;
