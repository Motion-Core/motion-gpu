/**
 * Tracks reactive pointer options from a Svelte component context.
 */
export function watchPointerOptions(update: () => void): void {
	$effect(update);
}
