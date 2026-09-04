<script lang="ts">
	import { defineMaterial } from 'spektral/svelte';

	const material = defineMaterial({
		fragment: 'fn frag(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'
	});
</script>

<p data-packed-consumer="sveltekit">{material.fragment.length}</p>
