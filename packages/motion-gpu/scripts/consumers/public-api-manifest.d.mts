export interface PublicApiManifestEntry {
	readonly runtime: readonly string[];
	readonly typeOnly: readonly string[];
}

export const publicApiManifest: Readonly<
	Record<
		| '.'
		| './advanced'
		| './core'
		| './core/advanced'
		| './react'
		| './react/advanced'
		| './svelte'
		| './svelte/advanced'
		| './vue'
		| './vue/advanced',
		PublicApiManifestEntry
	>
>;
