<script lang="ts">
	//
	// Shader by @madebyhex
	// Licensed under CC BY-NC-SA 4.0
	// SPDX-License-Identifier: CC-BY-NC-SA-4.0
	//
	import { FragCanvas, defineMaterial } from '@motion-core/motion-gpu/svelte';
	import { fragment } from '../shader';

	const material = defineMaterial({
		fragment
	});
</script>

<FragCanvas {material} outputColorSpace="linear" dpr={1.0} />
