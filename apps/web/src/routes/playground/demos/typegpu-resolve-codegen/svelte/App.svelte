<script lang="ts">
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';
	import { fragment } from '../shader';

	const material = defineMaterial({
		fragment
	});
</script>

<FragCanvas {material} outputColorSpace="linear" dpr={1.0} />
